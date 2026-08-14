/**
 * Deterministic PRNG (mulberry32).
 *
 * The whole point of this file is reproducibility: daily mode gives every
 * player the same orb sequence, and replay tests re-run a recorded input
 * list and expect the exact same score. State is a single uint32 so a run
 * can be snapshotted to localStorage and resumed bit-identically.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Raw 32-bit step. */
  nextUint32(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  }

  /** Integer in [0, n). n must be a positive integer. */
  nextInt(n: number): number {
    return this.nextUint32() % n;
  }

  /** Integer in [0, 100). Used for weighted orb rolls. */
  nextPercent(): number {
    return this.nextInt(100);
  }

  getState(): number {
    return this.s >>> 0;
  }

  setState(state: number): void {
    this.s = state >>> 0;
  }
}

/** FNV-1a. Turns a seed string ("2026-08-14:daily") into a uint32. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Local calendar date as YYYY-MM-DD, the daily-mode seed source. */
export function dateKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
