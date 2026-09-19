export class GameAudio {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx({ latencyHint: "interactive" });
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.7;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(muted ? 0 : 0.7, this.ctx.currentTime, 0.02);
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, gain: number, slide = 0) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
    osc.onended = () => {
      osc.disconnect();
      g.disconnect();
    };
  }

  private noise(dur: number, gain: number, hp = 400) {
    if (!this.ctx || !this.master || this.muted) return;
    const t = this.ctx.currentTime;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = hp;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur);
    src.onended = () => {
      src.disconnect();
      filter.disconnect();
      g.disconnect();
    };
  }

  shoot() {
    const jitter = 1 + (Math.random() * 0.16 - 0.08);
    this.tone(880 * jitter, 0.05, "square", 0.035, -220);
  }

  hit() {
    this.noise(0.08, 0.12, 600);
    this.tone(220, 0.07, "sawtooth", 0.05, -80);
  }

  explode() {
    this.noise(0.28, 0.22, 180);
    this.tone(140, 0.22, "sine", 0.12, -100);
  }

  pickup() {
    this.tone(520, 0.09, "sine", 0.08, 80);
    this.tone(780, 0.12, "sine", 0.06, 40);
  }

  hurt() {
    this.noise(0.2, 0.18, 200);
    this.tone(90, 0.18, "sawtooth", 0.08, -40);
  }

  wave() {
    this.tone(392, 0.12, "triangle", 0.07, 20);
    this.tone(523, 0.16, "triangle", 0.06, 20);
  }

  extraLife() {
    this.tone(523, 0.1, "sine", 0.08);
    this.tone(659, 0.12, "sine", 0.07);
    this.tone(784, 0.16, "sine", 0.06);
  }

  intro() {
    this.noise(0.55, 0.09, 220);
    this.tone(196, 0.42, "sine", 0.07, 90);
    this.tone(262, 0.55, "triangle", 0.055, 50);
    this.tone(392, 0.72, "sine", 0.045, 30);
  }

  bomb() {
    this.noise(0.42, 0.26, 120);
    this.tone(70, 0.38, "sine", 0.14, -30);
    this.tone(180, 0.22, "triangle", 0.08, 40);
  }

  shootSpread() {
    const jitter = 1 + (Math.random() * 0.12 - 0.06);
    this.tone(640 * jitter, 0.06, "square", 0.03, -160);
    this.noise(0.04, 0.05, 1200);
  }

  shootPierce() {
    const jitter = 1 + (Math.random() * 0.08 - 0.04);
    this.tone(1100 * jitter, 0.07, "sawtooth", 0.04, -300);
  }

  shootMissile() {
    this.tone(180, 0.1, "sawtooth", 0.05, 80);
    this.noise(0.06, 0.06, 300);
  }

  boss() {
    this.tone(90, 0.28, "sine", 0.1, -20);
    this.tone(130, 0.32, "triangle", 0.07, 10);
  }
}
