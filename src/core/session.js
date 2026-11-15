// 学习会话：分两段
//
//   main  —— 新词（或复习）主队列。开多少张就是多少张，只减不增。
//   retry —— 补考队列。只有「不认识」会进来，同一个词当天最多补考 MAX_RETRY 次。
//
// 这样「今日新词 10 个」永远是 10 个不同的词：补考既不占名额，也不增加主队列长度。

export const MAX_RETRY = 3;

/** mode: 'learn' 学新词 | 'review' 复习到期 | 'extra' 今天加练 */
export function buildSession(mode, wordIds) {
  return {
    mode,
    main: [...wordIds],
    mainIndex: 0,
    retry: [], // { id, tries }，tries 表示这是第几次补考
    retryIndex: 0,
    exhausted: 0, // 补考次数用尽、交给明天的词数
    graded: 0,
    againCount: 0,
  };
}

export function phase(session) {
  if (session.mainIndex < session.main.length) return 'main';
  if (session.retryIndex < session.retry.length) return 'retry';
  return 'done';
}

export function currentItem(session) {
  const p = phase(session);
  if (p === 'main') return { id: session.main[session.mainIndex], phase: 'main', tries: 0 };
  if (p === 'retry') {
    const r = session.retry[session.retryIndex];
    return { id: r.id, phase: 'retry', tries: r.tries };
  }
  return null;
}

export function isFinished(session) {
  return phase(session) === 'done';
}

/** 还剩几张卡（含补考）。只用于「还剩多少活」，不用于「学了几个词」。 */
export function remaining(session) {
  return (session.main.length - session.mainIndex) + (session.retry.length - session.retryIndex);
}

/** 进度：主队列按「已评分的不同词」推进，补考单独计数 */
export function progress(session) {
  return {
    phase: phase(session),
    mainDone: session.mainIndex,
    mainTotal: session.main.length,
    retryLeft: Math.max(0, session.retry.length - session.retryIndex),
    retryTotal: session.retry.length,
    exhausted: session.exhausted,
  };
}

/**
 * 记录一次评分并推进。
 * 「不认识」→ 进补考队列；补考满 MAX_RETRY 次后不再入队，交给明天按调度来。
 */
export function gradeSession(session, grade) {
  const item = currentItem(session);
  if (!item) return { requeued: false, exhausted: false };

  session.graded += 1;
  if (grade === 'again') session.againCount += 1;

  if (item.phase === 'main') session.mainIndex += 1;
  else session.retryIndex += 1;

  let requeued = false;
  let exhausted = false;
  if (grade === 'again') {
    if (item.tries < MAX_RETRY) {
      session.retry.push({ id: item.id, tries: item.tries + 1 });
      requeued = true;
    } else {
      session.exhausted += 1;
      exhausted = true;
    }
  }
  return { requeued, exhausted };
}

export function sessionSummary(session) {
  return {
    total: session.main.length,
    graded: session.graded,
    again: session.againCount,
    retryTotal: session.retry.length,
    exhausted: session.exhausted,
    unique: new Set([...session.main, ...session.retry.map((r) => r.id)]).size,
  };
}
