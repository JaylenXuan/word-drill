// 把例句里粘着的整句中文翻译，搬进 exampleZh（只搬，不改写）
// 用法：node tools/split-example-zh.mjs [--dry]
//
// 规则（宁可少搬，也不搬错）：
//   1. 找到第一个中文字符，中文之前是英文句子、之后没有再出现成句的英文 → 判定为「尾部翻译」
//   2. 句内夹注（如 Hohhot(呼和浩特)、Chilli (红辣椒)）不动，列进报告
//   3. 只写 exampleZh / example 两个字段，不改任何中文内容、不翻译、不润色

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DECK = path.join(ROOT, 'data/decks/ielts-core.json');
const LOG = path.join(ROOT, 'docs/deck-zh-split.log');
const REPORT = path.join(ROOT, 'docs/deck-zh-leftover.md');
const DRY = process.argv.includes('--dry');

const CJK = /[\u4e00-\u9fa5]/;
const deck = JSON.parse(readFileSync(DECK, 'utf8'));

const moved = [];
const leftover = [];

for (const w of deck.words) {
  const ex = w.example || '';
  const i = ex.search(CJK);
  if (i < 0) continue;

  const before = ex.slice(0, i).replace(/[\s—－-]+$/, '').trim();
  const after = ex.slice(i).trim();
  const asciiAfter = (after.match(/[A-Za-z]{3,}/g) || []).length;
  const asciiBefore = (before.match(/[A-Za-z]{3,}/g) || []).length;

  if (asciiAfter <= 2 && asciiBefore >= 2) {
    // 已有 exampleZh 的（如果有）不覆盖，追加
    const nextZh = w.exampleZh ? `${w.exampleZh}\n${after}` : after;
    moved.push({ id: w.id, word: w.word, beforeExample: ex, afterExample: before, beforeZh: w.exampleZh || '', afterZh: nextZh });
    w.example = before;
    w.exampleZh = nextZh;
  } else {
    leftover.push({ id: w.id, word: w.word, ex });
  }
}

if (!DRY && moved.length) {
  writeFileSync(DECK, JSON.stringify(deck, null, 1) + '\n', 'utf8');
  const preview = { ...deck, name: `${deck.name}（前 100 词预览）`, words: deck.words.slice(0, 100) };
  writeFileSync(path.join(ROOT, 'data/decks/_preview-100.json'), JSON.stringify(preview, null, 1) + '\n', 'utf8');
}

let log = `# 例句中译搬运日志\n\n`;
log += `- 生成时间：${new Date().toISOString()}\n`;
log += `- 脚本：tools/split-example-zh.mjs\n`;
log += `- 搬运 ${moved.length} 条：只把例句尾部的整句中文移到 exampleZh，中文内容原样保留\n`;
log += `- 未处理 ${leftover.length} 条：中文夹在句子中间，拆分需要改写句子，留给你决定\n\n---\n`;
for (const m of moved) {
  log += `\n### ${m.id} · ${m.word}\n`;
  log += `- example 原值：${m.beforeExample}\n`;
  log += `- example 新值：${m.afterExample}\n`;
  log += `- exampleZh：${m.beforeZh ? `${JSON.stringify(m.beforeZh)} → ` : ''}${m.afterZh}\n`;
  log += `- 理由：中文是这句英文的整句翻译，原来粘在 example 里，搬进专用字段\n`;
}

let rep = `# 未能安全拆分的中文夹注（${leftover.length} 条）\n\n`;
rep += `中文出现在句子中间，通常是给某个词加注（如 \`Hohhot(呼和浩特)\`）。\n`;
rep += `拆出来会破坏句子结构，所以原样保留。\n\n`;
for (const l of leftover) rep += `- ${l.id} **${l.word}**｜${l.ex}\n`;

if (!DRY && moved.length) {
  writeFileSync(LOG, log, 'utf8');
  writeFileSync(REPORT, rep, 'utf8');
} else if (!DRY) {
  // 重复运行时不要覆盖已有日志
  if (!existsSync(LOG)) writeFileSync(LOG, log, 'utf8');
}

console.log(`搬运 ${moved.length} 条，未处理 ${leftover.length} 条`);
for (const l of leftover) console.log('  保留：', l.id, l.word, '｜', l.ex);
if (DRY) console.log('（--dry：未写入）');
else console.log(`日志 ${path.relative(ROOT, LOG)}\n报告 ${path.relative(ROOT, REPORT)}`);
