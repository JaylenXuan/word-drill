// 生词录入页：只有单词 + 释义两个输入框，保存后原地继续录
import { esc } from '../dom.js';

export function customEntryView(app) {
  const d = app.customDraft || { id: null, word: '', meaning: '' };
  const editing = !!d.id;
  const used = app.customUsedToday || 0;
  const limit = app.customDailyLimit || 20;
  const full = !editing && used >= limit;

  return `
  <div class="page entry-page">
    <header class="entry-head">
      <button class="icon-btn" data-action="close-custom" aria-label="返回">✕</button>
      <div class="entry-title">${editing ? '编辑生词' : '记一个生词'}</div>
      <div class="entry-count">${full ? '今天录满了' : `今天 ${used}/${limit}`}</div>
    </header>

    <div class="form">
      <label class="form-field">
        <span class="form-label">单词 / 短语</span>
        <input id="cw-word" class="form-input" type="text" autocomplete="off" autocapitalize="off"
          autocorrect="off" spellcheck="false" enterkeyhint="next"
          value="${esc(d.word)}" placeholder="比如 mitigate" ${editing ? '' : 'autofocus'} />
      </label>

      <label class="form-field">
        <span class="form-label">释义</span>
        <input id="cw-meaning" class="form-input" type="text" autocomplete="off"
          enterkeyhint="done" value="${esc(d.meaning)}" placeholder="比如 减轻；缓解" />
      </label>
    </div>

    <p class="form-hint" id="cw-hint"></p>

    <div class="actions">
      <button class="primary" id="cw-save" data-action="save-custom" ${full ? 'disabled' : ''}>
        ${editing ? '保存修改' : (full ? '今天录满了，明天再录' : '保存并继续')}
      </button>
      ${editing ? '<button class="link" data-action="cancel-edit-custom">取消编辑</button>'
        : '<button class="link" data-action="open-custom-list">看生词本</button>'}
    </div>
  </div>`;
}
