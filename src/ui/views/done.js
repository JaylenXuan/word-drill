// 会话结束页：给一次正反馈，顺带预告明天要还多少
const MASCOT = 'assets/whale/whale-girl-transparent.png';

/** 按「这次干了什么 + 连续多少天」挑一句话，不超过 16 字 */
function pickLine({ mode, met, streak, newLearned, goal }) {
  if (mode === 'extra') return '加练过一遍，明天按调度再来。';
  if (mode === 'review') {
    return streak >= 3 ? `第 ${streak} 天。债清了。` : '债还完了，新词明天补也不迟。';
  }
  if (!met) return `今天 ${newLearned}/${goal}，也够了。`;
  if (streak >= 30) return `第 ${streak} 天。这已经是你的习惯了。`;
  if (streak >= 7) return `第 ${streak} 天。鲸鱼娘开始认得你了。`;
  if (streak >= 3) return `第 ${streak} 天，稳。`;
  return `今天 ${newLearned} 个，收工。`;
}

/** 补考小结：这一场重考了几次 */
function retryNote(session) {
  if (!session) return '';
  const total = session.retry?.length || 0;
  if (!total) return '';
  return `<p class="muted small retry-note">补考 ${total} 次</p>`;
}

export function doneView(app, ctx) {
  const mode = app.lastSession?.mode || 'learn';
  const isLearn = mode === 'learn';
  const goal = ctx.entry.goalNew || ctx.goalNew || app.state.config.dailyNewTarget;
  const met = ctx.entry.newLearned >= goal;
  const title = mode === 'extra' ? '加练完成' : (isLearn ? (met ? '今天学完了' : '今天学到这儿') : '复习清空');

  return `
  <div class="page done">
    <img class="mascot" src="${MASCOT}" alt="" width="150" height="155" decoding="async">
    <h1 class="done-title">${title}</h1>
    <p class="muted">${pickLine({ mode, met, streak: ctx.streak, newLearned: ctx.entry.newLearned, goal })}</p>
    ${retryNote(app.lastSession)}

    <section class="meta three">
      <div class="meta-item"><b>${ctx.entry.newLearned}<em>/${goal}</em></b><span>今日新词</span></div>
      <div class="meta-item"><b>${ctx.entry.reviewsDone}</b><span>今日复习</span></div>
      <div class="meta-item"><b>${ctx.tomorrow}</b><span>明日到期</span></div>
    </section>

    ${(ctx.retryIds?.length || 0) > 0
      ? `<div class="actions"><button class="primary" data-action="start-extra">补考 ${Math.min(20, ctx.retryIds.length)} 个</button></div>`
      : ''}
    ${ctx.due.length > 0
      ? `<div class="actions"><button class="primary${(ctx.retryIds?.length || 0) > 0 ? ' ghost' : ''}" data-action="start-review">继续清 ${ctx.due.length} 张复习</button></div>`
      : (ctx.retryIds?.length || 0) > 0
        ? `<div class="actions"><button class="link" data-action="go-home">先回首页</button></div>`
        : `<div class="actions"><button class="primary" data-action="go-home">回到首页</button></div>`}
    ${ctx.due.length > 0 ? `<div class="actions"><button class="link" data-action="go-home">先回首页</button></div>` : ''}
  </div>`;
}
