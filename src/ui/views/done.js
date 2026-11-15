// 会话结束页：给一次正反馈，顺带预告明天要还多少
const MASCOT = 'assets/whale/whale-girl-transparent.png';

/** 按「这次干了什么 + 连续多少天」挑一句话，不超过 16 字 */
function pickLine({ isLearn, met, streak, newLearned, goal }) {
  if (!isLearn) {
    return streak >= 3 ? `第 ${streak} 天。债清了。` : '债还完了，新词明天补也不迟。';
  }
  if (!met) return `今天 ${newLearned}/${goal}，也够了。`;
  if (streak >= 30) return `第 ${streak} 天。这已经是你的习惯了。`;
  if (streak >= 7) return `第 ${streak} 天。鲸鱼娘开始认得你了。`;
  if (streak >= 3) return `第 ${streak} 天，稳。`;
  return `今天 ${newLearned} 个，收工。`;
}

export function doneView(app, ctx) {
  const isLearn = app.lastSession?.mode === 'learn';
  const goal = ctx.entry.goalNew || app.state.config.dailyNewTarget;
  const met = ctx.entry.newLearned >= goal;

  return `
  <div class="page done">
    <img class="mascot" src="${MASCOT}" alt="" width="150" height="155" decoding="async">
    <h1 class="done-title">${isLearn ? (met ? '今天学完了' : '今天学到这儿') : '复习清空'}</h1>
    <p class="muted">${pickLine({ isLearn, met, streak: ctx.streak, newLearned: ctx.entry.newLearned, goal })}</p>

    <section class="meta three">
      <div class="meta-item"><b>${ctx.entry.newLearned}<em>/${goal}</em></b><span>今日新词</span></div>
      <div class="meta-item"><b>${ctx.entry.reviewsDone}</b><span>今日复习</span></div>
      <div class="meta-item"><b>${ctx.tomorrow}</b><span>明日到期</span></div>
    </section>

    ${ctx.due.length > 0
      ? `<div class="actions"><button class="primary" data-action="start-review">继续清 ${ctx.due.length} 张复习</button></div>`
      : `<div class="actions"><button class="primary" data-action="go-home">回到首页</button></div>`}
    ${ctx.due.length > 0 ? `<div class="actions"><button class="link" data-action="go-home">先回首页</button></div>` : ''}
  </div>`;
}
