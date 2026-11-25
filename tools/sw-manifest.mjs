// Service Worker 的「预缓存清单」与「版本号」来源。
// 生成脚本和测试都引用这里，保证两边永远算的是同一份东西。

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * 要预缓存的文件（相对项目根）。
 * 取舍：
 *  - 进：运行时会用到的 HTML/CSS/JS、manifest、图标、两个词库
 *  - 不进：完成页大图 816KB（第一次看完成页时才下）、docs/ 截图、_preview-100.json
 *  - 不进：src/core/simulate.js（只被测试用，浏览器从不加载）
 */
export const PRECACHE = [
  'index.html',
  'manifest.webmanifest',
  'src/styles.css',
  'src/ui/app.js',
  'src/ui/dom.js',
  'src/ui/prefs.js',
  'src/ui/sound.js',
  'src/ui/speech.js',
  'src/ui/views/custom-entry.js',
  'src/ui/views/custom-list.js',
  'src/ui/views/done.js',
  'src/ui/views/home.js',
  'src/ui/views/mistakes.js',
  'src/ui/views/onboard.js',
  'src/ui/views/review.js',
  'src/ui/views/session.js',
  'src/ui/views/settings.js',
  'src/ui/views/stats.js',
  'src/core/audit.js',
  'src/core/custom.js',
  'src/core/dates.js',
  'src/core/queue.js',
  'src/core/review.js',
  'src/core/scheduler.js',
  'src/core/session.js',
  'src/core/stats.js',
  'src/core/storage.js',
  'data/decks/manifest.json',
  'data/decks/ielts-core.json',
  'data/decks/toefl-core.json',
  'assets/whale/icons/apple-touch-icon-180.png',
  'assets/whale/icons/icon-192.png',
  'assets/whale/icons/icon-512.png',
  'assets/whale/icons/maskable-512.png',
];

/** 预缓存清单 + 版本号：对每个文件的「路径 + 内容」取 sha256，任何文件一改版本必变 */
export function computeVersion() {
  const h = createHash('sha256');
  for (const rel of PRECACHE) {
    h.update(rel);
    h.update('\0');
    h.update(readFileSync(path.join(ROOT, rel)));
    h.update('\0');
  }
  return `wd-${h.digest('hex').slice(0, 12)}`;
}


