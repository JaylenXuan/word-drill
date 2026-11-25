// 今日队列：决定「今天该学哪些新词」「今天该复习哪些卡」
// 纯函数，输入状态输出 id 数组，方便在 Node 里单测。

import { todayKey } from './dates.js';

/**
 * 今天还剩几个新词名额。
 * 学过的新词会立刻从 state='new' 变成 learning/review，所以只按「今天已学数」扣减。
 */
export function newQuota(config, daily, today = todayKey()) {
  const target = Math.max(0, Number(config?.dailyNewTarget) || 0);
  const done = Number(daily?.[today]?.newLearned) || 0;
  return Math.max(0, target - done);
}

/**
 * 今日新词队列：按词库原始顺序取，保证「同一批词」顺序稳定、不随机跳。
 * 已学过的词（state !== 'new'）不再进新词队列。
 */
export function buildNewQueue(words, cards, config, daily, today = todayKey()) {
  const quota = newQuota(config, daily, today);
  if (quota <= 0) return [];
  const out = [];
  for (const w of words) {
    const c = cards[w.id];
    if (!c || c.state === 'new') {
      out.push(w.id);
      if (out.length >= quota) break;
    }
  }
  return out;
}

/**
 * 今日复习队列：state 不是 new 且 due <= 今天。
 * 排序：到期日早的优先（欠得久的先还），同一天到期的按错误次数多的优先。
 *
 * opts.shuffle=true 时，只把「同一天到期」的那一段打乱——到期早的仍然排在前面，
 * 但每天开复习不会总是同一个顺序。opts.rand 可注入，方便测试。
 */
export function buildReviewQueue(cards, today = todayKey(), opts = {}) {
  const sorted = Object.values(cards)
    .filter((c) => c && c.state !== 'new' && c.due <= today)
    .sort((a, b) => {
      if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      return (b.lapses || 0) - (a.lapses || 0);
    });

  if (opts.shuffle) {
    const rand = typeof opts.rand === 'function' ? opts.rand : Math.random;
    let start = 0;
    while (start < sorted.length) {
      let end = start + 1;
      while (end < sorted.length && sorted[end].due === sorted[start].due) end += 1;
      // Fisher-Yates，只在这段内部换
      for (let i = end - 1; i > start; i -= 1) {
        const j = start + Math.floor(rand() * (i - start + 1));
        [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      }
      start = end;
    }
  }

  return sorted.map((c) => c.wordId);
}

/**
 * 错词本：还有没还清的错（lapses > 0）。
 * 答错 +1、答对 -1，减到 0 自动移出——错得多的词多答对几次才出得去。
 */
export function buildMistakeList(cards) {
  return Object.values(cards)
    .filter((c) => c && c.state !== 'new' && (c.lapses || 0) > 0)
    .sort((a, b) => {
      if ((b.lapses || 0) !== (a.lapses || 0)) return (b.lapses || 0) - (a.lapses || 0);
      return a.due < b.due ? -1 : 1;
    })
    .map((c) => c.wordId);
}

/** 明日预告：明天会有多少张到期 */
export function dueOn(cards, day) {
  return Object.values(cards).filter((c) => c && c.state !== 'new' && c.due === day).length;
}

/**
 * 今天评过「不认识」的词：退出会话后还能接着补考。
 * 注意 lastReviewedAt 是 UTC 字符串，必须转成本地日期再比，否则早上 8 点前会算成昨天。
 */
export function todayAgainIds(cards, today = todayKey()) {
  return Object.values(cards)
    .filter((c) => {
      if (!c || c.lastGrade !== 'again' || !c.lastReviewedAt) return false;
      return todayKey(new Date(c.lastReviewedAt)) === today;
    })
    .map((c) => c.wordId);
}
