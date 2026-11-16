// 生词本列表：查看、编辑、删除
import { esc } from '../dom.js';
import { isCustomId } from '../../core/custom.js';

export function customListView(app, ctx) {
  const entries = Object.values(app.custom?.words || {})
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const due = entries.filter((e) => {
    const c = ctx.state.cards[e.id];
    return !c || (c.state !== 'new' && c.due <= ctx.today);
  }).length;

  return `
  <div class="page">
    <header class="topbar">
      <button class="icon-btn" data-action="close-custom" aria-label="返回">✕</button>
      <div class="topbar-main">
        <div class="date">生词本</div>
        <div class="sub">${entries.length} 个 · 今天待复习 ${due} 个</div>
      </div>
      <button class="icon-btn add-btn" data-action="new-custom" aria-label="新增生词">＋</button>
    </header>

    ${entries.length === 0 ? `
      <div class="empty-inline">
        <img class="mascot sm" src="assets/whale/icon-preview.png" alt="" width="88" height="88" decoding="async">
        <p class="muted">还没有生词。遇到不会的就点上面的 ＋。</p>
      </div>
    ` : `
      <ul class="list">
        ${entries.map((e) => {
          const card = ctx.state.cards[e.id];
          const when = !card ? '待开始'
            : card.due <= ctx.today ? '已到期' : `下次 ${card.due.slice(5).replace('-', '/')}`;
          return `
          <li class="list-row">
            <div class="row-main">
              <b>${esc(e.word)} <span class="due-tag">${when}</span></b>
              <span class="row-meaning">${esc(e.meaning)}</span>
            </div>
            <div class="row-actions">
              <button class="mini" data-action="edit-custom" data-id="${esc(e.id)}">改</button>
              <button class="mini danger" data-action="delete-custom" data-id="${esc(e.id)}">删</button>
            </div>
          </li>`;
        }).join('')}
      </ul>
    `}
  </div>`;
}
