// 间隔重复算法：简化版 SM-2（纯函数，不碰 DOM、不碰存储）
//
// 为什么是简化 SM-2 而不是 FSRS：
//   FSRS 需要 17+ 个权重和成百上千次真实评分来拟合，40~500 词阶段用不上；
//   简化 SM-2 每个间隔都能手算，出问题一行代码就能改。
// 但复习日志按 FSRS 需要的字段记录（grade/elapsedDays/prevInterval...），
// 将来换算法时只需改本文件、重算 due，卡片和日志不用迁移。

import { addDays, daysBetween, todayKey } from './dates.js';

export const MIN_EASE = 1.3;   // 难度因子下限
export const MAX_EASE = 2.8;   // 难度因子上限
export const MAX_INTERVAL = 365; // 间隔天数上限
export const GRADES = ['again', 'hard', 'good'];

// 三键对应的难度因子变化量
const EASE_DELTA = { again: -0.2, hard: -0.14, good: 0.1 };
// 评分配到 FSRS 兼容日志里的语义权重（仅记录，不影响调度）
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/**
 * 新建一张卡片的初始状态。
 * state='new' 表示还没学过（进「今日新词」队列），due 设为当天。
 */
export function createCard(wordId, deckId, today = todayKey()) {
  return {
    wordId,
    deckId,
    state: 'new',
    due: today,
    interval: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    lastGrade: null,
    lastReviewedAt: null,
  };
}

/** 认识：0→1→3→round(间隔×难度因子) */
function nextGoodInterval(prev, ease) {
  if (prev <= 0) return 1;
  if (prev === 1) return 3;
  return Math.max(prev + 1, Math.round(prev * ease));
}

/** 模糊：每天至少涨 1 天，避免卡在 1 天永远出不去 */
function nextHardInterval(prev) {
  if (prev <= 0) return 1;
  return Math.max(prev + 1, Math.round(prev * 1.2));
}

/**
 * 评分并计算下一次到期日。
 * @param {object} card  当前卡片
 * @param {'again'|'hard'|'good'} grade 不认识 / 模糊 / 认识
 * @param {string} today 今天（YYYY-MM-DD），测试时可注入
 * @param {Date}   now   用于日志时间戳
 * @returns {{card: object, log: object, requeue: boolean}}
 *          requeue=true 表示本场学习里应把它排到队尾再看一次（只存在内存队列）
 */
export function schedule(card, grade, today = todayKey(), now = new Date()) {
  if (!GRADES.includes(grade)) {
    throw new Error(`未知评分：${grade}（只支持 ${GRADES.join('/')}）`);
  }

  const prevInterval = card.interval || 0;
  const prevEase = card.ease ?? 2.5;
  const ease = clamp(Number((prevEase + EASE_DELTA[grade]).toFixed(2)), MIN_EASE, MAX_EASE);

  let interval;
  if (grade === 'again') interval = 1;
  else if (grade === 'hard') interval = nextHardInterval(prevInterval);
  else interval = nextGoodInterval(prevInterval, ease);
  interval = clamp(interval, 1, MAX_INTERVAL);

  const lastReviewedAt = now.toISOString();
  // lapses 记「还没还清的错」：答错 +1，答对 -1，最低 0。
  // 错词本用它来排优先级，也用来决定什么时候移出。
  const lapses = Math.max(0, (card.lapses || 0) + (grade === 'again' ? 1 : grade === 'good' ? -1 : 0));
  const next = {
    ...card,
    state: grade === 'again' ? 'learning' : 'review',
    due: addDays(today, interval),
    interval,
    ease,
    reps: (card.reps || 0) + 1,
    lapses,
    lastGrade: grade,
    lastReviewedAt,
  };

  // 与上次复习相隔的自然日（FSRS 拟合需要）
  const elapsedDays = card.lastReviewedAt
    ? Math.max(0, daysBetween(todayKey(new Date(card.lastReviewedAt)), today))
    : 0;

  const log = {
    wordId: card.wordId,
    at: lastReviewedAt,
    grade,
    mode: card.state === 'new' ? 'new' : 'review',
    elapsedDays,
    prevInterval,
    nextInterval: interval,
    prevEase,
    nextEase: ease,
  };

  return { card: next, log, requeue: grade === 'again' };
}

/** 预览：某张卡按各评分会变成几天后到期（给设置页的「算法说明」用） */
export function previewIntervals(card) {
  const today = todayKey();
  return GRADES.reduce((acc, g) => {
    acc[g] = schedule(card, g, today).card.interval;
    return acc;
  }, {});
}
