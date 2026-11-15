// 把 hefengxian/my-ielts 的《雅思词汇真经》词表转换成本项目词库格式
//
// 用法：
//   node tools/import-ielts-bible.mjs          # 生成 data/decks/ielts-core.json
//   node tools/import-ielts-bible.mjs --dry    # 只打印统计，不写文件
//
// 数据来源：https://github.com/hefengxian/my-ielts
//   源文件：src/pages/vocabulary/vocabulary.js（仓库自己的 parser.py 生成物）
//   许可证：仓库未声明 LICENSE，仅作个人学习用途，不再分发。
// 映射规则（不做任何"美化"和补写，源里没有的字段一律留空）：
//   word      ← word 数组（英美拼写并列时用 " / " 连接）
//   phonetic  ← 源无此字段，留空
//   pos       ← pos
//   meaning   ← meaning
//   example   ← example
//   exampleZh ← 源无中文译文，留空
//   note      ← extra（搭配/派生词提示，源里的 "-" 视为空）
//   cat       ← 分类名（如 01_自然地理）
//   id        ← ielts0001 起递增

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const COMMIT = '5cef573933663c4673c6e0093f1df04e68018b1a';
const SOURCE_URL = `https://raw.githubusercontent.com/hefengxian/my-ielts/${COMMIT}/src/pages/vocabulary/vocabulary.js`;
const REPO = 'https://github.com/hefengxian/my-ielts';

const DRY = process.argv.includes('--dry');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 从 vocabulary.js 里抠出 JSON 对象 */
function parseSource(js) {
  const start = js.indexOf('{');
  const end = js.lastIndexOf('}');
  if (start < 0 || end < 0) throw new Error('没找到 JSON 对象，源文件结构可能变了');
  return JSON.parse(js.slice(start, end + 1));
}

const clean = (s) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const cleanCell = (s) => {
  const v = clean(s);
  return v === '-' ? '' : v;
};

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`下载源文件失败：HTTP ${res.status}`);
const js = await res.text();
console.log(`源文件 ${(js.length / 1024).toFixed(0)} KB（commit ${COMMIT.slice(0, 7)}）`);

const raw = parseSource(js);
const categories = Object.keys(raw);
console.log(`分类 ${categories.length} 个：${categories.join('、')}`);

const all = [];
for (const catKey of categories) {
  const cat = raw[catKey];
  const label = cat.label || catKey;
  for (const group of cat.words || []) {
    for (const w of group) {
      all.push({
        srcId: w.id,
        word: (w.word || []).map(clean).filter(Boolean).join(' / '),
        pos: cleanCell(w.pos),
        meaning: cleanCell(w.meaning),
        example: clean(w.example),
        exampleZh: '', // 源无中文译文
        phonetic: '', // 源无音标
        note: cleanCell(w.extra),
        cat: label,
      });
    }
  }
}

// ---- 去重：同一个词只保留一条；若先出现的那条释义为空而后面有，则用后面的 ----
const byKey = new Map();
let dupCount = 0;
let dupMerged = 0;
for (const w of all) {
  const key = w.word.toLowerCase();
  if (!key) continue;
  if (!byKey.has(key)) {
    byKey.set(key, w);
    continue;
  }
  dupCount += 1;
  const kept = byKey.get(key);
  if (!kept.meaning && w.meaning) {
    byKey.set(key, { ...w, note: [kept.note, w.note].filter(Boolean).join('；') });
    dupMerged += 1;
  }
}

const words = [...byKey.values()].map((w, i) => ({
  id: `ielts${String(i + 1).padStart(4, '0')}`,
  word: w.word,
  phonetic: w.phonetic,
  pos: w.pos,
  meaning: w.meaning,
  example: w.example,
  exampleZh: w.exampleZh,
  note: w.note,
  cat: w.cat,
}));

// ---- 统计 ----
const empty = (f) => words.filter((w) => !w[f]).length;
const multi = words.filter((w) => w.word.includes(' / ')).length;
const stats = {
  源条目: all.length,
  去重后: words.length,
  重复条目: dupCount,
  其中补全释义的重复: dupMerged,
  空释义: empty('meaning'),
  空例句: empty('example'),
  空词性: empty('pos'),
  空音标: empty('phonetic'),
  多拼写词: multi,
  最长单词字符: Math.max(...words.map((w) => w.word.length)),
};
console.log('\n--- 统计 ---');
for (const [k, v] of Object.entries(stats)) console.log(`${k.padEnd(10, '　')} ${v}`);

const idDup = new Set(words.map((w) => w.id)).size !== words.length;
const wordDup = new Set(words.map((w) => w.word.toLowerCase())).size !== words.length;
console.log(`id 唯一：${!idDup}　word 唯一：${!wordDup}`);

const bad = words.filter((w) => !w.meaning || !w.word);
if (bad.length) console.log(`⚠ 有 ${bad.length} 条缺 word 或 meaning：`, bad.slice(0, 5));

if (DRY) {
  console.log('\n（--dry：未写文件）');
  console.log(JSON.stringify(words.slice(0, 3), null, 2));
  process.exit(0);
}

const deck = {
  id: 'ielts-core',
  name: '雅思词汇真经',
  tag: 'IELTS',
  desc: '刘洪波《雅思词汇真经》3674 词，按 22 个话题分类',
  version: 1,
  source: {
    repo: REPO,
    commit: COMMIT,
    file: 'src/pages/vocabulary/vocabulary.js',
    license: '仓库未声明 LICENSE，仅个人学习使用，不再分发',
    importedAt: new Date().toISOString().slice(0, 10),
    note: '源数据无音标与中文例句翻译，对应字段留空，未做任何补写',
  },
  words,
};

mkdirSync(path.join(ROOT, 'data/decks'), { recursive: true });
writeFileSync(path.join(ROOT, 'data/decks/ielts-core.json'), JSON.stringify(deck, null, 1) + '\n', 'utf8');
writeFileSync(
  path.join(ROOT, 'data/decks/_preview-100.json'),
  JSON.stringify({ ...deck, name: deck.name + '（前 100 词预览）', words: words.slice(0, 100) }, null, 1) + '\n',
  'utf8',
);

const size = JSON.stringify(deck).length;
console.log(`\n已写入 data/decks/ielts-core.json（${(size / 1024).toFixed(0)} KB，${words.length} 词）`);
console.log('已写入 data/decks/_preview-100.json（前 100 词，供格式确认）');
