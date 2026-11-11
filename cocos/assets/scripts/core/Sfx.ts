// Synthesised sound effects (WebAudio). No audio files needed.
class SfxImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  muted = false;
  private noiseBuf: AudioBuffer | null = null;

  constructor() {
    try { this.muted = localStorage.getItem('mgs_muted') === '1'; } catch { /* ignore */ }
  }
  /** Must be called from a user gesture at least once. */
  unlock() {
    try {
      if (!this.ctx) {
        const AC = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        this.master = this.ctx!.createGain();
        this.master.gain.value = this.muted ? 0 : 0.9;
        this.master.connect(this.ctx!.destination);
        const len = this.ctx!.sampleRate;
        this.noiseBuf = this.ctx!.createBuffer(1, len, this.ctx!.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      }
      if (this.ctx!.state === 'suspended') this.ctx!.resume();
      void this.afterUnlock();
    } catch { /* ignore */ }
  }
  setMuted(m: boolean) {
    this.muted = m;
    try { localStorage.setItem('mgs_muted', m ? '1' : '0'); } catch { /* ignore */ }
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.18, delay = 0, slideTo?: number) {
    if (!this.ctx || !this.master || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }
  noise(dur: number, vol = 0.12, from = 800, to = 200, delay = 0) {
    if (!this.ctx || !this.master || this.muted || !this.noiseBuf) return;
    const t0 = this.ctx.currentTime + delay;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(from, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f); f.connect(g); g.connect(this.master);
    s.start(t0); s.stop(t0 + dur + 0.05);
  }

  // ---- buyer-supplied sounds (asset slots). Anything not supplied falls back to the synthesized sound. ----
  private custom = new Map<string, AudioBuffer>();
  private pending = new Map<string, string>();
  private music: { url: string; src?: AudioBufferSourceNode; gain?: GainNode } | null = null;
  /** Register a sound for a name; decoded as soon as the audio engine is unlocked. */
  setCustom(name: string, url: string) { if (url) { this.pending.set(name, url); void this.decodePending(); } }
  private async decodeBuffer(url: string): Promise<AudioBuffer | null> {
    try {
      if (!this.ctx) return null;
      const r = await fetch(url, { mode: 'cors' });
      return await this.ctx.decodeAudioData(await r.arrayBuffer());
    } catch { return null; }
  }
  private async decodePending() {
    if (!this.ctx) return;
    for (const [name, url] of Array.from(this.pending)) {
      this.pending.delete(name);
      const b = await this.decodeBuffer(url);
      if (b) this.custom.set(name, b);
    }
  }
  /** Play the buyer's sound for  if there is one. Returns false when the synthesized fallback should be used. */
  playCustom(name: string, vol = 1): boolean {
    const b = this.custom.get(name);
    if (!b || !this.ctx || !this.master || this.muted) return !!b;
    const s = this.ctx.createBufferSource(); s.buffer = b;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start();
    return true;
  }
  async startMusic(url: string, vol = 0.35) {
    if (!url) return;
    this.music = { url };
    if (!this.ctx) return;
    const b = await this.decodeBuffer(url);
    if (!b || !this.ctx || !this.master || this.music?.url !== url) return;
    this.music.src?.stop();
    const s = this.ctx.createBufferSource(); s.buffer = b; s.loop = true;
    const g = this.ctx.createGain(); g.gain.value = vol;
    s.connect(g); g.connect(this.master); s.start();
    this.music = { url, src: s, gain: g };
  }
  /** Called after the first user gesture: decode what was queued and start the music. */
  async afterUnlock() {
    await this.decodePending();
    if (this.music && !this.music.src) void this.startMusic(this.music.url);
  }

  click() { this.tone(520, 0.07, 'triangle', 0.12); this.tone(780, 0.06, 'triangle', 0.08, 0.04); }
  tick() { this.tone(1500, 0.03, 'square', 0.05); }
  whoosh() { this.noise(0.9, 0.1, 300, 2400); }
  reelStop() { this.tone(160, 0.12, 'sine', 0.22, 0, 70); this.noise(0.06, 0.08, 1200, 400); }
  step() { this.tone(300 + Math.random() * 40, 0.05, 'triangle', 0.08); }
  dice() { for (let i = 0; i < 6; i++) this.noise(0.04, 0.09, 1800 - i * 150, 500, i * 0.07); }
  thud() { this.tone(110, 0.16, 'sine', 0.25, 0, 50); }
  capture() { this.tone(500, 0.25, 'sawtooth', 0.1, 0, 120); this.noise(0.25, 0.1, 1500, 200); }
  coin() { this.tone(1318, 0.07, 'square', 0.07); this.tone(1760, 0.18, 'square', 0.07, 0.07); }
  lose() { this.tone(300, 0.2, 'triangle', 0.14); this.tone(220, 0.3, 'triangle', 0.14, 0.15); }
  win(level = 1) {
    const notes = [523, 659, 784, 1047, 1319, 1568];
    const n = Math.min(notes.length, 3 + level);
    for (let i = 0; i < n; i++) this.tone(notes[i], 0.22, 'triangle', 0.15, i * 0.09);
    for (let i = 0; i < n * 2; i++) this.coin2(i * 0.05 + 0.2);
  }
  private coin2(d: number) { this.tone(1500 + Math.random() * 900, 0.05, 'square', 0.035, d); }
  jackpot() {
    const seq = [523, 659, 784, 1047, 784, 1047, 1319, 1568, 2093];
    seq.forEach((f, i) => { this.tone(f, 0.3, 'triangle', 0.17, i * 0.11); this.tone(f / 2, 0.3, 'sine', 0.12, i * 0.11); });
    for (let i = 0; i < 24; i++) this.coin2(0.6 + i * 0.05);
  }
}
export const Sfx = new SfxImpl();
