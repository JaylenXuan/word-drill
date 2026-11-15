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
 */
export function buildReviewQueue(cards, today = todayKey()) {
  return Object.values(cards)
    .filter((c) => c && c.state !== 'new' && c.due <= today)
    .sort((a, b) => {
      if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      return (b.lapses || 0) - (a.lapses || 0);
    })
    .map((c) => c.wordId);
}

/** 错词本：最近一次评分是「不认识」，或累计错 >= 2 次 */
export function buildMistakeList(cards, minLapses = 2) {
  return Object.values(cards)
    .filter((c) => c && c.state !== 'new' && (c.lastGrade === 'again' || (c.lapses || 0) >= minLapses))
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
