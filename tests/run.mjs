// 自检脚本：node tests/run.mjs
// 零依赖（只用 node:assert），失败时进程退出码为 1，可直接接 CI 或手跑。

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { addDays, daysBetween, todayKey, isValidKey } from '../src/core/dates.js';
import { createCard, schedule, previewIntervals, GRADES, MIN_EASE, MAX_EASE, MAX_INTERVAL } from '../src/core/scheduler.js';
import { buildNewQueue, buildReviewQueue, buildMistakeList, newQuota, dueOn } from '../src/core/queue.js';
import { dayMet, computeStreak, overview, recentDays } from '../src/core/stats.js';
import {
  createInitialState, createStorage, memoryAdapter, normalizeState,
  STATE_KEY,
} from '../src/core/storage.js';
import { applyGrade } from '../src/core/review.js';
import { createSound } from '../src/ui/sound.js';
import { loadPrefs, savePrefs } from '../src/ui/prefs.js';
import { buildSession, currentItem, gradeSession, isFinished, remaining, sessionSummary, MAX_RECYCLE } from '../src/core/session.js';
import { simulateDays } from '../src/core/simulate.js';

// ---------- 极简测试框架 ----------
const stat = { pass: 0, fail: 0, failures: [] };
let groupName = '';
function group(name) {
  groupName = name;
  console.log(`\n\u001b[1m${name}\u001b[0m`);
}
function test(name, fn) {
  try {
    fn();
    stat.pass += 1;
    console.log(`  \u001b[32m✓\u001b[0m ${name}`);
  } catch (e) {
    stat.fail += 1;
    stat.failures.push({ group: groupName, name, message: e.message });
    console.log(`  \u001b[31m✗ ${name}\u001b[0m`);
    console.log(`    ${String(e.message).split('\n')[0]}`);
  }
}
const readJSON = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), 'utf8'));

// ---------- 词库数据质量 ----------
group('词库数据（雅思真经 3632 词 + 托福示例 20 词）');
const manifest = readJSON('../data/decks/manifest.json');
const decks = manifest.decks.map((d) => readJSON(`../data/decks/${d.file}`));
const ielts = decks.find((d) => d.id === 'ielts-core');
const toefl = decks.find((d) => d.id === 'toefl-core');

test('manifest 与词库文件一一对应', () => {
  assert.equal(manifest.decks.length, 2);
  assert.deepEqual(decks.map((d) => d.id).sort(), ['ielts-core', 'toefl-core']);
});
test('雅思真经：3600~3700 词，id 与 word 均不重复', () => {
  assert.ok(ielts, '缺少 ielts-core');
  assert.ok(ielts.words.length >= 3600 && ielts.words.length <= 3700, `词数异常：${ielts.words.length}`);
  const ids = ielts.words.map((w) => w.id);
  assert.equal(new Set(ids).size, ids.length, 'id 有重复');
  assert.ok(ids.every((id) => /^ielts\d{4}$/.test(id)), 'id 格式应为 ielts0001');
  const ws = ielts.words.map((w) => w.word.toLowerCase());
  assert.equal(new Set(ws).size, ws.length, '存在重复单词');
});
test('雅思真经：每词都有 word 与中文释义', () => {
  for (const w of ielts.words) {
    assert.ok(w.word && w.word.trim(), `空单词 ${w.id}`);
    assert.ok(w.meaning && w.meaning.trim(), `${w.word} 缺释义`);
  }
});
test('雅思真经：音标全空（源数据就没有，未编造）', () => {
  assert.ok(ielts.words.every((w) => w.phonetic === ''), '不应凭空出现音标');
});
test('例句里粘着的中文已搬进 exampleZh，且只搬不改写', () => {
  const withZh = ielts.words.filter((w) => w.exampleZh);
  assert.equal(withZh.length, 97, '应有 97 条带中文翻译');
  for (const w of withZh) {
    // 允许源数据自带的英文注释（如 accommodation / top banana），但不能是成句英文
    const englishWords = (w.exampleZh.match(/[A-Za-z]{3,}/g) || []).length;
    assert.ok(englishWords <= 4, `${w.word} 的 exampleZh 不像中文翻译：${w.exampleZh}`);
  }
});
test('例句里只剩 3 条中文夹注（句内注释，拆分需改写句子，故意不动）', () => {
  const cjk = ielts.words.filter((w) => /[\u4e00-\u9fa5]/.test(w.example));
  assert.deepEqual(cjk.map((w) => w.id).sort(), ['ielts0125', 'ielts1844', 'ielts1864']);
});
test('雅思真经：来源与版本信息写在词库文件里', () => {
  assert.match(ielts.source.repo, /hefengxian\/my-ielts/);
  assert.match(ielts.source.commit, /^[0-9a-f]{40}$/);
  assert.ok(ielts.source.license.length > 0);
});
test('前 100 词预览与正式词库完全一致', () => {
  const preview = readJSON('../data/decks/_preview-100.json');
  assert.equal(preview.words.length, 100);
  for (let i = 0; i < 100; i += 1) {
    assert.equal(preview.words[i].id, ielts.words[i].id);
    assert.equal(preview.words[i].word, ielts.words[i].word);
    assert.equal(preview.words[i].meaning, ielts.words[i].meaning);
  }
});
test('托福示例词库：20 词，字段齐全且例句含该词', () => {
  assert.equal(toefl.words.length, 20);
  const fields = ['id', 'word', 'phonetic', 'pos', 'meaning', 'enDef', 'example', 'exampleZh'];
  for (const w of toefl.words) {
    for (const f of fields) assert.ok(w[f] && w[f].trim(), `${w.word} 缺 ${f}`);
    assert.match(w.phonetic, /^\/.+\/$/, `${w.word} 音标格式不对`);
    const stem = w.word.slice(0, Math.max(4, w.word.length - 3)).toLowerCase();
    assert.ok(w.example.toLowerCase().includes(stem), `${w.word} 例句里没出现它`);
  }
});
test('修订表 deck-fixes.json 的每条改动都已落到词库（防回退）', () => {
  const fixes = readJSON('../tools/deck-fixes.json');
  const byId = new Map(ielts.words.map((w) => [w.id, w]));
  const missing = [];
  for (const f of fixes) {
    const card = byId.get(f.id);
    if (!card) { missing.push(`${f.id} 词条不存在`); continue; }
    const v = String(card[f.field] ?? '');
    if (!v.toLowerCase().includes(String(f.replace).toLowerCase())) missing.push(`${f.id}/${f.field} 未替换`);
    // find 不在 replace 里时，旧文本必须彻底消失（专抓「重复词被跳过」这类漏改）
    if (!String(f.replace).includes(String(f.find)) && v.includes(f.find)) {
      missing.push(`${f.id}/${f.field} 仍含旧文本「${f.find}」`);
    }
  }
  assert.equal(missing.length, 0, `有 ${missing.length} 条修订未生效：${missing.slice(0, 5).join(', ')}`);
});
test('词库里不再出现已修的错拼词（回归）', () => {
  const bad = ['valcano', 'suprised', 'mesurable', 'windowns', 'habbit', 'sesion', 'flurish',
    'couterbalances', 'callendar', 'joice', 'valable', 'grammer', 'demage', 'milliion', 'portale',
    'machanism', 'hourse', 'execuse', 'chancelllor', 'athelete', 'cabi', 'suitble', 'littel'];
  const hits = [];
  for (const w of ielts.words) {
    const ex = ` ${(w.example || '').toLowerCase()} `;
    for (const b of bad) if (ex.includes(` ${b} `) || ex.includes(` ${b}'`)) hits.push(`${w.word}:${b}`);
  }
  assert.equal(hits.length, 0, `仍残留：${hits.slice(0, 5).join(', ')}`);
});

// ---------- 日期 ----------
group('日期工具（跨月/跨年/闰年/时区安全）');
test('todayKey 输出 YYYY-MM-DD', () => {
  assert.match(todayKey(new Date(2026, 10, 13)), /^2026-11-13$/);
});
test('addDays 跨月', () => assert.equal(addDays('2026-01-31', 1), '2026-02-01'));
test('addDays 跨年', () => assert.equal(addDays('2026-12-31', 1), '2027-01-01'));
test('addDays 闰年 2 月', () => {
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2027-02-28', 1), '2027-03-01');
});
test('addDays 负数回退', () => assert.equal(addDays('2026-03-01', -1), '2026-02-28'));
test('daysBetween 正负与跨月', () => {
  assert.equal(daysBetween('2026-01-01', '2026-01-31'), 30);
  assert.equal(daysBetween('2026-01-31', '2026-01-01'), -30);
  assert.equal(daysBetween('2026-02-28', '2026-03-01'), 1);
});
test('isValidKey 拒绝非法日期', () => {
  assert.equal(isValidKey('2026-11-13'), true);
  assert.equal(isValidKey('2026-13-01'), false);
  assert.equal(isValidKey('2026-02-30'), false);
  assert.equal(isValidKey('26-1-1'), false);
});

// ---------- 调度算法 ----------
group('调度算法（简化 SM-2）');
const T0 = '2026-11-13';
test('新卡初始状态', () => {
  const c = createCard('w1', 'd1', T0);
  assert.equal(c.state, 'new');
  assert.equal(c.interval, 0);
  assert.equal(c.ease, 2.5);
  assert.equal(c.due, T0);
});
test('连续「认识」的间隔序列 1→3→8→22→62→174→365', () => {
  let c = createCard('w1', 'd1', T0);
  let day = T0;
  const seq = [];
  for (let i = 0; i < 7; i += 1) {
    const r = schedule(c, 'good', day);
    c = r.card;
    day = c.due;
    seq.push(c.interval);
  }
  assert.deepEqual(seq, [1, 3, 8, 22, 62, 174, 365]);
});
test('「知道模糊」时每天至少涨 1 天，不会卡死', () => {
  let c = createCard('w1', 'd1', T0);
  const seq = [];
  for (let i = 0; i < 4; i += 1) {
    c = schedule(c, 'hard', T0).card;
    seq.push(c.interval);
  }
  assert.deepEqual(seq, [1, 2, 3, 4]);
});
test('「不认识」回 1 天、错数+1、进入 learning', () => {
  let c = createCard('w1', 'd1', T0);
  c = schedule(c, 'good', T0).card; // 1 天
  c = schedule(c, 'good', c.due).card; // 3 天
  const before = c.ease;
  const r = schedule(c, 'again', c.due);
  assert.equal(r.card.interval, 1);
  assert.equal(r.card.lapses, 1);
  assert.equal(r.card.state, 'learning');
  assert.ok(Math.abs(r.card.ease - (before - 0.2)) < 1e-9);
  assert.equal(r.requeue, true);
});
test('难度因子触底不破 1.3', () => {
  let c = createCard('w1', 'd1', T0);
  for (let i = 0; i < 15; i += 1) c = schedule(c, 'again', T0).card;
  assert.equal(c.ease, MIN_EASE);
});
test('难度因子触顶不超 2.8', () => {
  let c = createCard('w1', 'd1', T0);
  for (let i = 0; i < 15; i += 1) c = schedule(c, 'good', T0).card;
  assert.equal(c.ease, MAX_EASE);
});
test('间隔上限 365 天', () => {
  let c = createCard('w1', 'd1', T0);
  for (let i = 0; i < 20; i += 1) c = schedule(c, 'good', T0).card;
  assert.equal(c.interval, MAX_INTERVAL);
});
test('任何评分都不会把到期日排到今天或更早', () => {
  let c = createCard('w1', 'd1', T0);
  for (const g of GRADES) {
    const r = schedule(c, g, T0);
    assert.ok(r.card.due > T0, `${g} 的到期日 ${r.card.due} 没有晚于今天`);
  }
});
test('所有数值字段都不是 NaN/Infinity', () => {
  let c = createCard('w1', 'd1', T0);
  for (const g of ['good', 'hard', 'again', 'good', 'hard', 'again']) {
    c = schedule(c, g, T0).card;
    for (const k of ['interval', 'ease', 'reps', 'lapses']) {
      assert.ok(Number.isFinite(c[k]), `${k} 变成了 ${c[k]}`);
    }
  }
});
test('日志字段齐全，且首个日志 mode=new', () => {
  const c = createCard('w1', 'd1', T0);
  const { log } = schedule(c, 'good', T0, new Date('2026-11-13T09:00:00'));
  for (const k of ['wordId', 'at', 'grade', 'mode', 'elapsedDays', 'prevInterval', 'nextInterval', 'prevEase', 'nextEase']) {
    assert.ok(k in log, `日志缺少 ${k}`);
  }
  assert.equal(log.mode, 'new');
  assert.equal(schedule(schedule(c, 'good', T0).card, 'good', addDays(T0, 1)).log.mode, 'review');
});
test('elapsedDays 记录真实间隔', () => {
  const c = createCard('w1', 'd1', T0);
  const first = schedule(c, 'good', T0, new Date(`${T0}T09:00:00`)).card;
  const second = schedule(first, 'good', addDays(T0, 5), new Date(`${addDays(T0, 5)}T09:00:00`));
  assert.equal(second.log.elapsedDays, 5);
});
test('未知评分直接报错（防止 UI 传错参数静默毁数据）', () => {
  assert.throws(() => schedule(createCard('w1', 'd1', T0), 'perfect'), /未知评分/);
});
test('previewIntervals 三种评分都给得出天数', () => {
  const p = previewIntervals(createCard('w1', 'd1'));
  assert.deepEqual(Object.keys(p).sort(), ['again', 'good', 'hard']);
  for (const v of Object.values(p)) assert.ok(Number.isInteger(v) && v >= 1);
});

// ---------- 队列 ----------
group('今日队列');
const words = Array.from({ length: 6 }, (_, i) => ({ id: `w${i + 1}` }));
function freshCards() {
  const cards = {};
  for (const w of words) cards[w.id] = createCard(w.id, 'd1', T0);
  return cards;
}
test('newQuota 随当日已学递减，不会为负', () => {
  assert.equal(newQuota({ dailyNewTarget: 5 }, {}, T0), 5);
  assert.equal(newQuota({ dailyNewTarget: 5 }, { [T0]: { newLearned: 3 } }, T0), 2);
  assert.equal(newQuota({ dailyNewTarget: 5 }, { [T0]: { newLearned: 9 } }, T0), 0);
});
test('新词队列按词库顺序取，且跳过已学', () => {
  const cards = freshCards();
  cards.w1.state = 'review';
  cards.w1.interval = 1;
  cards.w1.due = addDays(T0, 1);
  const q = buildNewQueue(words, cards, { dailyNewTarget: 3 }, {}, T0);
  assert.deepEqual(q, ['w2', 'w3', 'w4']);
});
test('名额用完后新词队列为空', () => {
  assert.deepEqual(buildNewQueue(words, freshCards(), { dailyNewTarget: 2 }, { [T0]: { newLearned: 2 } }, T0), []);
});
test('复习队列只取到期卡，按到期日升序、同到期按错数降序', () => {
  const cards = freshCards();
  cards.w1 = { ...cards.w1, state: 'review', due: addDays(T0, 2), interval: 3, lapses: 0 };
  cards.w2 = { ...cards.w2, state: 'review', due: addDays(T0, -1), interval: 3, lapses: 0 };
  cards.w3 = { ...cards.w3, state: 'review', due: T0, interval: 1, lapses: 3 };
  cards.w4 = { ...cards.w4, state: 'review', due: T0, interval: 1, lapses: 1 };
  assert.deepEqual(buildReviewQueue(cards, T0), ['w2', 'w3', 'w4']);
});
test('错词本：最近一次不认识 或 错>=2 次', () => {
  const cards = freshCards();
  cards.w1 = { ...cards.w1, state: 'review', lastGrade: 'again', lapses: 1 };
  cards.w2 = { ...cards.w2, state: 'review', lastGrade: 'good', lapses: 2 };
  cards.w3 = { ...cards.w3, state: 'review', lastGrade: 'good', lapses: 0 };
  assert.deepEqual(buildMistakeList(cards), ['w2', 'w1']);
});
test('dueOn 统计某天的到期数（明日预告）', () => {
  const cards = freshCards();
  cards.w1 = { ...cards.w1, state: 'review', due: addDays(T0, 1) };
  cards.w2 = { ...cards.w2, state: 'review', due: addDays(T0, 1) };
  assert.equal(dueOn(cards, addDays(T0, 1)), 2);
});

// ---------- 统计/连续天数 ----------
group('统计与连续天数');
test('goalNew=0 的日子不算打卡（防止改设置刷连续）', () => {
  assert.equal(dayMet({ newLearned: 5, goalNew: 0 }), false);
  assert.equal(dayMet({ newLearned: 5, goalNew: 5 }), true);
  assert.equal(dayMet({ newLearned: 4, goalNew: 5 }), false);
});
test('连续 3 天达标', () => {
  const daily = {
    [addDays(T0, -2)]: { newLearned: 10, goalNew: 10 },
    [addDays(T0, -1)]: { newLearned: 10, goalNew: 10 },
    [T0]: { newLearned: 10, goalNew: 10 },
  };
  assert.equal(computeStreak(daily, T0).current, 3);
});
test('今天还没学不算断签（从昨天往前数）', () => {
  const daily = {
    [addDays(T0, -2)]: { newLearned: 10, goalNew: 10 },
    [addDays(T0, -1)]: { newLearned: 10, goalNew: 10 },
    [T0]: { newLearned: 2, goalNew: 10 },
  };
  assert.equal(computeStreak(daily, T0).current, 2);
});
test('漏一天就断，且最长记录保留', () => {
  const daily = {
    [addDays(T0, -5)]: { newLearned: 10, goalNew: 10 },
    [addDays(T0, -4)]: { newLearned: 10, goalNew: 10 },
    [addDays(T0, -3)]: { newLearned: 10, goalNew: 10 },
    // -2 漏掉
    [addDays(T0, -1)]: { newLearned: 10, goalNew: 10 },
    [T0]: { newLearned: 10, goalNew: 10 },
  };
  const s = computeStreak(daily, T0);
  assert.equal(s.current, 2);
  assert.equal(s.best, 3);
});
test('overview 给出首页需要的数字', () => {
  const cards = freshCards();
  cards.w1 = { ...cards.w1, state: 'review' };
  const o = overview({ cards, words, daily: { [T0]: { newLearned: 1, reviewsDone: 4, goalNew: 5 } }, today: T0, dueCount: 2, newCount: 4 });
  assert.equal(o.learned, 1);
  assert.equal(o.total, 6);
  assert.equal(o.todayNew, 1);
  assert.equal(o.todayGoal, 5);
  assert.equal(o.dueCount, 2);
  assert.equal(o.streak, 0);
});
test('recentDays 固定返回 7 天且按时间升序', () => {
  const r = recentDays({}, T0, 7);
  assert.equal(r.length, 7);
  assert.equal(r[6].date, T0);
  assert.equal(r[0].date, addDays(T0, -6));
});

// ---------- 存储 ----------
group('本地持久化');
test('内存存储往返一致', () => {
  const s = createStorage(memoryAdapter());
  const st = createInitialState({ deckId: 'ielts-core', dailyNewTarget: 15 });
  s.save(st);
  const back = s.load();
  assert.equal(back.state.config.deckId, 'ielts-core');
  assert.equal(back.state.config.dailyNewTarget, 15);
  assert.deepEqual(back.warnings, []);
});
test('空存储返回干净初始状态', () => {
  const s = createStorage(memoryAdapter());
  const { state, reviews, warnings } = s.load();
  assert.equal(state.cards ? Object.keys(state.cards).length : 0, 0);
  assert.equal(reviews.length, 0);
  assert.deepEqual(warnings, []);
});
test('脏卡片被跳过而不是整个崩掉', () => {
  const { state, warnings } = normalizeState({ schemaVersion: 1, config: {}, cards: { bad: null, ok: { wordId: 'ok', state: 'review' } }, daily: {} });
  assert.ok(!('bad' in state.cards));
  assert.ok('ok' in state.cards);
  assert.equal(warnings.length, 1);
});
test('数据版本高于程序时拒绝加载（防覆盖）', () => {
  assert.throws(() => normalizeState({ schemaVersion: 99 }), /版本/);
});
test('导出→导入 往返一致', () => {
  const s = createStorage(memoryAdapter());
  const st = createInitialState({ deckId: 'toefl-core', dailyNewTarget: 8 });
  st.cards.w1 = createCard('w1', 'toefl-core', T0);
  st.daily[T0] = { newLearned: 3, reviewsDone: 2, goalNew: 8 };
  s.save(st);
  s.appendReviews([{ wordId: 'w1', grade: 'good', at: `${T0}T09:00:00.000Z` }]);
  const text = s.exportJSON();

  const other = createStorage(memoryAdapter());
  const r = other.importJSON(text);
  assert.equal(r.state.config.dailyNewTarget, 8);
  assert.equal(r.state.cards.w1.wordId, 'w1');
  assert.equal(r.state.daily[T0].newLearned, 3);
  assert.equal(r.reviews.length, 1);
});
test('导入损坏文本时报错而不是清空', () => {
  const s = createStorage(memoryAdapter());
  s.save(createInitialState({ dailyNewTarget: 12 }));
  assert.throws(() => s.importJSON('{不是 json'), /JSON/);
  assert.throws(() => s.importJSON('{"foo":1}'), /state/);
  assert.equal(s.load().state.config.dailyNewTarget, 12);
});
test('重置清空进度但保留设置', () => {
  const s = createStorage(memoryAdapter());
  const st = createInitialState({ deckId: 'ielts-core', dailyNewTarget: 20, onboarded: true });
  st.cards.w1 = createCard('w1', 'ielts-core', T0);
  s.save(st);
  s.appendReviews([{ wordId: 'w1', grade: 'good' }]);
  const fresh = s.reset();
  assert.equal(Object.keys(fresh.cards).length, 0);
  assert.equal(fresh.config.dailyNewTarget, 20);
  assert.equal(fresh.config.deckId, 'ielts-core');
  assert.equal(fresh.config.onboarded, true, '重置不应把用户赶回引导页');
  assert.equal(s.getReviews().length, 0);
});
test('追加日志是增量写入，不丢历史', () => {
  const s = createStorage(memoryAdapter());
  s.appendReviews([{ wordId: 'a', grade: 'good' }]);
  s.appendReviews([{ wordId: 'b', grade: 'hard' }]);
  const all = s.getReviews();
  assert.equal(all.length, 2);
  assert.ok(all.every((l) => typeof l.id === 'string' && l.id.length > 0));
});
test('不预建卡片：词库里没卡片的词直接按新词算', () => {
  const st = createInitialState({ deckId: 'ielts-core' });
  assert.equal(Object.keys(st.cards).length, 0);
  const q = buildNewQueue(decks[0].words.slice(0, 5), st.cards, st.config, st.daily, T0);
  assert.equal(q.length, 5);
});

// ---------- 评分动作 ----------
group('评分动作（卡片 + 当日计数）');
test('新词评分计入「今日新词」，复习评分计入「今日复习」', () => {
  const st = createInitialState({ dailyNewTarget: 10 });
  st.cards.w1 = createCard('w1', 'd1', T0);
  st.cards.w2 = { ...createCard('w2', 'd1', T0), state: 'review', interval: 3, due: T0 };
  let r = applyGrade(st, 'good', 'w1', T0);
  assert.equal(r.wasNew, true);
  r = applyGrade(st, 'good', 'w2', T0);
  assert.equal(r.wasNew, false);
  assert.equal(st.daily[T0].newLearned, 1);
  assert.equal(st.daily[T0].reviewsDone, 1);
  assert.equal(st.daily[T0].goalNew, 10);
});
test('中途改每日新词数，不影响今天的打卡口径', () => {
  const st = createInitialState({ dailyNewTarget: 10 });
  st.cards.w1 = createCard('w1', 'd1', T0);
  applyGrade(st, 'good', 'w1', T0);
  st.config.dailyNewTarget = 3; // 用户当天改成 3
  assert.equal(st.daily[T0].goalNew, 10, '今天的目标应冻结为 10');
});
test('给「没有卡片的词」评分会自动建卡（而不是报错）', () => {
  const st = createInitialState({ deckId: 'ielts-core' });
  const r = applyGrade(st, 'good', 'ielts0001', T0);
  assert.equal(r.wasNew, true);
  assert.ok(st.cards.ielts0001, '应该自动建卡');
  assert.equal(st.cards.ielts0001.deckId, 'ielts-core');
  assert.equal(st.daily[T0].newLearned, 1);
});

// ---------- 学习会话 ----------
group('学习会话（卡片队列 + 不认识重排）');
test('会话队列按给定顺序构建，游标从头开始', () => {
  const s = buildSession('learn', ['a', 'b', 'c']);
  assert.equal(remaining(s), 3);
  assert.equal(currentItem(s).id, 'a');
  assert.equal(isFinished(s), false);
});
test('评分推进游标，空队列直接结束', () => {
  const s = buildSession('review', ['a']);
  gradeSession(s, 'good');
  assert.equal(isFinished(s), true);
  assert.equal(currentItem(s), null);
  assert.equal(gradeSession(s, 'good').requeued, false);
});
test('「不认识」的词排到队尾再看一次', () => {
  const s = buildSession('learn', ['a', 'b']);
  const r = gradeSession(s, 'again');
  assert.equal(r.requeued, true);
  assert.equal(remaining(s), 2); // b 和重排的 a
  assert.equal(s.queue[s.queue.length - 1].id, 'a');
  assert.equal(s.queue[s.queue.length - 1].requeues, 1);
});
test(`同一张卡最多重排 ${MAX_RECYCLE} 次，不会死循环`, () => {
  const s = buildSession('learn', ['a']);
  let requeues = 0;
  for (let i = 0; i < 10 && !isFinished(s); i += 1) {
    if (gradeSession(s, 'again').requeued) requeues += 1;
  }
  assert.equal(requeues, MAX_RECYCLE);
  assert.equal(isFinished(s), true);
  assert.equal(s.graded, MAX_RECYCLE + 1);
});
test('会话统计区分「评分次数」与「不同单词数」', () => {
  const s = buildSession('learn', ['a', 'b']);
  gradeSession(s, 'again'); // a 重排
  gradeSession(s, 'good'); // b
  gradeSession(s, 'good'); // a 第二次
  const sum = sessionSummary(s);
  assert.equal(sum.graded, 3);
  assert.equal(sum.unique, 2);
  assert.equal(sum.again, 1);
});

// ---------- 端到端：第一次学 10 个新词 ----------
group('端到端：第一次学 10 个新词（用真实词库）');
{
  const st = createInitialState({ deckId: 'ielts-core', dailyNewTarget: 10, onboarded: true });
  const words = ielts.words.slice(0, 12);

  test('没建过卡片的词也算新词，按词库顺序取前 10 个', () => {
    const q = buildNewQueue(words, st.cards, st.config, st.daily, T0);
    assert.equal(q.length, 10);
    assert.equal(q[0], words[0].id);
    assert.equal(q[9], words[9].id);
  });

  test('学完 10 个：打卡达成、卡片转 review、明日到期 10 张', () => {
    for (const id of buildNewQueue(words, st.cards, st.config, st.daily, T0)) {
      applyGrade(st, 'good', id, T0, new Date(`${T0}T20:00:00`));
    }
    assert.equal(st.daily[T0].newLearned, 10);
    assert.equal(st.daily[T0].goalNew, 10);
    assert.equal(dayMet(st.daily[T0]), true);
    assert.equal(computeStreak(st.daily, T0).current, 1);
    assert.equal(Object.keys(st.cards).length, 10, '只应存学过的 10 张卡');
    assert.ok(Object.values(st.cards).every((c) => c.state === 'review' && c.due === addDays(T0, 1)));
    assert.equal(buildReviewQueue(st.cards, T0).length, 0, '今天不该有到期');
    assert.equal(buildReviewQueue(st.cards, addDays(T0, 1)).length, 10);
  });

  test('刷新续接：今日名额已满；把目标调到 12 就能继续学第 11、12 个', () => {
    const storage = createStorage(memoryAdapter());
    storage.save(st);
    const back = storage.load().state;
    assert.equal(back.daily[T0].newLearned, 10);
    assert.equal(Object.keys(back.cards).length, 10);
    assert.equal(buildNewQueue(words, back.cards, back.config, back.daily, T0).length, 0);
    back.config.dailyNewTarget = 12;
    assert.deepEqual(buildNewQueue(words, back.cards, back.config, back.daily, T0), [words[10].id, words[11].id]);
  });

  test('存 3632 词词库时，状态体积仍然很小（只存学过的卡）', () => {
    const kb = Buffer.byteLength(JSON.stringify(st), 'utf8') / 1024;
    assert.ok(kb < 8, `状态有 ${kb.toFixed(1)}KB，说明把没学的词也存进去了`);
    console.log(`      学了 10 个词后，状态体积 ${kb.toFixed(1)} KB（而非全量 700KB+）`);
  });
}

// ---------- 提示音与偏好 ----------
group('提示音 / 界面偏好（不碰业务数据）');
test('没有 AudioContext 时静默降级，不抛错', () => {
  const s = createSound();
  assert.doesNotThrow(() => s.play('good'));
  assert.doesNotThrow(() => s.play('again'));
  assert.doesNotThrow(() => s.play('不存在的音'));
  assert.equal(s.hasContext(), false, 'Node 里不该创建音频上下文');
});
test('关掉之后不再创建音频上下文', () => {
  const s = createSound({ enabled: false });
  s.play('hard');
  assert.equal(s.isEnabled(), false);
  assert.equal(s.hasContext(), false);
});
test('开关可以来回切', () => {
  const s = createSound({ enabled: false });
  s.setEnabled(true);
  assert.equal(s.isEnabled(), true);
  s.setEnabled(false);
  assert.equal(s.isEnabled(), false);
});
test('偏好默认值：音效开、主题跟随系统', () => {
  const p = loadPrefs();
  assert.equal(p.sound, true);
  assert.equal(p.theme, 'auto');
});
test('偏好存在独立 key，不污染业务状态', () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  savePrefs({ sound: false, theme: 'dark' });
  assert.deepEqual([...mem.keys()], ['vocab.ui']);
  assert.equal(loadPrefs().sound, false);
  delete globalThis.localStorage;
});

// ---------- 配色对比度 ----------
group('配色对比度（WCAG 2.1，直接读 styles.css 的变量）');
{
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const darkAt = css.indexOf('@media (prefers-color-scheme: dark)');
  const grab = (block) => {
    const out = {};
    for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\b/g)) out[m[1]] = m[2];
    return out;
  };
  const light = grab(css.slice(0, darkAt));
  const dark = grab(css.slice(darkAt));

  const chan = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const lum = (h) => chan(h)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0);
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  };

  const PAIRS = [
    ['正文 / 页面', 'text', 'bg', 4.5],
    ['正文 / 卡片', 'text', 'bg-elev', 4.5],
    ['次要 / 页面', 'text-muted', 'bg', 4.5],
    ['次要 / 卡片', 'text-muted', 'bg-elev', 4.5],
    ['选中文字 / 卡片', 'accent-text', 'bg-elev', 4.5],
    ['选中文字 / 浅底', 'accent-text', 'accent-soft', 4.5],
    ['主按钮', 'cta-ink', 'cta', 4.5],
    ['认识按钮', 'ok-ink', 'ok-btn', 4.5],
    ['不认识文字', 'bad-ink', 'bg-elev', 4.5],
    ['模糊文字', 'warn-ink', 'bg-elev', 4.5],
    ['连击徽章', 'gold-ink', 'bg-elev', 4.5],
    ['复习大数字', 'accent', 'bg-elev', 3.0],
  ];

  test('浅色主题所有文字对都达标', () => {
    const bad = PAIRS.map(([label, fg, bg, need]) => [label, ratio(light[fg], light[bg]), need])
      .filter(([, r, need]) => r < need);
    assert.deepEqual(bad.map(([l, r]) => `${l}=${r.toFixed(2)}`), [], '对比度不足');
  });
  test('深色主题所有文字对都达标', () => {
    const bad = PAIRS.map(([label, fg, bg, need]) => [label, ratio(dark[fg], dark[bg]), need])
      .filter(([, r, need]) => r < need);
    assert.deepEqual(bad.map(([l, r]) => `${l}=${r.toFixed(2)}`), [], '对比度不足');
  });
  test('两套主题都定义了完整的关键令牌', () => {
    for (const key of ['cta', 'cta-ink', 'ok-btn', 'ok-ink', 'accent-text', 'gold-ink']) {
      assert.ok(light[key], `浅色缺 --${key}`);
      assert.ok(dark[key], `深色缺 --${key}`);
    }
  });
}

// ---------- 主屏安装 ----------
group('主屏安装（PWA 外壳）');
{
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const manifest = readJSON('../manifest.webmanifest');

  test('index.html 声明了 manifest / 图标 / 安全区', () => {
    assert.match(html, /rel="manifest"/, '缺 manifest');
    assert.match(html, /apple-touch-icon/, '缺 apple-touch-icon');
    assert.match(html, /viewport-fit=cover/, '缺 viewport-fit=cover（安全区依赖它）');
    assert.match(html, /apple-mobile-web-app-capable/, '缺全屏声明');
  });
  test('manifest 适合全屏打开', () => {
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.start_url, './');
    assert.ok(manifest.name && manifest.short_name, '缺名字');
    assert.ok(manifest.icons.length >= 2, '图标太少');
    assert.ok(manifest.icons.some((i) => (i.purpose || '').includes('maskable')), '缺 maskable 图标');
  });
  test('manifest 里的图标真实存在且是 PNG', () => {
    for (const icon of manifest.icons) {
      const buf = readFileSync(new URL(`../${icon.src}`, import.meta.url));
      assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${icon.src} 不是 PNG`);
      assert.ok(buf.length > 1024, `${icon.src} 体积异常`);
    }
  });
  test('apple-touch-icon 是 180×180', () => {
    const buf = readFileSync(new URL('../assets/whale/icons/apple-touch-icon-180.png', import.meta.url));
    assert.deepEqual([buf.readUInt32BE(16), buf.readUInt32BE(20)], [180, 180]);
  });
  test('明暗两套主题色都声明了（状态栏不串色）', () => {
    assert.match(html, /theme-color[^>]*#FBF9F5/i);
    assert.match(html, /theme-color[^>]*#141A2B/i);
  });
}

// ---------- 离线能力 ----------
group('离线能力（Service Worker）');
{
  const { PRECACHE, computeVersion } = await import('../tools/sw-manifest.mjs');
  const swSrc = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const repoRoot = new URL('..', import.meta.url);

  test('sw.js 是最新的（版本号 == 现场算的哈希）', () => {
    const inFile = swSrc.match(/const VERSION = '([^']+)'/)?.[1];
    const actual = computeVersion();
    assert.equal(inFile, actual, 'sw.js 过期了，跑一下 node tools/build-sw.mjs');
  });
  test('预缓存清单里的文件都真实存在', () => {
    for (const rel of PRECACHE) {
      assert.ok(readFileSync(new URL(rel, repoRoot)).length > 0, `${rel} 不存在或为空`);
    }
  });
  test('sw.js 里列出的清单与 sw-manifest 一致', () => {
    for (const rel of PRECACHE) {
      assert.ok(swSrc.includes(`'./${rel}'`), `sw.js 漏了 ${rel}`);
    }
  });
  test('app.js 依赖的所有模块都在预缓存里（防止新模块漏加）', () => {
    const seen = new Set();
    const walk = (rel) => {
      if (seen.has(rel)) return;
      seen.add(rel);
      const src = readFileSync(new URL(rel, repoRoot), 'utf8');
      for (const m of src.matchAll(/from '(\.[^']+)'/g)) {
        walk(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
      }
    };
    walk('src/ui/app.js');
    const missing = [...seen].filter((f) => !PRECACHE.includes(f));
    assert.deepEqual(missing, [], `这些模块没进预缓存：${missing.join(', ')}`);
    assert.ok(seen.size >= 15, `只扫到 ${seen.size} 个模块，依赖图可能没解析对`);
  });
  test('index.html 引用的本地资源都在预缓存里', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const ref = m[1];
      if (/^https?:/.test(ref) || ref.endsWith('.webmanifest')) {
        if (ref === 'manifest.webmanifest') assert.ok(PRECACHE.includes(ref), '清单没预缓存');
        continue;
      }
      assert.ok(PRECACHE.includes(ref), `${ref} 没进预缓存`);
    }
  });
  test('预缓存路径全是相对的（子路径部署的命门）', () => {
    for (const rel of PRECACHE) {
      assert.ok(!rel.startsWith('/'), `${rel} 是绝对路径，部署到 /word-drill/ 下会 404`);
    }
  });
  test('manifest 的 id / start_url / scope 都是相对路径', () => {
    const m = readJSON('../manifest.webmanifest');
    for (const key of ['id', 'start_url', 'scope']) {
      assert.equal(m[key], './', `${key} 应该是 './'`);
    }
  });
}

// ---------- 90 天模拟 ----------
group('90 天模拟（算法在真实时间轴上的行为）');
const DAYS = 90;
const TARGET = 10;
// 造 1200 个假词，保证 90 天里每天都有新词可学
const simWords = Array.from({ length: 1200 }, (_, i) => ({ id: `sim-${String(i + 1).padStart(4, '0')}` }));
const sim = simulateDays({ words: simWords, days: DAYS, target: TARGET, seed: 20261113, startDate: '2026-01-01' });

test(`模拟了 ${DAYS} 天，且每天新词都达到 ${TARGET} 个`, () => {
  assert.equal(sim.timeline.length, DAYS);
  const bad = sim.timeline.filter((d) => d.newLearned !== TARGET);
  assert.equal(bad.length, 0, `有 ${bad.length} 天新词数不等于 ${TARGET}`);
});
test('复习次数为正（算法确实在安排复习，不是只学一遍）', () => {
  const total = sim.timeline.reduce((a, d) => a + d.reviewsDone, 0);
  assert.ok(total > 0, '总复习次数为 0');
  console.log(`      90 天总复习 ${total} 次，日均 ${(total / DAYS).toFixed(1)} 次`);
});
test('所有卡片状态合法，间隔与难度因子始终在区间内', () => {
  for (const c of Object.values(sim.state.cards)) {
    assert.ok(['new', 'learning', 'review'].includes(c.state), `非法状态 ${c.state}`);
    if (c.interval > 0) {
      assert.ok(Number.isInteger(c.interval) && c.interval >= 1 && c.interval <= MAX_INTERVAL, `间隔越界 ${c.interval}`);
    }
    assert.ok(c.ease >= MIN_EASE && c.ease <= MAX_EASE, `难度因子越界 ${c.ease}`);
    assert.ok(isValidKey(c.due), `到期日非法 ${c.due}`);
    assert.ok(Number.isInteger(c.reps) && c.reps >= 0);
    assert.ok(Number.isInteger(c.lapses) && c.lapses >= 0);
  }
});
test('每条日志的 nextInterval 与 nextEase 都合法', () => {
  assert.ok(sim.reviews.length > 0);
  for (const l of sim.reviews) {
    assert.ok(GRADES.includes(l.grade), `非法评分 ${l.grade}`);
    assert.ok(l.nextInterval >= 1 && l.nextInterval <= MAX_INTERVAL, `日志间隔越界 ${l.nextInterval}`);
    assert.ok(l.nextEase >= MIN_EASE && l.nextEase <= MAX_EASE, `日志难度越界 ${l.nextEase}`);
    assert.ok(!Number.isNaN(Date.parse(l.at)), '日志时间不可解析');
  }
});
test('平均间隔随时间增长（说明真的在延长间隔）', () => {
  const early = sim.timeline[9].avgInterval;
  const late = sim.timeline[89].avgInterval;
  assert.ok(late > early * 2, `平均间隔没长起来：第10天 ${early} → 第90天 ${late}`);
  console.log(`      平均间隔：第 10 天 ${early} 天 → 第 90 天 ${late} 天`);
});
test('每天到期量不会无限爆炸（上限 400 张）', () => {
  const peak = Math.max(...sim.timeline.map((d) => d.due));
  assert.ok(peak < 400, `单日到期峰值 ${peak} 张，超出可接受范围`);
  console.log(`      单日复习峰值 ${peak} 张，第 90 天 ${sim.timeline[89].due} 张`);
});
test('连续天数按模拟数据正确累计（每天达标）', () => {
  assert.equal(sim.streak.current, DAYS, `期望连续 ${DAYS} 天，实际 ${sim.streak.current}`);
});
test('状态序列化体积可控（localStorage 5MB 限制内）', () => {
  const bytes = Buffer.byteLength(JSON.stringify({ state: sim.state, reviews: sim.reviews }), 'utf8');
  const mb = bytes / 1024 / 1024;
  assert.ok(mb < 4, `体积 ${mb.toFixed(2)}MB 接近 localStorage 上限`);
  console.log(`      90 天后数据体积约 ${mb.toFixed(2)} MB（含 ${sim.reviews.length} 条日志）`);
});
test('刷新续接：save → load 后学习状态一致', () => {
  const s = createStorage(memoryAdapter());
  s.save(sim.state);
  s.appendReviews(sim.reviews.slice(0, 50));
  const back = s.load();
  assert.equal(Object.keys(back.state.cards).length, Object.keys(sim.state.cards).length);
  assert.equal(back.reviews.length, 50);
  assert.equal(back.state.daily['2026-01-01'].newLearned, TARGET);
});

// ---------- 汇总 ----------
const total = stat.pass + stat.fail;
console.log(`\n${'─'.repeat(52)}`);
if (stat.fail === 0) {
  console.log(`\u001b[32m全部通过：${stat.pass}/${total}\u001b[0m`);
} else {
  console.log(`\u001b[31m失败 ${stat.fail} 项，通过 ${stat.pass}/${total}\u001b[0m`);
  for (const f of stat.failures) console.log(`  - [${f.group}] ${f.name}`);
  process.exitCode = 1;
}
