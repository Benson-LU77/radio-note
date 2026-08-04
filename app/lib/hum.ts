/**
 * Hum — the entire sound of the city.
 * A substation hum (two detuned sines beating at 0.3Hz over filtered brown
 * noise) and a settle chime for new structures. Hum defaults off; the chime
 * is UI feedback and defaults on. Nothing else makes sound here.
 */

const RAMP = 0.08;

export class Hum {
  private ctx: AudioContext | null = null;
  private humGain: GainNode | null = null;
  private master: GainNode | null = null;
  private humOn = false;
  private chimeOn = true;

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    const humGain = ctx.createGain();
    humGain.gain.value = 0;
    humGain.connect(master);

    for (const freq of [55, 55.3]) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.value = 0.02;
      osc.connect(g).connect(humGain);
      osc.start();
    }

    // filtered brown-noise floor
    const seconds = 4;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let last = 0;
    for (let i = 0; i < data.length; i += 1) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 180;
    const ng = ctx.createGain();
    ng.gain.value = 0.004;
    noise.connect(lp).connect(ng).connect(humGain);
    noise.start();

    this.ctx = ctx;
    this.master = master;
    this.humGain = humGain;
    return ctx;
  }

  /** Call from any user gesture so the context can start. */
  unlock() {
    if (this.humOn || this.ctx) void this.ensure().resume();
  }

  setHum(on: boolean) {
    this.humOn = on;
    if (!on && !this.ctx) return;
    const ctx = this.ensure();
    void ctx.resume();
    this.humGain?.gain.setTargetAtTime(on ? 1 : 0, ctx.currentTime, RAMP * 4);
  }

  setChime(on: boolean) {
    this.chimeOn = on;
  }

  /** New structure settles: rising fifth + a soft low thud. */
  settle() {
    if (!this.chimeOn) return;
    const ctx = this.ensure();
    void ctx.resume();
    const t0 = ctx.currentTime + 0.02;
    const note = (freq: number, at: number, dur: number, peak: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(peak, at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      osc.connect(g).connect(this.master!);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    };
    note(440, t0, 0.24, 0.045);
    note(660, t0 + 0.09, 0.3, 0.038);
    note(110, t0, 0.14, 0.05);
  }

  /** The survey sweep breathes the hum very slightly. */
  sweep(phase: number) {
    if (!this.ctx || !this.humOn || !this.humGain) return;
    const lift = 1 + Math.sin(phase * Math.PI) * 0.08;
    this.humGain.gain.setTargetAtTime(lift, this.ctx.currentTime, 0.4);
  }

  dispose() {
    void this.ctx?.close();
    this.ctx = null;
  }
}
