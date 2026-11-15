// 首次进入：选词库 + 定每日新词数（一页搞定，别做三步引导）
import { esc } from '../dom.js';

export function onboardView(app) {
  const chosen = app.draft.deckId;
  const target = app.draft.target;
  return `
  <div class="onboard">
    <h1 class="brand">背单词</h1>
    <p class="muted">只服务你一个人的词库。选一个，定个每天的量，就能开始。</p>

    <h2 class="section-title">1 · 选词库</h2>
    <div class="deck-list">
      ${app.deckMetas.map((d) => `
        <button class="deck-opt ${chosen === d.id ? 'active' : ''}" data-action="pick-deck" data-deck="${esc(d.id)}">
          <span class="tag">${esc(d.tag)}</span>
          <b>${esc(d.name)}</b>
          <span class="count">${d.count} 词</span>
          <span class="desc">${esc(d.desc || '')}</span>
        </button>`).join('')}
    </div>

    <h2 class="section-title">2 · 每天学几个新词</h2>
    <div class="chips">
      ${[5, 10, 15, 20].map((n) => `
        <button class="chip ${target === n ? 'active' : ''}" data-action="pick-target" data-target="${n}">${n}</button>`).join('')}
    </div>
    <p class="muted small">按这个速度，${chosen ? '' : '选好词库后'}大约 ${app.draftEta} 天学完。之后随时可以改。</p>

    <div class="actions">
      <button class="primary" data-action="finish-onboard" ${chosen ? '' : 'disabled'}>开始</button>
    </div>
  </div>`;
}
