// 学习会话：分两段
//
//   main  —— 新词（或复习）主队列。开多少张就是多少张，只减不增。
//   retry —— 补考队列。「不认识」就进来，不设次数上限：点多少次不认识就重考多少次。
//
// 这样「今日新词 10 个」永远是 10 个不同的词：补考既不占名额，也不增加主队列长度。

/** mode: 'learn' 学新词 | 'review' 复习到期 | 'extra' 今天加练 */
export function buildSession(mode, wordIds) {
  return {
    mode,
    main: [...wordIds],
    mainIndex: 0,
    retry: [], // { id, tries }，tries 表示这是第几次补考
    retryIndex: 0,
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
  };
}

/**
 * 记录一次评分并推进。
 * 「不认识」→ 永远回到补考队列，直到用户自己点「模糊」或「认识」。
 */
export function gradeSession(session, grade) {
  const item = currentItem(session);
  if (!item) return { requeued: false };

  session.graded += 1;
  if (grade === 'again') session.againCount += 1;

  if (item.phase === 'main') session.mainIndex += 1;
  else session.retryIndex += 1;

  let requeued = false;
  if (grade === 'again') {
    session.retry.push({ id: item.id, tries: item.tries + 1 });
    requeued = true;
  }
  return { requeued };
}

export function sessionSummary(session) {
  return {
    total: session.main.length,
    graded: session.graded,
    again: session.againCount,
    retryTotal: session.retry.length,
    unique: new Set([...session.main, ...session.retry.map((r) => r.id)]).size,
  };
}
