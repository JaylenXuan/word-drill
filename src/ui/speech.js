// 单词朗读
//
// 关键点：不要"先 cancel 再 speak"在同一帧里做完。浏览器收到 cancel 后会异步
// 拆掉上一个朗读，紧接着的 speak 常常被吞掉开头一两个音——用户听到的就是"漏前面的音"。
// 所以空闲时直接读；只有确实在读的时候才打断，并留一点间隔再重来。

let lastUtterance = null;

/**
 * @returns {'ok'|'unsupported'|'empty'}
 */
export function speakWord(text, deps = {}) {
  const synth = deps.synth ?? globalThis.speechSynthesis;
  const Utterance = deps.Utterance ?? globalThis.SpeechSynthesisUtterance;
  const delay = deps.delay ?? 150;
  if (!synth || typeof Utterance !== 'function') return 'unsupported';

  // "favour / favor" 这种多拼写，读成停顿
  const clean = String(text || '').replace(/\s*\/\s*/g, ', ').trim();
  if (!clean) return 'empty';

  const u = new Utterance(clean);
  u.lang = 'en-US';
  u.rate = 0.9;
  lastUtterance = u; // 保住引用：Chrome 里被回收会导致读到一半没声

  if (synth.paused) synth.resume?.();

  if (synth.speaking || synth.pending) {
    synth.cancel();
    setTimeout(() => synth.speak(u), delay);
  } else {
    synth.speak(u);
  }
  return 'ok';
}
