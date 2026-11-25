const Sound = (() => {
  let ctx = null;
  const init = () => {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
  };
  const note = (freq, dur = 0.1, type = 'sine', vol = 0.15) => {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(ctx.destination);
    o.start(); o.stop(ctx.currentTime + dur);
  };
  return {
    init,
    tick: () => note(900 + Math.random() * 400, 0.03, 'square', 0.04),
    open: () => { [220, 330, 440, 550, 660].forEach((f, i) => setTimeout(() => note(f, 0.08, 'triangle', 0.1), i * 40)); },
    reveal: (rarity) => {
      const pitches = { common: 400, uncommon: 500, rare: 600, epic: 700, legendary: 850, mythic: 1000 };
      const f = pitches[rarity] || 500;
      [1, 1.25, 1.5, 2].forEach((m, i) => setTimeout(() => note(f * m, 0.15, 'sine', 0.15), i * 80));
    },
    coin: () => { note(880, 0.08, 'triangle', 0.15); setTimeout(() => note(1320, 0.15, 'triangle', 0.15), 80); },
    error: () => note(180, 0.2, 'sawtooth', 0.1),
    levelup: () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => note(f, 0.2, 'sine', 0.15), i * 120)); },
    message: () => note(660, 0.05, 'sine', 0.08),
  };
})();
document.addEventListener('click', () => Sound.init(), { once: true });
