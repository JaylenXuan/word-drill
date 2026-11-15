// 日期工具
// 全局约定：调度日期一律用「本地日期字符串」YYYY-MM-DD，不用时间戳。
// 这样跨时区、夏令时、手机改时区都不会让卡片提前/延后到期。

/** 取某个 Date 的本地日期键，如 2026-11-13 */
export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 把 YYYY-MM-DD 解析成本地零点 Date */
export function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** 日期键加减天数，自动处理跨月/跨年/闰年 */
export function addDays(key, n) {
  const dt = parseKey(key);
  dt.setDate(dt.getDate() + n);
  return todayKey(dt);
}

/** b - a 相差的自然日数（b 晚于 a 时为正）。用四舍五入消除夏令时 1 小时误差 */
export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

/** 校验是否形如 2026-11-13 的合法日期 */
export function isValidKey(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const dt = parseKey(key);
  return todayKey(dt) === key;
}
