// 一次评分的完整业务动作：算下次到期 + 更新卡片 + 记当天计数。
// 拆出来是为了让「学习会话」「复习」「模拟测试」共用同一段逻辑，不出现两份真相。
// 注意：会就地修改 state（调用方负责 save），返回日志由调用方负责 append。

import { todayKey } from './dates.js';
import { createCard, schedule } from './scheduler.js';

export function applyGrade(state, grade, wordId, today = todayKey(), now = new Date()) {
  // 没建过卡片的词一律视为新词：只在第一次评分时才落一张卡。
  // 这样 3632 词的词库，初始状态也只有几 KB，每次评分不必重写几百 KB。
  const card = state.cards[wordId] || createCard(wordId, state.config?.deckId || null, today);
  if (!card) throw new Error(`没有这张卡片：${wordId}`);

  const wasNew = card.state === 'new';
  const { card: next, log, requeue } = schedule(card, grade, today, now);
  state.cards[wordId] = next;

  if (!state.daily[today]) {
    // 当天第一次操作时冻结目标值：之后改设置不影响今天的打卡判定
    state.daily[today] = {
      newLearned: 0,
      reviewsDone: 0,
      goalNew: Math.max(1, Number(state.config?.dailyNewTarget) || 10),
    };
  }
  const entry = state.daily[today];
  if (wasNew) entry.newLearned += 1;
  else entry.reviewsDone += 1;

  return { card: next, log, requeue, wasNew };
}
