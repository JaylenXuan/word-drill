// 界面冒烟测试：node tests/smoke-ui.mjs
// 用极简 DOM 桩把 src/ui/app.js 真正跑起来，专抓「白屏」类错误：
// 导入不存在的函数、运行时拼错变量、词库路径写错、渲染 undefined。
// 两个场景：首次打开（引导页）、已有进度（首页）。1 秒内出结果。

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function makeNode() {
  return {
    innerHTML: '',
    textContent: '',
    dataset: {},
    style: {},
    disabled: false,
    classList: { add() {}, remove() {}, contains: () => false, toggle() {} },
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
  };
}

function installGlobals() {
  const nodes = new Map();
  globalThis.document = {
    visibilityState: 'visible',
    getElementById(id) {
      if (!nodes.has(id)) nodes.set(id, makeNode());
      return nodes.get(id);
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
  };
  globalThis.scrollTo = () => {};

  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };

  globalThis.fetch = async (url) => {
    const file = path.join(projectRoot, String(url));
    return { ok: true, status: 200, json: async () => JSON.parse(readFileSync(file, 'utf8')) };
  };

  return { nodes, mem };
}

const strip = (html) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

async function runScenario(name, seed) {
  const { nodes, mem } = installGlobals();
  if (seed) mem.set('vocab.v1/state', JSON.stringify(seed));

  const unhandled = [];
  process.on('unhandledRejection', (e) => unhandled.push(e));

  await import(`../src/ui/app.js?scenario=${encodeURIComponent(name)}`);
  await new Promise((r) => setTimeout(r, 600));

  const html = nodes.get('app')?.innerHTML || '';
  return { html, text: strip(html), mem, unhandled };
}

let failed = 0;
const fail = (msg) => { failed += 1; console.error(`  ✗ ${msg}`); };

console.log('界面冒烟测试');

// 场景 A：全新用户 → 应该看到引导页
{
  const { text, unhandled } = await runScenario('fresh', null);
  if (!text.includes('选词库')) fail(`首次打开没有引导页：${text.slice(0, 100)}`);
  if (!text.includes('雅思词汇真经')) fail('引导页没列出品库');
  if (!text.includes('3632')) fail('引导页没显示词数');
  if (unhandled.length) fail(`首次打开有未处理异常：${unhandled[0]?.message}`);
  else if (text.includes('选词库')) console.log('  ✓ 首次打开 → 引导页（词库 + 每日新词数）');
}

// 场景 B：已有进度的用户 → 应该看到「学习 / 复习」双卡首页
{
  const state = {
    schemaVersion: 1,
    config: { deckId: 'ielts-core', dailyNewTarget: 10, onboarded: true, scheduler: 'sm2-simplified', createdAt: '2026-11-01T00:00:00.000Z' },
    cards: {},
    daily: {},
  };
  const { text, mem, unhandled } = await runScenario('home', state);
  if (!text.includes('学习')) fail(`首页没有「学习」卡：${text.slice(0, 100)}`);
  if (!text.includes('复习')) fail('首页没有「复习」卡');
  if (!text.includes('雅思词汇真经')) fail('首页没显示当前词库');
  if (!text.includes('3632')) fail('首页没显示词库总词数');
  if (unhandled.length) fail(`首页渲染有未处理异常：${unhandled[0]?.message}`);
  if (!mem.has('vocab.v1/state')) fail('状态没有落盘');
  if (!text.includes('Start Now!')) fail('连续 0 天时没有显示 Start Now!');
  if (!failed) console.log('  ✓ 已有进度 → 双卡首页（学习 0/10 · 复习 0 · Start Now!）');
}

// 场景 C：Stage 3 的三个页面（错词本 / 统计 / 设置）能渲染出关键内容
{
  const { createInitialState } = await import('../src/core/storage.js');
  const { createCard } = await import('../src/core/scheduler.js');
  const { todayKey } = await import('../src/core/dates.js');
  const { mistakesView } = await import('../src/ui/views/mistakes.js');
  const { statsView } = await import('../src/ui/views/stats.js');
  const { settingsView } = await import('../src/ui/views/settings.js');

  const today = todayKey();
  const state = createInitialState({ deckId: 'ielts-core', dailyNewTarget: 10, onboarded: true });
  const seed = [
    ['ielts0001', 'atmosphere', '大气层；氛围'],
    ['ielts0002', 'hydrosphere', '水圈'],
    ['ielts0003', 'lithosphere', '岩石圈'],
  ];
  const wordMap = new Map();
  for (const [id, word, meaning] of seed) {
    wordMap.set(id, { id, word, meaning });
    state.cards[id] = {
      ...createCard(id, 'ielts-core', today),
      state: 'review', interval: 2, due: today, reps: 3, lapses: 2, lastGrade: 'again',
      lastReviewedAt: new Date().toISOString(),
    };
  }
  const ctx = {
    today, state, wordMap,
    deck: { name: '雅思词汇真经' },
    entry: { newLearned: 3, reviewsDone: 5, goalNew: 10 },
    due: [], newIds: ['ielts0004'], streak: 5, best: 7, tomorrow: 2,
    total: 3632, learned: 3, newLeftInDeck: 3629, reviewTotal: 42,
    goalNew: 10, customCount: 2, customDue: 1, customAddedToday: 1, customDailyLimit: 20,
    wordOf: (id) => wordMap.get(id) || null,
  };

  try {
    const m = mistakesView(ctx);
    if (!m.includes('错词本') || !m.includes('atmosphere') || !m.includes('错 2')) fail('错词本页面内容不对');
    const s = statsView(ctx);
    if (!s.includes('近 7 天') || !s.includes('词库进度') || !s.includes('42')) fail('统计页内容不对');
    const cfg = settingsView(
      {
        state,
        deckMetas: [{ id: 'ielts-core', name: '雅思词汇真经', count: 3632 }],
        prefs: { sound: true, theme: 'auto', lastExportAt: Date.now() - 86400000 * 21 },
        persistState: 'granted',
      },
      ctx,
    );
    if (!cfg.includes('导出备份文件') || !cfg.includes('导入并覆盖') || !cfg.includes('清空进度')) fail('设置页内容不对');
    if (!cfg.includes('提示音')) fail('设置页缺少提示音开关');
    if (!cfg.includes('数据与备份') || !cfg.includes('上次备份') || !cfg.includes('强制刷新')) fail('设置页缺少备份状态/逃生口');
    if (!cfg.includes('21 天前')) fail('设置页没有正确显示备份天数');
    if (!cfg.includes('主屏 App') && !cfg.includes('Safari 标签页')) fail('设置页没有显示运行环境');
    if (!cfg.includes('已授予')) fail('设置页没有显示持久化存储状态');
    if (!cfg.includes('记一个生词')) fail('设置页缺少生词本入口');
    if (!cfg.includes('快捷指令')) fail('设置页缺少「怎么被叫来」的说明');
    // 鲸鱼娘只能出现在完成页/空状态，且署名不许进界面
    if (cfg.includes('上善无形') || cfg.includes('CC BY-NC')) fail('设置页里出现了署名，应该只在 README');
    const { doneView } = await import('../src/ui/views/done.js');
    const done = doneView({ lastSession: { mode: 'learn' }, state }, ctx);
    if (!done.includes('assets/whale/whale-girl-transparent.png')) fail('完成页没有鲸鱼娘');
    if (!done.includes('今天学到这儿')) fail('完成页未达标文案不对');
    const metCtx = { ...ctx, entry: { newLearned: 10, reviewsDone: 4, goalNew: 10 }, streak: 8, tomorrow: 6 };
    const doneMet = doneView({ lastSession: { mode: 'learn' }, state }, metCtx);
    if (!doneMet.includes('今天学完了')) fail('完成页达标标题不对');
    if (!doneMet.includes('鲸鱼娘开始认得你了')) fail('连续 8 天的文案分档不对');
    // 首页的备份提醒
    const { homeView } = await import('../src/ui/views/home.js');
    const homeNudge = homeView({ ...ctx, backupOverdue: true, backupNever: false, backupDays: 21 });
    if (!homeNudge.includes('备份已 21 天没做')) fail('首页没有显示备份过期提醒');
    const homeClean = homeView({ ...ctx, backupOverdue: false, backupNever: true, backupDays: 0 });
    if (homeClean.includes('备份已')) fail('不该提醒的时候提醒了');
    // 补考阶段的卡片要标出「补考」，不能还写「新词」
    const { sessionView } = await import('../src/ui/views/session.js');
    const { buildSession } = await import('../src/core/session.js');
    const s2 = buildSession('learn', ['ielts0001', 'ielts0002']);
    s2.mainIndex = 2; // 主队列走完
    s2.retry.push({ id: 'ielts0001', tries: 1 });
    const sv = sessionView({ session: s2, wordMap, flipped: false, lastGap: null });
    if (!sv.includes('补考')) fail('补考阶段的卡片没标「补考」');
    if (!sv.includes('补考 1/3')) fail('补考计数没显示');

    // 生词：录入页、生词本列表、复习卡上的「生词」标记
    const { customEntryView } = await import('../src/ui/views/custom-entry.js');
    const { customListView } = await import('../src/ui/views/custom-list.js');
    const entryHtml = customEntryView({
      customDraft: { id: null, word: '', meaning: '', phonetic: '' },
      customUsedToday: 3, customDailyLimit: 20,
    });
    if (!entryHtml.includes('记一个生词') || !entryHtml.includes('今天 3/20')) fail('生词录入页不对');
    if (entryHtml.includes('音标')) fail('生词录入页不该再有音标字段');

    const customApp = {
      custom: { version: 1, words: { 'my-x': { id: 'my-x', word: 'mitigate', meaning: '减轻' } } },
    };
    const listHtml = customListView(customApp, ctx);
    if (!listHtml.includes('mitigate') || !listHtml.includes('生词本')) fail('生词本列表不对');

    const s3 = buildSession('review', ['my-x']);
    const svCustom = sessionView({
      session: s3, wordMap, flipped: false, lastGap: null,
      wordOf: (id) => ({ 'my-x': { word: 'mitigate', meaning: '减轻' } }[id] || wordMap.get(id)),
    });
    if (!svCustom.includes('生词')) fail('生词卡片没有「生词」标记');
    if (!svCustom.includes('mitigate')) fail('生词卡片取不到词条（wordOf 没生效）');
    // 老数据里就算还留着音标，生词卡也不该显示
    const s4 = buildSession('review', ['my-y']);
    const svPhonetic = sessionView({
      session: s4, wordMap, flipped: false, lastGap: null,
      wordOf: () => ({ word: 'abatement', meaning: '减少', phonetic: '/əˈbeɪt.mənt/' }),
    });
    if (svPhonetic.includes('əˈbeɪt')) fail('生词卡仍然显示了音标');

    if (!failed) console.log('  ✓ 错词本 / 统计 / 设置 / 完成页 / 生词录入 / 生词本 都能渲染，界面无署名');
  } catch (e) {
    fail(`Stage 3 页面渲染报错：${e.message}`);
  }
}

if (failed === 0) console.log('\n冒烟通过');
else {
  console.log(`\n冒烟失败 ${failed} 项`);
  process.exitCode = 1;
}

