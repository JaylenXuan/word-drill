// 界面入口：路由 + 事件委托 + 会话编排
// 只做三件事：把状态算成 ctx、把 ctx 渲染成 HTML、把点击/按键变成状态变更。

import { createStorage, localAdapter } from '../core/storage.js';
import { buildNewQueue, buildReviewQueue, dueOn, buildMistakeList, todayAgainIds } from '../core/queue.js';
import { computeStreak } from '../core/stats.js';
import { todayKey, addDays } from '../core/dates.js';
import { applyGrade } from '../core/review.js';
import { buildSession, currentItem, gradeSession, isFinished } from '../core/session.js';
import { createCard } from '../core/scheduler.js';
import {
  CUSTOM_DECK_ID, dailyLimit, makeCustomId, validateEntry, findByWord,
  findSuffixSibling, normalizeWord,
} from '../core/custom.js';
import { homeView } from './views/home.js';
import { onboardView } from './views/onboard.js';
import { sessionView } from './views/session.js';
import { doneView } from './views/done.js';
import { reviewView } from './views/review.js';
import { mistakesView } from './views/mistakes.js';
import { statsView } from './views/stats.js';
import { settingsView } from './views/settings.js';
import { customEntryView } from './views/custom-entry.js';
import { customListView } from './views/custom-list.js';
import { loadPrefs, savePrefs, backupAgeDays, backupOverdue } from './prefs.js';
import { createSound } from './sound.js';
import { esc } from './dom.js';

// 线性图标（内联 SVG，不引图标库；颜色跟随 currentColor）
const ICON = {
  today: '<path d="M4 11.2 12 4.2l8 7"/><path d="M6.6 10.2V19.4h10.8V10.2"/><path d="M10.4 19.4v-4.2h3.2v4.2"/>',
  review: '<path d="M19.6 12a7.6 7.6 0 1 1-2.3-5.4"/><path d="M19.9 4.2v4.6h-4.6"/>',
  mistakes: '<path d="M4.6 19.4h4l9.2-9.2a2.1 2.1 0 0 0-3-3l-9.2 9.2v3z"/><path d="M13.2 6.4l3 3"/>',
  stats: '<path d="M5.2 19.4v-6.6"/><path d="M12 19.4V5.6"/><path d="M18.8 19.4v-4.2"/>',
  settings: '<circle cx="12" cy="8.2" r="3.1"/><path d="M5.8 19.6c0-3.4 2.8-5.3 6.2-5.3s6.2 1.9 6.2 5.3"/>',
};
const TABS = [
  ['today', '今日', ICON.today],
  ['review', '复习', ICON.review],
  ['mistakes', '错词', ICON.mistakes],
  ['stats', '统计', ICON.stats],
  ['settings', '我的', ICON.settings],
];

const root = document.getElementById('app');

const app = {
  storage: null,
  state: null,
  deckMetas: [],
  deckCache: new Map(),
  deck: null,
  wordMap: new Map(),
  screen: 'loading',
  tab: 'today',
  session: null,
  lastSession: null,
  flipped: false,
  lastGap: null,
  pendingLogs: [],
  draft: { deckId: null, target: 10 },
  draftEta: '—',
  reviewTotal: 0,
  ctx: null,
  prefs: loadPrefs(),
  sound: createSound({ enabled: loadPrefs().sound }),
  persistState: null,
  custom: { version: 1, words: {} },
  notes: { version: 1, notes: {} },
  customDraft: { id: null, word: '', meaning: '' },
  customUsedToday: 0,
  customDailyLimit: 20,
  /** 统一取词：雅思词库或生词本 */
  wordOf(id) {
    return app.wordMap.get(id) || app.custom?.words?.[id] || null;
  },
};

// 评分有一次 260ms 的收尾动画，期间禁止重复评分
let grading = false;

// ---------- 词库加载 ----------

async function loadDeck(id) {
  if (app.deckCache.has(id)) return app.deckCache.get(id);
  const meta = app.deckMetas.find((d) => d.id === id);
  if (!meta) throw new Error(`没有这个词库：${id}`);
  const res = await fetch(`data/decks/${meta.file}`);
  if (!res.ok) throw new Error(`词库下载失败：${meta.file}`);
  const deck = await res.json();
  app.deckCache.set(id, deck);
  return deck;
}

async function useDeck(id) {
  const deck = await loadDeck(id);
  app.deck = deck;
  app.wordMap = new Map(deck.words.map((w) => [w.id, w]));
}

// ---------- 每帧要用的数据 ----------

function context() {
  const today = todayKey();
  const cfg = app.state.config;
  const deck = app.deck;
  const entry = app.state.daily[today] || { newLearned: 0, reviewsDone: 0, goalNew: cfg.dailyNewTarget };
  // 同一到期日的内部打乱：每天开复习不会总是同一个顺序，到期早的仍然优先
  const due = deck ? buildReviewQueue(app.state.cards, today, { shuffle: true }) : [];
  const newIds = deck ? buildNewQueue(deck.words, app.state.cards, cfg, app.state.daily, today) : [];
  const { current, best } = computeStreak(app.state.daily, today);
  const cardList = Object.values(app.state.cards);
  const learned = cardList.filter((c) => c.state !== 'new').length;
  const backupDays = backupAgeDays(app.prefs);
  const newLeftInDeck = deck
    ? deck.words.reduce((n, w) => n + (!app.state.cards[w.id] || app.state.cards[w.id].state === 'new' ? 1 : 0), 0)
    : 0;
  // 目标封顶：词库只剩 3 个时，今天的目标就是 3，学完照样算达标
  const goalNew = Math.max(1, Math.min(cfg.dailyNewTarget, newLeftInDeck));
  // 今天评过「不认识」的词：退出会话后还能补考。词库词和生词都算。
  const retryIds = todayAgainIds(app.state.cards, today);

  // 生词本
  const customList = Object.values(app.custom?.words || {});
  const customDue = customList.filter((e) => {
    const c = app.state.cards[e.id];
    return c && c.state !== 'new' && c.due <= today;
  }).length;

  return {
    today,
    deck,
    entry,
    due,
    newIds,
    streak: current,
    best,
    tomorrow: dueOn(app.state.cards, addDays(today, 1)),
    total: deck ? deck.words.length : 0,
    learned,
    newLeftInDeck,
    goalNew,
    retryIds,
    customCount: customList.length,
    customDue,
    customAddedToday: Number(entry.customAdded) || 0,
    customReviewsToday: Number(entry.customReviews) || 0,
    customDailyLimit: dailyLimit(cfg),
    wordMap: app.wordMap,
    wordOf: (id) => app.wordOf(id),
    reviewTotal: app.reviewTotal,
    // 备份提醒：从没导出过就看学了多少词，导出过就看隔了多久
    backupDays: backupDays ?? 0,
    backupNever: backupDays === null,
    backupOverdue: backupOverdue(app.prefs, learned),
    state: app.state,
  };
}

// ---------- 渲染 ----------

function tabbar() {
  return `<nav class="tabbar">
    ${TABS.map(([id, label, paths]) => `
      <button class="${app.tab === id ? 'active' : ''}" data-action="tab" data-tab="${id}">
        <span class="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
          stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg></span>
        <span>${label}</span>
      </button>`).join('')}
  </nav>`;
}

function render() {
  const ctx = context();
  app.ctx = ctx;

  let body;
  let showTabs = true;
  app.customUsedToday = ctx.customAddedToday;
  app.customDailyLimit = ctx.customDailyLimit;

  if (app.screen === 'loading') { body = loadingView(); showTabs = false; }
  else if (app.screen === 'onboard') { body = onboardView(app); showTabs = false; }
  else if (app.screen === 'session') { body = sessionView(app); showTabs = false; }
  else if (app.screen === 'done') { body = doneView(app, ctx); showTabs = false; }
  else if (app.screen === 'custom-entry') { body = customEntryView(app); showTabs = false; }
  else if (app.screen === 'custom-list') { body = customListView(app, ctx); showTabs = false; }
  else if (app.tab === 'today') body = homeView(ctx, app);
  else if (app.tab === 'review') body = reviewView(ctx);
  else if (app.tab === 'mistakes') body = mistakesView(ctx);
  else if (app.tab === 'stats') body = statsView(ctx);
  else body = settingsView(app, ctx);

  root.innerHTML = body + (showTabs ? tabbar() : '') + '<div class="toast" id="toast"></div>';
  globalThis.scrollTo?.(0, 0);

  // 会话页：卡片默认不可评分，翻面后才点亮
  if (app.screen === 'session') {
    const flip = root.querySelector('.flip');
    if (app.flipped && flip) flip.classList.add('is-flipped');
    setGradesEnabled(app.flipped);
  }
}

function loadingView() {
  return `<div class="page loading-view">
    <img class="mascot sm sway" src="assets/whale/icon-preview.png" alt="" width="88" height="88" decoding="async">
    <h1 class="brand">背单词</h1>
    <p class="muted">正在捞词…</p>
  </div>`;
}

function setGradesEnabled(on) {
  root.querySelectorAll?.('.grade').forEach((b) => { b.disabled = !on; });
}

// ---------- 生词本 ----------

/** 在雅思词库里找同一个词（含 "favour / favor" 这种多拼写条目） */
function findInDeck(deck, word) {
  const key = normalizeWord(word);
  if (!deck || !key) return null;
  for (const w of deck.words) {
    const parts = String(w.word).split('/').map((s) => normalizeWord(s));
    if (parts.includes(key)) return w;
  }
  return null;
}

/** 判断当前输入会不会撞车，供实时提示与保存时复用 */
function checkCustomWord(word, editingId = null) {
  const probe = validateEntry({ word, meaning: 'x' });
  if (!probe.ok) return { block: true, kind: 'bad', text: probe.error };

  const dup = findByWord(app.custom, word);
  if (dup && dup.id !== editingId) {
    return { block: false, kind: 'warn', dup, text: `「${dup.word}」已经在生词本里，保存会打开它让你改` };
  }
  const deckHit = findInDeck(app.deck, word);
  if (deckHit) {
    const card = app.state.cards[deckHit.id];
    const learned = !!card && card.state !== 'new';
    // 已学过的词：不建第二张卡，但允许把释义存成「我的补充」
    return {
      block: false,
      kind: learned ? '' : 'warn',
      deckHit,
      learned,
      text: learned
        ? `「${deckHit.word}」已经学过了 · 填一句可以加一条补充（词库释义不动）`
        : `「${deckHit.word}」在雅思词库里，还没轮到 · 保存就是提前学`,
    };
  }
  const sib = findSuffixSibling(app.custom, word);
  if (sib) {
    return { block: false, kind: 'warn', text: `生词本里已经有「${sib.word}」，可能只是词形变化（仍可新建）` };
  }
  return { block: false, kind: '', text: '' };
}

function openCustomEntry(id = null) {
  const e = id ? app.custom.words[id] : null;
  app.customDraft = e
    ? { id: e.id, word: e.word, meaning: e.meaning }
    : { id: null, word: '', meaning: '' };
  app.screen = 'custom-entry';
  render();
  setTimeout(() => document.getElementById('cw-word')?.focus(), 60);
}

function saveCustomEntry() {
  const wordEl = document.getElementById('cw-word');
  const meanEl = document.getElementById('cw-meaning');
  // 先只校验单词：词库里的词「提前学」时，释义由词库自带，不需要用户再填
  const wordOnly = validateEntry({ word: wordEl?.value, meaning: 'x' });
  if (!wordOnly.ok) { showToast(wordOnly.error); wordEl?.focus(); return; }

  const today = todayKey();
  const editingId = app.customDraft?.id || null;
  const gate = checkCustomWord(wordOnly.word, editingId);

  if (gate.block) { showToast(gate.text); return; }
  if (gate.dup) { openCustomEntry(gate.dup.id); return; }

  // 词库词：提前学 + 把释义存成「我的补充」（不覆盖词库原文）
  if (gate.deckHit) {
    const w = gate.deckHit;
    const existing = app.state.cards[w.id];
    const learned = !!existing && existing.state !== 'new';
    const noteText = String(meanEl?.value || '').trim();

    if (learned && !noteText) {
      showToast('这个词已经学过了，想加补充就填一句');
      meanEl?.focus();
      return;
    }

    if (!learned) {
      app.state.cards[w.id] = {
        ...createCard(w.id, app.state.config.deckId || CUSTOM_DECK_ID, today),
        state: 'review', due: today, interval: 0,
      };
      app.storage.save(app.state);
    }
    if (noteText) {
      app.notes.notes[w.id] = { text: noteText, updatedAt: new Date().toISOString() };
      app.storage.saveNotes(app.notes);
    }

    app.customDraft = { id: null, word: '', meaning: '' };
    render();
    setTimeout(() => document.getElementById('cw-word')?.focus(), 60);
    if (learned) showToast('已保存补充');
    else showToast(`已提前学「${w.word}」${noteText ? '，并加了一条补充' : ''}，今天复习里见`);
    return;
  }

  const check = validateEntry({ word: wordEl?.value, meaning: meanEl?.value });
  if (!check.ok) { showToast(check.error); meanEl?.focus(); return; }

  if (!editingId) {
    const used = Number(app.state.daily[today]?.customAdded) || 0;
    const limit = dailyLimit(app.state.config);
    if (used >= limit) { showToast(`今天已经录了 ${limit} 个，明天再录`); return; }

    const id = makeCustomId();
    const now = new Date().toISOString();
    app.custom.words[id] = {
      id, word: check.word, meaning: check.meaning, createdAt: now, updatedAt: null,
    };
    app.storage.saveCustom(app.custom);

    // 直接建成「已到期」的卡：立刻进今日复习，但不吃新词名额
    const card = createCard(id, CUSTOM_DECK_ID, today);
    app.state.cards[id] = { ...card, state: 'review', due: today, interval: 0 };
    const ctxNow = app.ctx || context();
    if (!app.state.daily[today]) {
      app.state.daily[today] = { newLearned: 0, reviewsDone: 0, goalNew: ctxNow.goalNew, customAdded: 0 };
    }
    app.state.daily[today].customAdded = (Number(app.state.daily[today].customAdded) || 0) + 1;
    app.storage.save(app.state);

    app.customDraft = { id: null, word: '', meaning: '' };
    render();
    setTimeout(() => document.getElementById('cw-word')?.focus(), 60);
    showToast('已加入今日复习');
    return;
  }

  const entry = app.custom.words[editingId];
  if (!entry) { showToast('这条记录不见了'); app.screen = 'custom-list'; render(); return; }
  entry.word = check.word;
  entry.meaning = check.meaning;
  entry.updatedAt = new Date().toISOString();
  app.storage.saveCustom(app.custom);
  app.customDraft = { id: null, word: '', meaning: '' };
  app.screen = 'custom-list';
  render();
  showToast('已保存');
}

function deleteCustomEntry(id) {
  const entry = app.custom.words[id];
  if (!entry) return;
  const ok = typeof confirm === 'function'
    ? confirm(`删除「${entry.word}」？它的学习进度也会一起删掉。`)
    : true;
  if (!ok) return;

  delete app.custom.words[id];
  app.storage.saveCustom(app.custom);
  delete app.state.cards[id];

  // 今天录的删掉要返还名额
  const today = todayKey();
  const daily = app.state.daily[today];
  const addedToday = String(entry.createdAt || '').slice(0, 10) === today;
  if (daily && addedToday && Number(daily.customAdded) > 0) {
    daily.customAdded = Number(daily.customAdded) - 1;
  }
  app.storage.save(app.state);
  render();
  showToast('已删除');
}

/** 输入时的实时提示（不重渲染，避免丢焦点） */
function refreshCustomHint() {
  const word = document.getElementById('cw-word')?.value || '';
  const hint = document.getElementById('cw-hint');
  const save = document.getElementById('cw-save');
  if (!hint) return;
  const editing = !!app.customDraft?.id;
  const gate = checkCustomWord(word, app.customDraft?.id || null);
  hint.textContent = gate.text;
  hint.className = `form-hint ${gate.kind || ''}`;
  if (!save) return;

  const noteText = String(document.getElementById('cw-meaning')?.value || '').trim();
  if (gate.deckHit) {
    // 已学过的词：只能存补充说明，没填就没得存
    save.disabled = gate.learned && !noteText;
    save.textContent = gate.learned ? '保存补充' : '提前学这个词';
    return;
  }

  // 提前学不占生词名额，所以「今天录满了」也要放行
  const full = !editing && (app.customUsedToday || 0) >= (app.customDailyLimit || 20);
  save.disabled = gate.block || full;

  if (editing) save.textContent = '保存修改';
  else if (full) save.textContent = '今天录满了，明天再录';
  else save.textContent = '保存并继续';
}

// ---------- 会话 ----------

function startSession(mode, limit = 0) {
  const ctx = app.ctx || context();
  const source = mode === 'learn' ? ctx.newIds : mode === 'extra' ? ctx.retryIds : ctx.due;
  let ids = source;
  if (limit > 0) ids = ids.slice(0, limit);
  if (!ids.length) {
    const msg = {
      learn: '今天的新词已经学完了',
      review: '没有到期的复习',
      extra: '今天没有需要加练的词',
    }[mode] || '没有可学的词';
    showToast(msg);
    return;
  }
  app.session = buildSession(mode, ids);
  app.flipped = false;
  app.lastGap = null;
  app.screen = 'session';
  render();
}

function flipCard() {
  if (app.screen !== 'session' || app.flipped) return;
  app.flipped = true;
  root.querySelector('.flip')?.classList.add('is-flipped');
  setGradesEnabled(true);
}

function onGrade(grade) {
  if (grading || app.screen !== 'session' || !app.flipped) return;
  const item = currentItem(app.session);
  if (!item) return;
  grading = true;

  // 1) 改卡片 + 记当日计数（纯逻辑在 core/review.js）
  //    goalNew 传「封顶后的目标」：词库只剩几个时，今天的目标就是那几个
  const ctxNow = app.ctx || context();
  const res = applyGrade(app.state, grade, item.id, todayKey(), new Date(), { goalNew: ctxNow.goalNew });
  app.pendingLogs.push(res.log);
  app.lastGap = res.card.interval;
  // 2) 立刻落盘：只存学过的卡，所以这里写的 JSON 很小（几 KB ~ 几十 KB）
  app.storage.save(app.state);
  // 3) 声音与「不认识」的抖动（不阻塞，最多等 260ms）
  app.sound.play(grade);

  const advance = () => {
    gradeSession(app.session, grade);
    app.flipped = false;
    grading = false;
    if (isFinished(app.session)) finishSession();
    else render();
  };

  if (grade === 'again') {
    const flip = root.querySelector('.flip');
    if (flip) {
      flip.classList.add('hit');
      setTimeout(advance, 260);
    } else {
      advance();
    }
  } else {
    advance();
  }
}

function finishSession() {
  flushLogs();
  app.lastSession = app.session;
  app.session = null;
  app.screen = 'done';
  app.tab = 'today';
  render();
}

function flushLogs() {
  if (!app.pendingLogs.length) return;
  const n = app.pendingLogs.length;
  try {
    app.storage.appendReviews(app.pendingLogs);
    app.reviewTotal += n;
  } catch (e) {
    console.warn('复习日志写入失败（不影响卡片进度）', e);
  }
  app.pendingLogs = [];
}

// ---------- 反馈 ----------

let toastTimer = null;
function showToast(msg) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1500);
}

// ---------- 交互 ----------

const GRADE_BY_KEY = { 1: 'again', 2: 'hard', 3: 'good' };

root.addEventListener('click', async (e) => {
  const el = e.target.closest?.('[data-action]');
  if (!el) return;
  const { action } = el.dataset;

  switch (action) {
    case 'tab':
      app.tab = el.dataset.tab;
      app.screen = 'home';
      flushLogs();
      render();
      break;
    case 'go-home':
      app.tab = 'today';
      app.screen = 'home';
      render();
      break;
    case 'start-learn':
      startSession('learn');
      break;
    case 'start-review':
      startSession('review');
      break;
    case 'start-review-light':
      startSession('review', 20);
      break;
    case 'start-extra':
      startSession('extra', 20);
      break;
    case 'exit-session':
      flushLogs();
      app.session = null;
      app.screen = 'home';
      app.tab = 'today';
      app.flipped = false;
      render();
      break;
    case 'flip':
      flipCard();
      break;
    case 'grade':
      onGrade(el.dataset.grade);
      break;
    case 'speak': {
      e.stopPropagation();
      const item = currentItem(app.session);
      const w = item ? app.wordOf(item.id) : null; // 生词本里的词也要能发音
      if (w) speak(w.word);
      break;
    }
    case 'pick-deck':
      app.draft.deckId = el.dataset.deck;
      updateEta();
      render();
      break;
    case 'pick-target':
      app.draft.target = Number(el.dataset.target);
      updateEta();
      render();
      break;
    case 'finish-onboard': {
      app.state.config.deckId = app.draft.deckId;
      app.state.config.dailyNewTarget = app.draft.target;
      app.state.config.onboarded = true;
      app.storage.save(app.state);
      await useDeck(app.draft.deckId);
      app.screen = 'home';
      app.tab = 'today';
      render();
      break;
    }

    // ---- Stage 3：错词本 / 统计 / 设置 ----
    case 'start-mistakes': {
      const ids = buildMistakeList(app.state.cards).slice(0, 20);
      if (!ids.length) { showToast('错词本是空的'); break; }
      app.session = buildSession('review', ids);
      app.screen = 'session';
      app.flipped = false;
      render();
      break;
    }
    case 'set-target': {
      const n = Number(el.dataset.target);
      if (!n || n === app.state.config.dailyNewTarget) break;
      app.state.config.dailyNewTarget = n;
      app.storage.save(app.state);
      render();
      showToast(`每天 ${n} 个新词`);
      break;
    }
    case 'switch-deck': {
      const id = el.dataset.deck;
      if (id === app.state.config.deckId) break;
      await useDeck(id);
      app.state.config.deckId = id;
      app.storage.save(app.state);
      app.tab = 'today';
      render();
      showToast(`已切到「${app.deck.name}」`);
      break;
    }
    case 'export-download': {
      exportFile();
      break;
    }
    case 'export-copy': {
      copyExport();
      break;
    }
    case 'import-data': {
      importFromBox();
      break;
    }
    case 'reset-data': {
      resetProgress();
      break;
    }
    case 'force-reload': {
      forceReload();
      break;
    }
    case 'open-custom':
    case 'new-custom':
      openCustomEntry(null);
      break;
    case 'open-custom-list':
      flushLogs();
      app.screen = 'custom-list';
      render();
      break;
    case 'close-custom':
      app.customDraft = { id: null, word: '', meaning: '' };
      app.screen = 'home';
      app.tab = app.tab === 'settings' ? 'settings' : 'today';
      render();
      break;
    case 'save-custom':
      saveCustomEntry();
      break;
    case 'edit-custom':
      openCustomEntry(el.dataset.id);
      break;
    case 'delete-custom':
      deleteCustomEntry(el.dataset.id);
      break;
    case 'cancel-edit-custom':
      openCustomEntry(null);
      break;
    case 'toggle-sound': {
      app.prefs.sound = !app.prefs.sound;
      savePrefs(app.prefs);
      app.sound.setEnabled(app.prefs.sound);
      if (app.prefs.sound) app.sound.play('good');
      render();
      showToast(app.prefs.sound ? '提示音已开' : '提示音已关');
      break;
    }
    default:
      break;
  }
});

// ---------- 备份 / 恢复 / 重置 ----------

/** 记录「刚备份过」，让设置页和首页的提醒归零 */
function markExported() {
  app.prefs.lastExportAt = Date.now();
  savePrefs(app.prefs);
  render();
}

function exportFile() {
  const text = app.storage.exportJSON();
  try {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `word-drill-${todayKey()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    markExported();
    showToast(`已导出（${(text.length / 1024).toFixed(0)}KB）`);
  } catch (err) {
    console.warn(err);
    showToast('导出失败，试试「复制到剪贴板」');
  }
}

async function copyExport() {
  const text = app.storage.exportJSON();
  try {
    await navigator.clipboard.writeText(text);
    markExported();
    showToast(`已复制（${(text.length / 1024).toFixed(0)}KB）`);
  } catch {
    // iOS 非 https 环境下剪贴板不可用
    showToast('复制不可用，请用「导出备份文件」');
  }
}

function importFromBox() {
  const box = document.getElementById('import-box');
  const text = (box?.value || '').trim();
  if (!text) { showToast('先把备份内容粘进来'); return; }
  try {
    const { warnings } = app.storage.importJSON(text);
    app.state = app.storage.load().state;
    app.custom = app.storage.loadCustom();
    app.notes = app.storage.loadNotes();
    app.reviewTotal = app.storage.getReviews().length;
    app.tab = 'today';
    app.screen = 'home';
    render();
    showToast(warnings.length ? `导入完成（${warnings.length} 条提示）` : '导入完成');
  } catch (err) {
    showToast(`导入失败：${err.message}`);
  }
}

function resetProgress() {
  const input = document.getElementById('reset-input');
  if ((input?.value || '').trim() !== '重置') {
    showToast('请先输入「重置」两个字');
    return;
  }
  // 第二次确认：生词本也会一起清空
  const ok = typeof confirm === 'function'
    ? confirm('会连生词本一起清空（包括你手动录的词），不可撤销。确定重置？')
    : true;
  if (!ok) return;

  app.storage.reset();
  app.state = app.storage.load().state;
  app.custom = app.storage.loadCustom();
  app.notes = app.storage.loadNotes();
  app.reviewTotal = 0;
  app.pendingLogs = [];
  app.tab = 'today';
  app.screen = 'home';
  render();
  showToast('进度已清空');
}

/**
 * 逃生口：注销 Service Worker、清掉离线缓存、重新加载。
 * 只清缓存，不碰 localStorage —— 学习数据不会丢。
 */
async function forceReload() {
  const ok = typeof confirm === 'function'
    ? confirm('会清掉离线缓存并重新下载脚本，学习数据不受影响。继续？')
    : true;
  if (!ok) return;

  try {
    const regs = (await navigator.serviceWorker?.getRegistrations?.()) || [];
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  } catch (err) {
    console.warn('[SW] 清理失败', err);
  }
  location.reload();
}

/** 申请持久化存储：降低「空间紧张时被系统回收」的概率。不支持就静默跳过。 */
async function requestPersistence() {
  const s = globalThis.navigator?.storage;
  if (!s || typeof s.persist !== 'function') {
    app.persistState = 'unsupported';
    return;
  }
  try {
    const already = typeof s.persisted === 'function' ? await s.persisted() : false;
    app.persistState = already ? 'granted' : ((await s.persist()) ? 'granted' : 'default');
  } catch {
    app.persistState = 'unknown';
  }
}

// 生词录入页：输入时实时提示，不重渲染（否则会丢焦点）
root.addEventListener('input', (e) => {
  if (app.screen !== 'custom-entry') return;
  const id = e.target?.id;
  if (id === 'cw-word' || id === 'cw-meaning') refreshCustomHint();
});

document.addEventListener('keydown', (e) => {
  if (app.screen === 'custom-entry') {
    if (e.key === 'Enter') {
      const id = e.target?.id;
      if (id === 'cw-word') { e.preventDefault(); document.getElementById('cw-meaning')?.focus(); }
      else if (id === 'cw-meaning') { e.preventDefault(); saveCustomEntry(); }
    } else if (e.key === 'Escape') {
      app.customDraft = { id: null, word: '', meaning: '' };
      app.screen = 'home';
      render();
    }
    return;
  }
  if (app.screen !== 'session') return;
  if (e.code === 'Space') {
    e.preventDefault();
    flipCard();
  } else if (GRADE_BY_KEY[e.key]) {
    e.preventDefault();
    onGrade(GRADE_BY_KEY[e.key]);
  } else if (e.key === 'Escape') {
    app.session = null;
    app.screen = 'home';
    render();
  }
});

function speak(text) {
  if (!('speechSynthesis' in globalThis)) {
    showToast('这个浏览器不支持发音');
    return;
  }
  const clean = String(text).replace(/\s*\/\s*/g, ', ');
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = 'en-US';
  u.rate = 0.9;
  globalThis.speechSynthesis.cancel();
  globalThis.speechSynthesis.speak(u);
}

function updateEta() {
  const meta = app.deckMetas.find((d) => d.id === app.draft.deckId);
  const count = meta?.count || 0;
  app.draftEta = count ? Math.ceil(count / app.draft.target) : '—';
}

// ---------- 启动 ----------

async function boot() {
  app.storage = createStorage(localAdapter());
  const { state, warnings } = app.storage.load();
  app.state = state;
  app.custom = app.storage.loadCustom();
  app.notes = app.storage.loadNotes();
  app.prefs = loadPrefs();
  app.sound.setEnabled(app.prefs.sound);
  app.reviewTotal = app.storage.getReviews().length;
  if (warnings.length) console.warn('[存储]', warnings);

  const manifest = await (await fetch('data/decks/manifest.json')).json();
  app.deckMetas = manifest.decks;

  if (!state.config.onboarded || !state.config.deckId) {
    app.draft.deckId = app.deckMetas[0]?.id || null;
    updateEta();
    app.screen = 'onboard';
    render();
    return;
  }

  await useDeck(state.config.deckId);
  app.screen = 'home';
  render();
}

// 离开页面/切后台时把未落盘的复习日志补写
globalThis.addEventListener?.('pagehide', flushLogs);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') flushLogs();
});

// ---------- Service Worker：离线可用 + 更新提示 ----------

function registerServiceWorker() {
  const nav = globalThis.navigator;
  if (!nav || !('serviceWorker' in nav)) return;

  const loc = globalThis.location;
  const secure = loc && (loc.protocol === 'https:' || loc.hostname === '127.0.0.1' || loc.hostname === 'localhost');
  if (!secure) return; // 局域网 http 下浏览器不提供 SW，静默跳过（不报错）

  // 首次安装也会触发 controllerchange，那种情况不该弹「已更新」
  const hadController = !!nav.serviceWorker.controller;

  nav.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    // 不自动刷新：用户可能正停在一张卡中间
    showToast('已更新到新版，刷新后生效');
  });

  nav.serviceWorker.register('sw.js').then((reg) => {
    // 浏览器对 sw.js 的自动复查有 24 小时上限，主动催一次，避免长期卡旧版
    reg.update?.();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update?.();
    });
  }).catch((err) => {
    console.warn('[SW] 注册失败，联网照常可用', err);
  });
}

boot().catch((e) => {
  console.error(e);
  root.innerHTML = `<div class="page"><h1 class="brand">出错了</h1>
    <p class="muted">${esc(e.message)}</p>
    <p class="muted small">如果是第一次打开，请确认是用 http 服务器访问的（不能双击 index.html）。</p></div>`;
});

registerServiceWorker();
requestPersistence();
