// 线上/本地页面检查器：起一个无头浏览器，跑一段脚本，截图，退出。
//
// 为什么要有它：之前每次验证都临时拼 Start-Process + 端口 + 临时 mjs，
// 反复踩两个坑：点击触发导航后 CDP 请求悬空；临时文件删了又写被文件检查拦。
// 这里把「开浏览器 → 等页面稳定 → 执行 → 截图 → 收尾」固定下来。
//
// 用法：
//   node tools/live-check.mjs <url>
//   node tools/live-check.mjs <url> --snippet foo.mjs --shot name
//   node tools/live-check.mjs <url> --script "document.title"
//
// snippet 文件里写一段表达式或语句，可用 await；返回值会被打印成 JSON。

import { spawn } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function parseArgs(argv) {
  const out = { url: null, snippet: null, script: null, shot: null, width: 390, height: 844, wait: 5000 };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--snippet') out.snippet = argv[++i];
    else if (a === '--script') out.script = argv[++i];
    else if (a === '--shot') out.shot = argv[++i];
    else if (a === '--width') out.width = Number(argv[++i]);
    else if (a === '--height') out.height = Number(argv[++i]);
    else if (a === '--wait') out.wait = Number(argv[++i]);
    else if (!a.startsWith('--')) out.url = a;
  }
  return out;
}

async function waitForDevtools(port, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return true;
    } catch {
      /* 还没起来 */
    }
    await sleep(200);
  }
  return false;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.url) {
    console.error('用法: node tools/live-check.mjs <url> [--snippet 文件] [--shot 名字]');
    process.exit(2);
  }

  const port = randomInt(9300, 9800);
  const profile = mkdtempSync(path.join(tmpdir(), 'dsh-live-'));
  const browser = spawn(EDGE, [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-crash-reporter',
    '--disable-breakpad',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    'about:blank',
  ], { stdio: 'ignore' });

  let ws;
  try {
    if (!(await waitForDevtools(port))) throw new Error('浏览器没有起来');

    const tab = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json();
    ws = new WebSocket(tab.webSocketDebuggerUrl);
    await new Promise((ok, err) => {
      ws.addEventListener('open', ok);
      ws.addEventListener('error', err);
    });

    const pending = new Map();
    let seq = 0;
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        pending.get(m.id)(m);
        pending.delete(m.id);
      }
    });
    const send = (method, params = {}, timeoutMs = 15000) => new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (pending.has(id)) { pending.delete(id); resolve({ timeout: true }); }
      }, timeoutMs);
    });

    await send('Page.enable');
    await send('Runtime.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: args.width, height: args.height, deviceScaleFactor: 2, mobile: true,
    });
    await send('Page.navigate', { url: args.url });
    await sleep(args.wait);

    const expr = args.snippet ? readFileSync(args.snippet, 'utf8') : (args.script || 'document.title');
    const r = await send('Runtime.evaluate', {
      expression: `(async () => { ${expr.includes('return') ? expr : `return (${expr});`} })()`,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.timeout) console.log('执行超时');
    else if (r.result?.exceptionDetails) console.log('执行报错:', r.result.exceptionDetails.text);
    else console.log(JSON.stringify(r.result?.result?.value, null, 2));

    if (args.shot) {
      await send('Runtime.evaluate', { expression: 'document.getAnimations().forEach(a=>{try{a.finish()}catch(e){}})' });
      await sleep(250);
      const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
      const dir = path.resolve('.shots');
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, `${args.shot}.png`);
      writeFileSync(file, Buffer.from(shot.result.data, 'base64'));
      console.log('截图:', file);
    }
  } finally {
    try { ws?.close(); } catch { /* ignore */ }
    browser.kill();
  }
}

main().catch((e) => {
  console.error('检查失败:', e.message);
  process.exit(1);
});
