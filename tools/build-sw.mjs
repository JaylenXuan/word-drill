// 生成 sw.js（预缓存清单 + 内容哈希版本号）。
// 改完任何前端文件后运行：node tools/build-sw.mjs
// 忘记运行会被 tests/run.mjs 抓出来（断言 sw.js 里的版本号 == 现场算出来的版本号）。

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT, PRECACHE, computeVersion } from './sw-manifest.mjs';

const VERSION = computeVersion();
const list = PRECACHE.map((p) => `  './${p}',`).join('\n');

const sw = `/* 自动生成，请勿手改。
 * 生成命令：node tools/build-sw.mjs
 * 版本号 = 预缓存清单里所有文件的 sha256 前 12 位，任何文件变化都会变。
 */
const VERSION = '${VERSION}';
const SHELL = 'shell-' + VERSION;
const RUNTIME = 'runtime-v1';
const NETWORK_TIMEOUT = 3500;

// 部署在子路径（/word-drill/）下，所有地址都以 scope 为基准拼
const abs = (p) => new URL(p, self.registration.scope).href;

const PRECACHE = [
  './',
${list}
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(PRECACHE.map(abs));
    await self.skipWaiting(); // 立即进入等待转激活，不用等旧页面全关
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

async function fromNetwork(request) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT);
  try {
    return await fetch(request, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：先试网络（拿到最新 HTML），超时或断网就用缓存的 index.html
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fromNetwork(request);
      } catch {
        const cache = await caches.open(SHELL);
        const cached = await cache.match(abs('./index.html'));
        return cached || Response.error();
      }
    })());
    return;
  }

  // 静态资源：先查预缓存，再查运行时缓存，都没有才走网络并顺手存下
  event.respondWith((async () => {
    const shell = await caches.open(SHELL);
    const hit = await shell.match(request, { ignoreSearch: true });
    if (hit) return hit;

    const runtime = await caches.open(RUNTIME);
    const runtimeHit = await runtime.match(request, { ignoreSearch: true });
    if (runtimeHit) return runtimeHit;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        event.waitUntil(runtime.put(request, response.clone()));
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
`;

const out = path.join(ROOT, 'sw.js');
writeFileSync(out, sw, 'utf8');
console.log(`[ok] sw.js 已生成  ${VERSION}  预缓存 ${PRECACHE.length} 个文件`);
