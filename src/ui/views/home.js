// 首页：左边「学习」，右边「复习」，像不背单词那样的双卡入口
import { esc, fmtDate } from '../dom.js';

export function homeView(ctx) {
  const goal = ctx.entry.goalNew || ctx.state.config.dailyNewTarget;
  const doneNew = ctx.entry.newLearned;
  const newLeft = ctx.newIds.length;
  const due = ctx.due.length;
  const pct = Math.min(100, Math.round((doneNew / Math.max(1, goal)) * 100));
  const deckDone = ctx.newLeftInDeck === 0;

  // 主按钮跟着「今天还剩什么」走
  let cta;
  if (newLeft > 0) cta = `<button class="primary" data-action="start-learn">开始学习 · ${newLeft} 个新词</button>`;
  else if (due > 0) cta = `<button class="primary" data-action="start-review">开始复习 · ${due} 张到期</button>`;
  else cta = `<button class="primary ghost" disabled>今天已经完成了</button>`;

  // 复习量过大时给一个「只清一部分」的出口，避免因为欠 74 张而干脆不打开
  const lightLink = due > 25
    ? `<button class="link" data-action="start-review-light">先清 20 张（最低可行日）</button>`
    : '';

  return `
  <div class="page home">
  <header class="topbar">
    <div class="topbar-main">
      <div class="date">${fmtDate(ctx.today)}</div>
      <div class="sub">${ctx.streak > 0 ? `连续 ${ctx.streak} 天${ctx.best > ctx.streak ? ` · 最长 ${ctx.best} 天` : ''}` : '今天从第一个词开始'}</div>
    </div>
    <div class="streak-badge ${ctx.streak > 0 ? 'on' : 'go'}">${ctx.streak > 0 ? `🔥 ${ctx.streak}` : 'Start Now!'}</div>
  </header>

  <div class="dual">
    <button class="big-card learn ${newLeft === 0 ? 'is-done' : ''}" data-action="start-learn" ${newLeft === 0 ? 'disabled' : ''}>
      <span class="label">学习</span>
      <span class="num">${doneNew}<em>/${goal}</em></span>
      <span class="hint">${deckDone ? '词库已学完' : newLeft === 0 ? '今日新词已达标' : `还剩 ${newLeft} 个`}</span>
    </button>
    <button class="big-card review ${due === 0 ? 'is-done' : ''}" data-action="start-review" ${due === 0 ? 'disabled' : ''}>
      <span class="label">复习</span>
      <span class="num">${due}</span>
      <span class="hint">${due === 0 ? '今天没有到期' : '待复习'}</span>
    </button>
  </div>

  <div class="progress"><i style="width:${pct}%"></i></div>

  <div class="actions">
    ${cta}
    ${lightLink}
  </div>

  <section class="meta">
    <div class="meta-item"><b>${ctx.entry.reviewsDone}</b><span>今日已复习</span></div>
    <div class="meta-item"><b>${ctx.learned}<em>/${ctx.total}</em></b><span>词库进度</span></div>
    <div class="meta-item"><b>${ctx.tomorrow}</b><span>明日到期</span></div>
  </section>

  <p class="deck-line">词库：${esc(ctx.deck?.name || '未选择')}</p>
  ${ctx.backupOverdue ? `<button class="link nudge" data-action="tab" data-tab="settings">
    ${ctx.backupNever ? `还没导出过备份` : `备份已 ${ctx.backupDays} 天没做`} · 去设置里导出
  </button>` : ''}
  </div>
  `;
}
