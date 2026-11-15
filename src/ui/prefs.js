// 界面偏好（主题 / 音效）
// 故意存独立 key，不写进 vocab.v1/state —— 业务数据格式一个字都不动。

const KEY = 'vocab.ui';
const DEFAULTS = { sound: true, theme: 'auto' };

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
