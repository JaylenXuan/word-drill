// 错词本：只读筛选视图 + 一键重学（会按评分重新排期）
import { esc } from '../dom.js';
import { buildMistakeList } from '../../core/queue.js';
import { fmtGap } from '../dom.js';

export function mistakesView(ctx) {
  const ids = buildMistakeList(ctx.state.cards);
  const today = ctx.today;

  if (!ids.length) {
    return `
    <div class="page empty-page">
      <img class="mascot sm" src="assets/whale/icon-preview.png" alt="" width="88" height="88" decoding="async">
      <h1 class="done-title">错词本是空的</h1>
      <p class="muted">最近一次评为「不认识」、或累计错 2 次以上的词，会自动收进来。</p>
      <div class="actions"><button class="primary" data-action="go-home">回到今日</button></div>
    </div>`;
  }

  const rows = ids.slice(0, 200).map((id) => {
    const card = ctx.state.cards[id];
    const w = ctx.wordMap.get(id) || { word: id, meaning: '' };
    const gap = card.due > today ? null : '已到期';
    return `
    <li class="list-row">
      <div class="row-main">
        <b>${esc(w.word)}</b>
        <span class="row-meaning">${esc(w.meaning)}</span>
      </div>
      <div class="row-meta">
        <span class="badge bad">错 ${card.lapses || 0}</span>
        <span class="muted">${gap || fmtGap(1)}</span>
      </div>
    </li>`;
  }).join('');

  return `
  <div class="page">
    <header class="topbar">
      <div class="topbar-main">
        <div class="date">错词本</div>
        <div class="sub">最近一次不认识，或累计错 2 次以上</div>
      </div>
      <div class="streak-badge">${ids.length}</div>
    </header>

    <div class="actions">
      <button class="primary" data-action="start-mistakes">重学这 ${Math.min(20, ids.length)} 个</button>
      <p class="muted small center">重学按评分重新排期，和普通复习一样</p>
    </div>

    <ul class="list">
      ${rows}
    </ul>
    ${ids.length > 200 ? `<p class="muted small center">只显示前 200 个，共 ${ids.length} 个</p>` : ''}
  </div>`;
}
