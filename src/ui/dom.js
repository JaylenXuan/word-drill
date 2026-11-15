// 极小的 DOM / 格式化工具（不引框架）

/** 转义 HTML，防止词库里的 & < > 把页面搞坏 */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

/** 2026-11-13 → 11月13日 周五 */
export function fmtDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  const w = WEEK[new Date(y, m - 1, d).getDay()];
  return `${m}月${d}日 ${w}`;
}

/** 明天的说法：1 → 明天，3 → 3 天后 */
export function fmtGap(days) {
  if (days <= 0) return '今天';
  if (days === 1) return '明天';
  if (days < 30) return `${days} 天后`;
  if (days < 365) return `约 ${Math.round(days / 30)} 个月后`;
  return '一年后';
}
