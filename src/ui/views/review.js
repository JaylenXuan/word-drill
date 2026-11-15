// 复习页：到期清单入口 + 未来 7 天预告
import { addDays } from '../../core/dates.js';
import { dueOn } from '../../core/queue.js';

export function reviewView(ctx) {
  const due = ctx.due.length;
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(ctx.today, i + 1);
    return { day, n: dueOn(ctx.state.cards, day) };
  });
  const peak = Math.max(1, ...week.map((w) => w.n));

  return `
  <div class="page">
  <header class="topbar">
    <div class="topbar-main">
      <div class="date">复习</div>
      <div class="sub">按到期日排序，欠得最久的先还</div>
    </div>
  </header>

  ${due === 0
    ? `<div class="empty-inline">
         <img class="mascot sm" src="assets/whale/icon-preview.png" alt="" width="88" height="88" decoding="async">
         <p class="muted">今天没有到期。干净。</p>
       </div>`
    : `<div class="big-number">${due}<span>张到期</span></div>`}

  <div class="actions">
    ${due > 0
      ? `<button class="primary" data-action="start-review">开始复习 · ${due} 张</button>
         ${due > 25 ? `<button class="link" data-action="start-review-light">先清 20 张（最低可行日）</button>` : ''}`
      : ''}
  </div>

  <section class="card">
    <h2>接下来 7 天</h2>
    <div class="bars">
      ${week.map((w) => `
        <div class="bar">
          <i style="height:${Math.max(4, Math.round((w.n / peak) * 100))}%"></i>
          <span>${w.day.slice(5).replace('-', '/')}</span>
          <b>${w.n}</b>
        </div>`).join('')}
    </div>
    <p class="muted small">每天固定还债，比攒一堆再还轻松。</p>
  </section>
  </div>`;
}
