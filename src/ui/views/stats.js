// 统计页：今日 / 连续 / 词库进度 / 近 7 天 / 累计
import { esc } from '../dom.js';
import { recentDays } from '../../core/stats.js';
import { dueOn } from '../../core/queue.js';
import { addDays } from '../../core/dates.js';

export function statsView(ctx) {
  const goal = ctx.entry.goalNew || ctx.state.config.dailyNewTarget;
  const days = recentDays(ctx.state.daily, ctx.today, 7);
  const peak = Math.max(1, ...days.map((d) => d.newLearned + d.reviewsDone));
  const pct = ctx.total ? Math.round((ctx.learned / ctx.total) * 100) : 0;
  const next7 = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(ctx.today, i + 1);
    return { day, n: dueOn(ctx.state.cards, day) };
  });
  const maxNext = Math.max(1, ...next7.map((d) => d.n));

  return `
  <div class="page">
    <header class="topbar">
      <div class="topbar-main">
        <div class="date">统计</div>
        <div class="sub">只给一个人看的数字</div>
      </div>
    </header>

    <section class="stat-grid">
      <div class="stat-box"><b>${ctx.entry.newLearned}<em>/${goal}</em></b><span>今日新词</span></div>
      <div class="stat-box"><b>${ctx.entry.reviewsDone}</b><span>今日复习</span></div>
      <div class="stat-box"><b>${ctx.streak}</b><span>连续天数</span></div>
      <div class="stat-box"><b>${ctx.best}</b><span>最长连续</span></div>
    </section>

    <section class="card">
      <h2>词库进度</h2>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <p class="muted small">已学 ${ctx.learned} / ${ctx.total}（${pct}%）· 还剩 ${ctx.newLeftInDeck} 个没学</p>
    </section>

    <section class="card">
      <h2>近 7 天</h2>
      <div class="day-list">
        ${days.map((d) => {
          const total = d.newLearned + d.reviewsDone;
          const w = Math.max(2, Math.round((total / peak) * 100));
          return `
          <div class="day-row">
            <span class="d">${d.date.slice(5).replace('-', '/')} ${d.met ? '✓' : ''}</span>
            <div class="track"><i style="width:${w}%"></i></div>
            <span class="n">新 ${d.newLearned} · 复 ${d.reviewsDone}</span>
          </div>`;
        }).join('')}
      </div>
    </section>

    <section class="card">
      <h2>接下来 7 天要还的</h2>
      <div class="bars">
        ${next7.map((x) => `
          <div class="bar">
            <i style="height:${Math.max(4, Math.round((x.n / maxNext) * 100))}%"></i>
            <span>${x.day.slice(5).replace('-', '/')}</span>
            <b>${x.n}</b>
          </div>`).join('')}
      </div>
    </section>

    <section class="card">
      <h2>累计</h2>
      <div class="kv"><span>已学词数</span><span>${ctx.learned}</span></div>
      <div class="kv"><span>累计复习次数</span><span>${ctx.reviewTotal}</span></div>
      <div class="kv"><span>词库</span><span>${esc(ctx.deck?.name || '-')}</span></div>
    </section>
  </div>`;
}
