// 界面偏好（主题 / 音效 / 上次备份时间）
// 故意存独立 key，不写进 vocab.v1/state —— 业务数据格式一个字都不动。

const KEY = 'vocab.ui';
const DEFAULTS = { sound: true, theme: 'auto', lastExportAt: null };
const DAY = 86400000;

export function loadPrefs() {
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULTS, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePrefs(prefs) {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // 无痕模式写不进去也不影响学习
  }
}

/** 距离上次导出过了几天；从没导出过返回 null */
export function backupAgeDays(prefs, now = Date.now()) {
  const at = Number(prefs?.lastExportAt);
  if (!at || at <= 0) return null;
  return Math.max(0, Math.floor((now - at) / DAY));
}

/**
 * 要不要提醒备份。
 * 规则：导出过 → 超过 14 天提醒；从没导出过 → 学了 20 个词就提醒（太早提醒是噪音）。
 */
export function backupOverdue(prefs, learned = 0, now = Date.now()) {
  const days = backupAgeDays(prefs, now);
  if (days === null) return learned >= 20;
  return days >= 14;
}
