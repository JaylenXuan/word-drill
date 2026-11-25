/* 自动生成，请勿手改。
 * 生成命令：node tools/build-sw.mjs
 * 版本号 = 预缓存清单里所有文件的 sha256 前 12 位，任何文件变化都会变。
 */
const VERSION = 'wd-ac9cbbeb4dca';
const SHELL = 'shell-' + VERSION;
const RUNTIME = 'runtime-v1';
const NETWORK_TIMEOUT = 3500;

// 部署在子路径（/word-drill/）下，所有地址都以 scope 为基准拼
const abs = (p) => new URL(p, self.registration.scope).href;

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './src/styles.css',
  './src/ui/app.js',
  './src/ui/dom.js',
  './src/ui/prefs.js',
  './src/ui/sound.js',
  './src/ui/views/custom-entry.js',
  './src/ui/views/custom-list.js',
  './src/ui/views/done.js',
  './src/ui/views/home.js',
  './src/ui/views/mistakes.js',
  './src/ui/views/onboard.js',
  './src/ui/views/review.js',
  './src/ui/views/session.js',
  './src/ui/views/settings.js',
  './src/ui/views/stats.js',
  './src/core/audit.js',
  './src/core/custom.js',
  './src/core/dates.js',
  './src/core/queue.js',
  './src/core/review.js',
  './src/core/scheduler.js',
  './src/core/session.js',
  './src/core/stats.js',
  './src/core/storage.js',
  './data/decks/manifest.json',
  './data/decks/ielts-core.json',
  './data/decks/toefl-core.json',
  './assets/whale/icons/apple-touch-icon-180.png',
  './assets/whale/icons/icon-192.png',
  './assets/whale/icons/icon-512.png',
  './assets/whale/icons/maskable-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await cache.addAll(PRECACHE.map(abs));
    await self.skipWaiting(); // 立即进入等待转激活，不用等旧页面全关
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k)),
    );
    await self.clients.claim();
  })());
});

async function fromNetwork(request) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), NETWORK_TIMEOUT);
  try {
    // no-store：绕过浏览器 HTTP 缓存。GitHub Pages 给 HTML 也发了 max-age=600，
    // 不绕的话新版本最多要等 10 分钟才可见。
    return await fetch(request, { signal: ctrl.signal, cache: 'no-store' });
  } finally {
    clearTimeout(timer);
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 页面导航：先试网络（拿到最新 HTML），超时或断网就用缓存的 index.html
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        return await fromNetwork(request);
      } catch {
        const cache = await caches.open(SHELL);
        const cached = await cache.match(abs('./index.html'));
        return cached || Response.error();
      }
    })());
    return;
  }

  // 静态资源：先查预缓存，再查运行时缓存，都没有才走网络并顺手存下
  event.respondWith((async () => {
    const shell = await caches.open(SHELL);
    const hit = await shell.match(request, { ignoreSearch: true });
    if (hit) return hit;

    const runtime = await caches.open(RUNTIME);
    const runtimeHit = await runtime.match(request, { ignoreSearch: true });
    if (runtimeHit) return runtimeHit;

    try {
      const response = await fetch(request);
      if (response.ok && response.type === 'basic') {
        event.waitUntil(runtime.put(request, response.clone()));
      }
      return response;
    } catch {
      return Response.error();
    }
  })());
});
