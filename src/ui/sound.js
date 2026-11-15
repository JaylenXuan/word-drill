// 提示音：Web Audio 现场合成，不引任何音频文件
//
// 约束：
// - iOS 要求用户手势后才能出声，所以我们只在「评分」这类点击之后调用
// - 没有 AudioContext（比如 Node 里跑测试）就直接静默，不抛错
// - 音量压得很低，只当手感，不当音效节目

const VOICES = {
  good: { type: 'sine', notes: [[660, 0], [880, 0.075]], gain: 0.06, dur: 0.1 },
  hard: { type: 'sine', notes: [[440, 0]], gain: 0.05, dur: 0.1 },
  again: { type: 'triangle', notes: [[180, 0], [150, 0.07]], gain: 0.05, dur: 0.13 },
};

export function createSound({ enabled = true } = {}) {
  let ctx = null;
  let on = !!enabled;

  function ensure() {
    if (!on) return null;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return null;
    if (!ctx) {
      try {
        ctx = new AC();
      } catch {
        return null;
      }
    }
    // 被系统挂起时尝试恢复；失败就算了，不阻塞学习
    if (ctx.state === 'suspended') {
      try { ctx.resume(); } catch { /* ignore */ }
    }
    return ctx;
  }

  function play(name) {
    const voice = VOICES[name];
    if (!voice) return;
    const ac = ensure();
    if (!ac) return;

    const now = ac.currentTime;
    for (const [freq, offset] of voice.notes) {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      const t0 = now + offset;
      osc.type = voice.type;
      osc.frequency.setValueAtTime(freq, t0);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.exponentialRampToValueAtTime(voice.gain, t0 + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + voice.dur);
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + voice.dur + 0.03);
    }
  }

  return {
    play,
    setEnabled(v) { on = !!v; if (!on && ctx && ctx.state === 'running') { try { ctx.suspend(); } catch { /* ignore */ } } },
    isEnabled: () => on,
    hasContext: () => !!ctx,
  };
}
