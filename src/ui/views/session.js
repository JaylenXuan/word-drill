// 卡片会话：全屏、无 tab 干扰，点卡片翻面，三键评分
import { esc } from '../dom.js';
import { currentItem, remaining } from '../../core/session.js';

export function sessionView(app) {
  const item = currentItem(app.session);
  if (!item) return '<div class="page"><p class="muted">队列空了</p></div>';
  const w = app.wordMap.get(item.id) || { word: item.id, meaning: '（词条缺失）' };
  const total = app.session.queue.length;
  const done = Math.min(app.session.index, total);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const isLearn = app.session.mode === 'learn';
  // 长词/多拼写要缩字号，否则会撑破卡片
  const sizeClass = w.word.length > 16 ? 'xlong' : w.word.length > 11 ? 'long' : '';

  return `
  <div class="session">
    <header class="session-bar">
      <button class="icon-btn" data-action="exit-session" aria-label="退出">✕</button>
      <div class="session-progress"><i style="width:${pct}%"></i></div>
      <div class="session-count">${remaining(app.session)}</div>
    </header>

    <div class="flip ${app.flipped ? 'is-flipped' : ''}" data-action="flip">
      <div class="flip-inner">
        <div class="face front">
          <span class="mode-chip">${isLearn ? '新词' : '复习'}</span>
          <div class="face-inner">
            <div class="word ${sizeClass}">${esc(w.word)}</div>
            ${w.phonetic ? `<div class="phonetic">${esc(w.phonetic)}</div>` : ''}
            <button class="speak" data-action="speak" aria-label="发音">🔊</button>
            <div class="tip">轻点卡片看释义</div>
          </div>
        </div>
        <div class="face back">
          <div class="face-inner start">
            <div class="word-small">${esc(w.word)}</div>
            <div class="pos">${esc(w.pos || '')}</div>
            <div class="meaning">${esc(w.meaning)}</div>
            ${w.note ? `<div class="note">${esc(w.note)}</div>` : ''}
            ${w.example ? `<div class="example">${esc(w.example)}</div>` : ''}
            ${w.exampleZh ? `<div class="example-zh">${esc(w.exampleZh)}</div>` : ''}
            <div class="tip">记住了吗？</div>
          </div>
        </div>
      </div>
    </div>

    <div class="grades">
      <button class="grade again" data-action="grade" data-grade="again" disabled>不认识<em>1</em></button>
      <button class="grade hard" data-action="grade" data-grade="hard" disabled>模糊<em>2</em></button>
      <button class="grade good" data-action="grade" data-grade="good" disabled>认识<em>3</em></button>
    </div>
  </div>`;
}
