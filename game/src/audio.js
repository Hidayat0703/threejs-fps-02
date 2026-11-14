// Procedural sound: every effect is synthesised with WebAudio, so the game ships no
// audio files and makes no network request. The context starts on the first user
// gesture; every call before that is a silent no-op.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.35;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      return false;
    }
    return true;
  }

  function noise(dur, freq, gain, type = 'lowpass', slideTo = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  function tone(freq, dur, gain, type = 'sine', slideTo = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + dur);
  }

  const SHOTS = {
    sidearm: () => { noise(0.09, 2400, 0.5, 'bandpass', 500); tone(180, 0.07, 0.25, 'square', 70); },
    smg: () => { noise(0.07, 3200, 0.42, 'bandpass', 700); tone(220, 0.05, 0.2, 'square', 90); },
    rifle: () => { noise(0.12, 1800, 0.6, 'lowpass', 300); tone(140, 0.09, 0.3, 'square', 55); },
    shotgun: () => { noise(0.18, 1200, 0.7, 'lowpass', 200); tone(110, 0.12, 0.35, 'square', 45); },
    sniper: () => { noise(0.22, 2600, 0.65, 'bandpass', 350); tone(90, 0.16, 0.32, 'sawtooth', 40); },
  };

  return {
    unlock() { ensure(); },
    shot(kind) { (SHOTS[kind] || SHOTS.rifle)(); },
    dryFire() { tone(1200, 0.03, 0.12, 'square'); },
    reload() { tone(900, 0.04, 0.15, 'square'); setTimeout(() => tone(650, 0.04, 0.15, 'square'), 160); },
    hit() { tone(1500, 0.05, 0.2, 'sine'); },
    kill() { tone(880, 0.08, 0.22, 'sine'); setTimeout(() => tone(1318, 0.1, 0.2, 'sine'), 70); },
    hurt() { noise(0.15, 500, 0.35, 'lowpass', 120); },
    plantBeep() { tone(1046, 0.09, 0.2, 'square'); },
    defuseBeep() { tone(784, 0.09, 0.2, 'square'); },
    explosion() { noise(0.7, 900, 0.8, 'lowpass', 60); tone(70, 0.6, 0.5, 'sine', 30); },
    roundWin() { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 0.22, 'triangle'), i * 110)); },
    roundLose() { [392, 330, 262].forEach((f, i) => setTimeout(() => tone(f, 0.18, 0.2, 'triangle'), i * 120)); },
    buy() { tone(660, 0.06, 0.18, 'sine'); setTimeout(() => tone(990, 0.08, 0.18, 'sine'), 60); },
    denied() { tone(220, 0.12, 0.2, 'square', 160); },
  };
}
