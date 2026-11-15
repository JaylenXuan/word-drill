// 「今日新词」计数核对
//
// 口径定义：今日新词 = 今天「第一次被评分」的不同 wordId 数量。
// 同一个词今天评多少次（含补考）都只算 1 个；昨天学过的词今天再评算复习。
//
// 两处独立证据对齐才算通过：
//   1. state.daily[today].newLearned  —— 评分时累加的计数
//   2. 复习日志里 mode==='new' 且 at 是今天的不同 wordId 数 —— 独立记录的事实
// 两条来自不同写入路径，只有它们相等，才能排除「重复计数」或「漏计」。

export function auditNewWords(state, reviews, today) {
  const counted = Number(state?.daily?.[today]?.newLearned) || 0;
  const ids = new Set();
  for (const r of reviews || []) {
    if (!r || r.mode !== 'new') continue;
    const day = String(r.at || '').slice(0, 10);
    if (day === today) ids.add(r.wordId);
  }
  return { counted, logged: ids.size, ok: counted === ids.size };
}
