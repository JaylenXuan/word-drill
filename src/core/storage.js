// 本地持久化
// 两个 key：状态（小、频繁写）与复习日志（只追加、体积大）。
// 通过 adapter 注入存储介质：浏览器用 localStorage，Node 单测用内存实现。

import { todayKey } from './dates.js';
import { CUSTOM_KEY, emptyStore, normalizeStore } from './custom.js';

export const SCHEMA_VERSION = 1;
export const STATE_KEY = 'vocab.v1/state';
export const REVIEWS_KEY = 'vocab.v1/reviews';
export const SCHEDULER_ID = 'sm2-simplified';

/** 全新的空状态（第一次打开 App 时用） */
export function createInitialState({ deckId = null, dailyNewTarget = 10, onboarded = false } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    config: {
      deckId,
      dailyNewTarget: Math.max(1, Number(dailyNewTarget) || 10),
      onboarded,
      scheduler: SCHEDULER_ID,
      createdAt: new Date().toISOString(),
    },
    cards: {},
    daily: {},
  };
}

/** 内存存储（给单测和“无痕试跑”用） */
export function memoryAdapter() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

/** 浏览器 localStorage 存储 */
export function localAdapter(ls = globalThis.localStorage) {
  if (!ls) throw new Error('当前环境没有 localStorage');
  return {
    getItem: (k) => ls.getItem(k),
    setItem: (k, v) => ls.setItem(k, String(v)),
    removeItem: (k) => ls.removeItem(k),
  };
}

/**
 * 补齐/校验状态结构。
 * 目的：以后加字段不会让老数据报错；结构坏了也不会把脏数据写回去。
 */
export function normalizeState(raw) {
  const warnings = [];
  if (!raw || typeof raw !== 'object') {
    warnings.push('本地状态为空或格式不对，已新建');
    return { state: createInitialState(), warnings };
  }
  if (Number(raw.schemaVersion) > SCHEMA_VERSION) {
    throw new Error(`数据版本(${raw.schemaVersion})高于程序版本(${SCHEMA_VERSION})，请更新程序，避免覆盖数据`);
  }
  const base = createInitialState();
  const state = {
    schemaVersion: SCHEMA_VERSION,
    config: { ...base.config, ...(raw.config || {}) },
    cards: {},
    daily: { ...(raw.daily || {}) },
  };
  state.config.dailyNewTarget = Math.max(1, Number(state.config.dailyNewTarget) || 10);

  for (const [id, c] of Object.entries(raw.cards || {})) {
    if (!c || typeof c !== 'object') { warnings.push(`卡片 ${id} 格式异常，已跳过`); continue; }
    state.cards[id] = {
      wordId: c.wordId || id,
      deckId: c.deckId || null,
      state: ['new', 'learning', 'review'].includes(c.state) ? c.state : 'new',
      due: typeof c.due === 'string' ? c.due : todayKey(),
      interval: Number(c.interval) || 0,
      ease: Number(c.ease) || 2.5,
      reps: Number(c.reps) || 0,
      lapses: Number(c.lapses) || 0,
      lastGrade: c.lastGrade || null,
      lastReviewedAt: c.lastReviewedAt || null,
    };
  }
  return { state, warnings };
}

export function createStorage(adapter) {
  const api = {
    /** 读取。返回 {state, reviews, warnings}，永不抛错（除版本过高） */
    load() {
      let state = createInitialState();
      const warnings = [];
      const rawState = adapter.getItem(STATE_KEY);
      if (rawState) {
        try {
          const parsed = JSON.parse(rawState);
          const r = normalizeState(parsed);
          state = r.state;
          warnings.push(...r.warnings);
        } catch (e) {
          warnings.push(`读取状态失败：${e.message}。已用空状态启动，旧数据仍在换不来——请先导出备份再排查`);
        }
      }
      let reviews = [];
      const rawReviews = adapter.getItem(REVIEWS_KEY);
      if (rawReviews) {
        try {
          const parsed = JSON.parse(rawReviews);
          if (Array.isArray(parsed)) reviews = parsed;
          else warnings.push('复习日志格式异常，已忽略');
        } catch {
          warnings.push('复习日志解析失败，已忽略（不影响卡片状态）');
        }
      }
      return { state, reviews, warnings };
    },

    save(state) {
      adapter.setItem(STATE_KEY, JSON.stringify(state));
    },

    /** 追加复习日志（只写增量，避免每次重写整份日志） */
    appendReviews(logs) {
      if (!logs || logs.length === 0) return 0;
      const all = api.getReviews();
      const start = all.length;
      for (const log of logs) all.push({ id: `${start + all.length}-${log.wordId}`, ...log });
      adapter.setItem(REVIEWS_KEY, JSON.stringify(all));
      return all.length;
    },

    getReviews() {
      try {
        const parsed = JSON.parse(adapter.getItem(REVIEWS_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
      } catch {
        return [];
      }
    },

    /** 生词本：独立 key，只在增删改时写 */
    loadCustom() {
      try {
        const raw = adapter.getItem(CUSTOM_KEY);
        return raw ? normalizeStore(JSON.parse(raw)) : emptyStore();
      } catch {
        return emptyStore();
      }
    },

    saveCustom(custom) {
      adapter.setItem(CUSTOM_KEY, JSON.stringify(custom));
    },

    /** 导出成可复制的文本（iOS 上是唯一的备份手段） */
    exportJSON() {
      const { state, reviews } = api.load();
      const custom = api.loadCustom();
      return JSON.stringify(
        { app: 'word-drill', exportVersion: 1, exportedAt: new Date().toISOString(), state, reviews, custom },
        null,
        2,
      );
    },

    /** 导入：校验后整体替换，返回警告列表 */
    importJSON(text) {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new Error('不是合法的 JSON 文本');
      }
      if (!parsed || typeof parsed !== 'object' || !parsed.state) {
        throw new Error('缺少 state 字段，可能不是本 App 导出的文件');
      }
      const { state, warnings } = normalizeState(parsed.state);
      const reviews = Array.isArray(parsed.reviews) ? parsed.reviews : [];
      const custom = normalizeStore(parsed.custom);
      api.save(state);
      adapter.setItem(REVIEWS_KEY, JSON.stringify(reviews));
      adapter.setItem(CUSTOM_KEY, JSON.stringify(custom));
      return { state, reviews, custom, warnings };
    },

    /** 清空全部进度（保留每日新词数、词库、引导状态）；生词本一并清空 */
    reset() {
      const { state } = api.load();
      const fresh = createInitialState({
        deckId: state.config.deckId,
        dailyNewTarget: state.config.dailyNewTarget,
        onboarded: state.config.onboarded,
      });
      api.save(fresh);
      adapter.setItem(REVIEWS_KEY, '[]');
      adapter.setItem(CUSTOM_KEY, JSON.stringify(emptyStore()));
      return fresh;
    },

    raw: adapter,
  };
  return api;
}

/**
 * 说明：本 App 不预建卡片。
 * 词库里没出现在 state.cards 里的词，一律按「新词」处理（见 queue.js / review.js）。
 * 好处是 3632 词的词库初始状态只有几 KB，评分时只重写学过的那些卡。
 */
