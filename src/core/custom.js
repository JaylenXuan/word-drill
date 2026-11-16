// 生词本：用户自己录入的词，独立存储，不依赖任何词库。
//
// 存储位置：localStorage 的 vocab.v1/custom
// 为什么和 state 分开：state 每评一次分就整体重写，词条文本放进去会让每次写盘变大，
// 而它只在「新增 / 编辑 / 删除」时才变。

export const CUSTOM_KEY = 'vocab.v1/custom';
export const MAX_WORD_CHARS = 60;
export const MAX_PHRASE_WORDS = 6;
export const CUSTOM_DECK_ID = 'custom';

/** 判断一个 wordId 是不是生词 */
export function isCustomId(id) {
  return String(id || '').startsWith('my-');
}

/**
 * 归一化：全角转半角 → 去首尾空白 → 连续空格合一 → 去首尾标点 → 小写。
 * 只用于「是不是同一个词」的判断，不改用户输入的原文。
 */
export function normalizeWord(input) {
  const half = String(input || '').replace(/[\uff01-\uff5e]/g, (ch) => (
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  ));
  return half
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .toLowerCase();
}

/** 校验用户输入，返回 { ok, word, meaning, error } */
export function validateEntry({ word, meaning }) {
  const w = String(word || '').trim().replace(/\s+/g, ' ');
  const m = String(meaning || '').trim();
  if (!w) return { ok: false, error: '单词还没填' };
  if (w.length > MAX_WORD_CHARS) return { ok: false, error: `单词/短语最多 ${MAX_WORD_CHARS} 个字符` };
  const words = normalizeWord(w).split(' ').filter(Boolean);
  if (words.length > MAX_PHRASE_WORDS) return { ok: false, error: `短语最多 ${MAX_PHRASE_WORDS} 个词` };
  if (!m) return { ok: false, error: '释义还没填' };
  if (m.length > 300) return { ok: false, error: '释义太长了（上限 300 字）' };
  return { ok: true, word: w, meaning: m };
}

/** 生成 wordId：my-<时间戳36进制>-<2位随机>，唯一、可按时间排序、不依赖计数器 */
export function makeCustomId(now = Date.now(), rand = Math.random) {
  const tail = Math.floor(rand() * 1296).toString(36).padStart(2, '0');
  return `my-${now.toString(36)}-${tail}`;
}

export function emptyStore() {
  return { version: 1, words: {} };
}

/** 补齐/校验外部读进来的数据 */
export function normalizeStore(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.words !== 'object' || !raw.words) return emptyStore();
  const words = {};
  for (const [id, v] of Object.entries(raw.words)) {
    if (!v || typeof v !== 'object') continue;
    const word = String(v.word || '').trim();
    const meaning = String(v.meaning || '').trim();
    if (!word || !meaning) continue;
    words[id] = {
      id,
      word,
      meaning,
      phonetic: String(v.phonetic || '').trim(),
      createdAt: v.createdAt || null,
      updatedAt: v.updatedAt || null,
    };
  }
  return { version: 1, words };
}

/** 按归一化后的词找同一条 */
export function findByWord(store, word) {
  const key = normalizeWord(word);
  if (!key) return null;
  for (const entry of Object.values(store.words)) {
    if (normalizeWord(entry.word) === key) return entry;
  }
  return null;
}

/** 找「只差一个常见词尾」的已有词（analyse / analysed），只提示不阻止 */
export function findSuffixSibling(store, word) {
  const key = normalizeWord(word);
  if (!key) return null;
  for (const entry of Object.values(store.words)) {
    const other = normalizeWord(entry.word);
    if (other === key) continue;
    const [short, long] = other.length < key.length ? [other, key] : [key, other];
    if (long.length - short.length > 4) continue;
    if (!long.startsWith(short)) continue;
    if (/^(s|es|ed|d|ing|er|est)$/.test(long.slice(short.length))) return entry;
  }
  return null;
}

/** 生词本里已经用了几个今天的名额 */
export function countAddedToday(state, today) {
  return Number(state?.daily?.[today]?.customAdded) || 0;
}

export function dailyLimit(config) {
  const n = Number(config?.dailyNewTarget);
  return Number.isFinite(n) && n > 0 ? n : 20;
}
