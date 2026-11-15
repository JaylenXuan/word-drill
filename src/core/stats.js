// 统计与连续天数（打卡）
// 打卡口径：当天「新词达标」即算打卡（复习是额外加分，不算欠账），
// 否则复习债一多，人就不敢打开 App 了。

import { addDays, daysBetween, todayKey } from './dates.js';

/** 某天是否达标。goalNew=0 的日子不算打卡（避免改设置刷出假连续） */
export function dayMet(entry) {
  return !!entry && Number(entry.goalNew) > 0 && Number(entry.newLearned) >= Number(entry.goalNew);
}

/**
 * 连续天数。
 * 今天还没达标不算断签（从昨天往前数），这样白天的进度条不会显示「连续 0 天」。
 */
export function computeStreak(daily = {}, today = todayKey()) {
  let cursor = dayMet(daily[today]) ? today : addDays(today, -1);
  let current = 0;
  while (dayMet(daily[cursor])) {
    current += 1;
    cursor = addDays(cursor, -1);
    if (current > 5000) break; // 防御：损坏数据防死循环
  }

  // 历史最长连续（含当前）
  const days = Object.keys(daily).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const d of days) {
    if (!dayMet(daily[d])) {
      run = 0;
      continue;
    }
    run = prev && daysBetween(prev, d) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = d;
  }
  return { current, best: Math.max(best, current) };
}

/** 首页那几个数字 */
export function overview({ cards, words, daily, today = todayKey(), dueCount = 0, newCount = 0 }) {
  const all = Object.values(cards || {});
  const learned = all.filter((c) => c && c.state !== 'new').length;
  const entry = daily?.[today] || { newLearned: 0, reviewsDone: 0, goalNew: 0 };
  const { current, best } = computeStreak(daily, today);
  return {
    learned,
    total: words?.length ?? all.length,
    todayNew: entry.newLearned,
    todayGoal: entry.goalNew,
    todayReviews: entry.reviewsDone,
    newCount,
    dueCount,
    streak: current,
    bestStreak: best,
  };
}

/** 近 N 天的新词/复习序列，给统计页画方块用（纯数据，UI 自己画） */
export function recentDays(daily = {}, today = todayKey(), n = 7) {
  const out = [];
  for (let i = n - 1; i >= 0; i -= 1) {
    const d = addDays(today, -i);
    const e = daily[d] || { newLearned: 0, reviewsDone: 0, goalNew: 0 };
    out.push({
      date: d,
      newLearned: Number(e.newLearned) || 0,
      reviewsDone: Number(e.reviewsDone) || 0,
      goalNew: Number(e.goalNew) || 0,
      met: dayMet(e),
    });
  }
  return out;
}
