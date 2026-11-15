// 学习会话队列（纯逻辑，可单测）
//
// 一次会话 = 一串待学/待复习的词 id + 一个游标。
// 「不认识」的词会重新排到队尾再看一次（只存在内存里，不影响调度），
// 但同一张卡最多重排 MAX_RECYCLE 次，避免一直点不认识导致死循环。

export const MAX_RECYCLE = 2;

/** 新建会话。mode: 'learn' 学新词 | 'review' 复习到期 */
export function buildSession(mode, wordIds) {
  return {
    mode,
    queue: wordIds.map((id) => ({ id, requeues: 0 })),
    index: 0,
    graded: 0,
    againCount: 0,
  };
}

export function isFinished(session) {
  return session.index >= session.queue.length;
}

export function currentItem(session) {
  return isFinished(session) ? null : session.queue[session.index];
}

/** 剩余张数（含重排进来的） */
export function remaining(session) {
  return Math.max(0, session.queue.length - session.index);
}

/**
 * 记录一次评分并推进游标。
 * 就地修改 session，返回 { requeued }。
 */
export function gradeSession(session, grade) {
  const item = currentItem(session);
  if (!item) return { requeued: false };
  session.graded += 1;
  if (grade === 'again') session.againCount += 1;
  session.index += 1;

  let requeued = false;
  if (grade === 'again' && item.requeues < MAX_RECYCLE) {
    session.queue.push({ id: item.id, requeues: item.requeues + 1 });
    requeued = true;
  }
  return { requeued };
}

/** 会话结束时的粗略统计（精确的今日数字以 state.daily 为准） */
export function sessionSummary(session) {
  return {
    total: session.queue.length,
    graded: session.graded,
    again: session.againCount,
    unique: new Set(session.queue.map((q) => q.id)).size,
  };
}
