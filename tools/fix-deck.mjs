// 词库修订：只执行 tools/deck-fixes.json 里列出的条目
// 用法：
//   node tools/fix-deck.mjs --dry     # 只预览，不写文件
//   node tools/fix-deck.mjs           # 应用 + 写日志 + 出可疑清单
//
// 设计约束：
//   1. 每条修改必须有 find/replace，find 必须先命中当前文本，否则报错退出（不会改错位置）
//   2. 幂等：已经改过的条目会跳过，不会重复改
//   3. 只改 example / pos 两个字段，绝不碰 meaning / word

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DECK = path.join(ROOT, 'data/decks/ielts-core.json');
const FIXES = path.join(ROOT, 'tools/deck-fixes.json');
const LOG = path.join(ROOT, 'docs/deck-fixes.log');
const REPORT = path.join(ROOT, 'docs/deck-suspicious.md');
const DRY = process.argv.includes('--dry');

const deck = JSON.parse(readFileSync(DECK, 'utf8'));
const fixes = JSON.parse(readFileSync(FIXES, 'utf8'));
const byId = new Map(deck.words.map((w) => [w.id, w]));

const applied = [];
const skipped = [];
const errors = [];

for (const f of fixes) {
  const w = byId.get(f.id);
  if (!w) { errors.push(`找不到词条 ${f.id}`); continue; }
  if (!['example', 'pos'].includes(f.field)) { errors.push(`${f.id}: 不允许修改字段 ${f.field}`); continue; }
  const cur = w[f.field];
  if (typeof cur !== 'string') { errors.push(`${f.id}: 字段 ${f.field} 不是字符串`); continue; }

  // 幂等判断要分两种情况，否则两头都会出错：
  //   A. find 藏在 replace 里（wildernes ⊂ wilderness）：修完 find 仍在，
  //      如果先判 includes(find) 就会二次替换成 wildernesss。
  //      判断办法：把 replace 全部挖掉后，find 是否还在。
  //   B. find 里包含 replace（her her view ⊃ her view）：修完 find 消失，
  //      但句中本来就可能出现 replace（"her view has changed"），
  //      这时若按 A 的办法判会误判成"已修"，把重复词漏掉。
  // 所以只有 A 情况才做"挖掉 replace 再看"的检查。
  const replaceHidesFind = String(f.replace).includes(f.find);
  const stripped = replaceHidesFind ? cur.split(f.replace).join('') : cur;
  const needsFix = replaceHidesFind ? stripped.includes(f.find) : cur.includes(f.find);

  if (needsFix) {
    const next = cur.replace(f.find, f.replace);
    applied.push({ id: f.id, word: w.word, field: f.field, before: cur, after: next, type: f.type, reason: f.reason });
    w[f.field] = next;
  } else if (cur.toLowerCase().includes(String(f.replace).toLowerCase())) {
    skipped.push({ id: f.id, word: w.word, why: '已是修正后的文本' });
  } else {
    errors.push(`${f.id} (${w.word}): 在 ${f.field} 里找不到 "${f.find}"\n    现值：${cur}`);
  }
}

if (errors.length) {
  console.error('❌ 有 %d 条无法定位，未写入任何改动：', errors.length);
  for (const e of errors) console.error('  - ' + e);
  process.exit(1);
}

// ---------- 幂等自检：把同一套匹配再跑一遍，必须全部落空 ----------
const stillMatch = fixes.filter((f) => {
  const cur = byId.get(f.id)?.[f.field] || '';
  const hides = String(f.replace).includes(f.find);
  const stripped = hides ? cur.split(f.replace).join('') : cur;
  return hides ? stripped.includes(f.find) : cur.includes(f.find);
});
if (stillMatch.length) {
  console.error('❌ 幂等自检失败，这些条目还能被再次匹配（find 可能是 replace 的前缀）：');
  for (const f of stillMatch) console.error(`  - ${f.id} ${f.field}: "${f.find}" → "${f.replace}"`);
  process.exit(1);
}

// ---------- 写回词库 ----------
if (!DRY && applied.length) {
  writeFileSync(DECK, JSON.stringify(deck, null, 1) + '\n', 'utf8');
  // 预览文件跟着更新，避免「样例」与正式词库不一致
  const preview = { ...deck, name: `${deck.name}（前 100 词预览）`, words: deck.words.slice(0, 100) };
  writeFileSync(path.join(ROOT, 'data/decks/_preview-100.json'), JSON.stringify(preview, null, 1) + '\n', 'utf8');
}

// ---------- 日志 ----------
// 统计口径用「修订表」而不是「本次实际改动」，这样重复运行时报告不会变成 0
const byType = fixes.reduce((acc, f) => {
  acc[f.type] = (acc[f.type] || 0) + 1;
  return acc;
}, {});

let log = `# 词库修订日志\n\n`;
log += `- 生成时间：${new Date().toISOString()}\n`;
log += `- 脚本：tools/fix-deck.mjs（依据 tools/deck-fixes.json）\n`;
log += `- 词库：data/decks/ielts-core.json（${deck.words.length} 词）\n`;
log += `- 本次修改：**${applied.length} 条**（` + Object.entries(byType).map(([k, v]) => `${k} ${v}`).join('、') + `）\n`;
if (skipped.length) log += `- 跳过（已修过）：${skipped.length} 条\n`;
log += `\n> 只修三类：拼写错误、词性与词形不符、例句语法崩坏。\n> 不做措辞优化、不改释义、不改单词本身。\n\n---\n`;
for (const [type, count] of Object.entries(byType)) {
  log += `\n## ${type}（${count} 条）\n`;
  for (const a of applied.filter((x) => x.type === type)) {
    log += `\n### ${a.id} · ${a.word} · ${a.field}\n`;
    log += `- 原值：${a.before}\n`;
    log += `- 新值：${a.after}\n`;
    log += `- 理由：${a.reason}\n`;
  }
}

if (!DRY && applied.length) writeFileSync(LOG, log, 'utf8');

// ---------- 修订后复检：剩余可疑条目 ----------
const words = deck.words;
const remain = {
  '例句里混入中文': [],
  '释义里混入音标': [],
  '例句有重复词': [],
  '例句句首小写': [],
  '例句过短': [],
};

const TYPOS = ['valcano', 'adviced', 'brougt', 'discoverd', 'wildernes', 'ransform', 'callendar', 'incresing', 'joice', 'giveing', 'valable', 'Tigets', 'Preare', 'foresty', 'couterbalances', 'stome', 'ruinned', 'athelete', 'suitble', 'littel', 'Virture', 'Circumtances', 'grammer', 'designes', 'mable', 'demage', 'weted', 'milliion', 'portale', 'coffe', 'machanism', 'flurish', 'sesion', 'vise', 'demostration', 'hourse', 'Execuse', 'suprise', 'cabi', 'chancelllor', 'habbit', 'sare', 'suprised', 'mesurable', 'windowns', 'alway'];
const stillTypo = [];

for (const w of words) {
  const ex = w.example || '';
  if (/[\u4e00-\u9fa5]/.test(ex)) remain['例句里混入中文'].push(`${w.id} ${w.word}｜${ex}`);
  if (/\/[^/]*\//.test(w.meaning)) remain['释义里混入音标'].push(`${w.id} ${w.word}｜${w.meaning}`);
  if (/\b([A-Za-z]+)\s+\1\b/.test(ex)) remain['例句有重复词'].push(`${w.id} ${w.word}｜${ex}`);
  if (ex && /^[a-z]/.test(ex)) remain['例句句首小写'].push(`${w.id} ${w.word}｜${ex}`);
  if (ex && ex.trim().length < 15) remain['例句过短'].push(`${w.id} ${w.word}｜${ex}`);
  for (const t of TYPOS) if (new RegExp(`\\b${t}\\b`, 'i').test(ex)) stillTypo.push(`${w.id} ${w.word}｜${t}｜${ex}`);
}

let rep = `# 修订后复检：剩余可疑条目\n\n`;
rep += `修订表共 ${fixes.length} 条，词库 ${words.length} 词。\n\n`;
rep += `## 一、已修条目统计\n\n`;
rep += `| 类型 | 条数 |\n|---|---|\n`;
for (const [k, v] of Object.entries(byType)) rep += `| ${k} | ${v} |\n`;
rep += `\n明细见 [deck-fixes.log](./deck-fixes.log)。\n\n`;
rep += `## 二、必须立刻看的\n\n`;
rep += `- 已修拼写词表仍残留：**${stillTypo.length}** 条${stillTypo.length ? '\n' + stillTypo.map((x) => '  - ' + x).join('\n') : '（无）'}\n`;
rep += `\n## 三、待你确认（我没有自动改）\n\n`;
for (const [k, v] of Object.entries(remain)) {
  rep += `### ${k}：${v.length} 条\n\n`;
  for (const line of v) rep += `- ${line}\n`;
  rep += `\n`;
}
rep += `\n## 四、说明\n\n`;
rep += `- 「例句混入中文」不是拼写/词性/语法问题，属数据清洗。可以整体把中文部分移到 exampleZh，等你点头再做。\n`;
rep += `- 「释义混入音标」同理，属释义字段污染，需你确认是否清掉。\n`;
rep += `- 例句不带句末句号是全书统一风格（3555/3632 条），属排版而非错误，未改。\n`;

if (!DRY) writeFileSync(REPORT, rep, 'utf8');

// ---------- 控制台输出 ----------
console.log(`修改 ${applied.length} 条` + (skipped.length ? `，跳过已修 ${skipped.length} 条` : ''));
for (const [k, v] of Object.entries(byType)) console.log(`  ${k}：${v}`);
console.log(`残留已知拼写错误：${stillTypo.length}`);
for (const [k, v] of Object.entries(remain)) console.log(`待确认 · ${k}：${v.length}`);
if (DRY) console.log('（--dry：未写入任何文件）');
else console.log(`日志 ${path.relative(ROOT, LOG)}\n报告 ${path.relative(ROOT, REPORT)}`);
