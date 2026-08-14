/**
 * Tiny Web Audio synth. Every sound is generated, so the game ships with zero
 * audio assets and stays inside its payload budget.
 *
 * iOS starts the context suspended: nothing plays until unlock() runs inside a
 * real user gesture. The game must stay fully playable if that never happens.
 */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  /** Call from a pointer/keyboard handler. Safe to call repeatedly. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      try {
        this.ctx = new Ctor();
      } catch {
        return;
      }
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.22;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
  ): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const env = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    if (slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
    env.gain.setValueAtTime(0.0001, now);
    env.gain.exponentialRampToValueAtTime(gain, now + 0.012);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(env);
    env.connect(this.master);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  land(): void {
    this.tone(180, 0.07, 'sine', 0.3);
  }

  /** Pitch climbs with the chain, so a long cascade sounds like one. */
  merge(chain: number, value: number): void {
    const step = Math.min(14, (chain - 1) * 3 + Math.min(value, 6));
    this.tone(300 * Math.pow(2, step / 12), 0.16, 'triangle', 0.5);
  }

  rotate(): void {
    this.tone(220, 0.26, 'sawtooth', 0.16, 620);
  }

  petrify(): void {
    this.tone(90, 0.18, 'square', 0.16, 60);
  }

  gaugeGain(): void {
    this.tone(880, 0.12, 'sine', 0.28, 1320);
  }

  gameOver(): void {
    this.tone(320, 0.5, 'triangle', 0.35, 90);
  }
}

/** Haptics where supported (Android); a silent no-op on iOS. */
export function vibrate(pattern: number | number[], enabled: boolean): void {
  if (!enabled || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* some browsers throw when the gesture requirement is unmet */
  }
}
