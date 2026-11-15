// 离线模拟：用真实算法把 N 天学习跑一遍。
// 单测用它验证不变量（间隔不倒退、到期日不在过去、无 NaN）；
// 首页自检面板也用它展示「按当前设置，三个月后每天要复习多少张」。

import { addDays, todayKey } from './dates.js';
import { createCard } from './scheduler.js';
import { buildNewQueue, buildReviewQueue } from './queue.js';
import { applyGrade } from './review.js';
import { createInitialState } from './storage.js';
import { computeStreak } from './stats.js';

/** 确定性随机数（同一个 seed 结果永远一样，便于复现问题） */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function ran() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickGrade(r) {
  if (r < 0.12) return 'again';
  if (r < 0.37) return 'hard';
  return 'good';
}

/**
 * 模拟 days 天：每天学 target 个新词、做完所有到期复习。
 * @returns {{state, reviews, timeline, streak}}
 */
export function simulateDays({ words, days = 90, target = 10, seed = 42, startDate = todayKey() }) {
  const rand = mulberry32(seed);
  const state = createInitialState({ deckId: 'sim', dailyNewTarget: target });
  for (const w of words) state.cards[w.id] = createCard(w.id, 'sim', startDate);

  const reviews = [];
  const timeline = [];
  let date = startDate;

  for (let i = 0; i < days; i += 1) {
    // 每天 9:00 做一次（时间戳只影响日志，不影响调度）
    const now = new Date(`${date}T09:00:00`);
    const newIds = buildNewQueue(words, state.cards, state.config, state.daily, date);
    for (const id of newIds) {
      reviews.push(applyGrade(state, pickGrade(rand()), id, date, now).log);
    }

    const dueIds = buildReviewQueue(state.cards, date);
    for (const id of dueIds) {
      reviews.push(applyGrade(state, pickGrade(rand()), id, date, now).log);
    }

    const dayEntry = state.daily[date] || { newLearned: 0, reviewsDone: 0 };
    const intervals = Object.values(state.cards).map((c) => c.interval).filter((n) => n > 0);
    timeline.push({
      date,
      newLearned: dayEntry.newLearned,
      reviewsDone: dayEntry.reviewsDone,
      due: dueIds.length,
      avgInterval: intervals.length ? Math.round((intervals.reduce((a, b) => a + b, 0) / intervals.length) * 10) / 10 : 0,
    });
    date = addDays(date, 1);
  }

  return {
    state,
    reviews,
    timeline,
    streak: computeStreak(state.daily, addDays(date, -1)),
  };
}
