import {
  columnHasRoom,
  createGrid,
  isTopped,
  landingRow,
  maxOrbValue,
  openColumns,
  rotateGrid,
  set,
} from './board';
import { settle } from './merge';
import { Rng } from './rng';
import {
  SIZE,
  STONE,
  type GameEvent,
  type Grid,
  type Mode,
  type RotateDir,
  type Snapshot,
} from './types';

/** Rotations available at the start of a run. */
export const GAUGE_START = 1;
/** Ceiling on stored rotations, so hoarding can't replace planning. */
export const GAUGE_MAX = 3;
/** A cascade this long refills one rotation. */
export const CHAIN_FOR_GAUGE = 2;
/** A stone spawns every N drops, steadily shrinking the usable board. */
export const STONE_INTERVAL = 12;
/** Orbs visible ahead of the current one. */
export const QUEUE_LEN = 2;
/**
 * Spawned values track the board's best orb minus this, so early orbs stop
 * appearing once they'd be useless — but late enough that stragglers can
 * still find a partner.
 */
export const SPAWN_LOOKBACK = 5;

export class Game {
  readonly mode: Mode;
  readonly seed: number;
  grid: Grid;
  /** Upcoming orbs; index 0 is the one being dropped. */
  next: number[] = [];
  score = 0;
  gauge = GAUGE_START;
  drops = 0;
  maxChain = 0;
  maxOrb = 0;
  over = false;
  private rng: Rng;

  constructor(mode: Mode, seed: number) {
    this.mode = mode;
    this.seed = seed;
    this.rng = new Rng(seed);
    this.grid = createGrid();
    while (this.next.length < QUEUE_LEN) this.next.push(this.rollValue());
  }

  /** The orb the player is about to drop. */
  get current(): number {
    return this.next[0];
  }

  get canRotate(): boolean {
    return !this.over && this.gauge > 0;
  }

  canDrop(col: number): boolean {
    return !this.over && col >= 0 && col < SIZE && columnHasRoom(this.grid, col);
  }

  /**
   * Drops the current orb into a column and resolves everything that follows.
   * Returns the animation script; empty when the move was illegal.
   */
  drop(col: number): GameEvent[] {
    if (!this.canDrop(col)) return [];

    const events: GameEvent[] = [];
    const value = this.next.shift() as number;
    const toR = landingRow(this.grid, col);
    set(this.grid, toR, col, value);
    this.drops++;
    events.push({ kind: 'drop', col, toR, value });

    this.resolve(events);

    // Refill after resolving so the new orb's value reflects the settled board.
    while (this.next.length < QUEUE_LEN) this.next.push(this.rollValue());

    if (!this.over && this.drops % STONE_INTERVAL === 0) this.spawnStone(events);
    this.checkGameOver(events);
    return events;
  }

  /** Spends one gauge to rotate the board contents and re-drop everything. */
  rotate(dir: RotateDir): GameEvent[] {
    if (!this.canRotate) return [];

    const events: GameEvent[] = [];
    this.gauge--;
    this.grid = rotateGrid(this.grid, dir);
    events.push({ kind: 'rotate', dir }, { kind: 'gauge', value: this.gauge });

    this.resolve(events);
    this.checkGameOver(events);
    return events;
  }

  /** Runs the cascade and folds its scoring and gauge reward into the run. */
  private resolve(events: GameEvent[]): void {
    const result = settle(this.grid);
    events.push(...result.events);
    this.score += result.gained;
    if (result.chain > this.maxChain) this.maxChain = result.chain;
    const best = maxOrbValue(this.grid);
    if (best > this.maxOrb) this.maxOrb = best;

    if (result.chain >= CHAIN_FOR_GAUGE && this.gauge < GAUGE_MAX) {
      this.gauge++;
      events.push({ kind: 'gauge', value: this.gauge });
    }
  }

  private spawnStone(events: GameEvent[]): void {
    const cols = openColumns(this.grid);
    if (cols.length === 0) return;
    const col = cols[this.rng.nextInt(cols.length)];
    const r = landingRow(this.grid, col);
    set(this.grid, r, col, STONE);
    events.push({ kind: 'petrify', pos: { r, c: col } });
  }

  private checkGameOver(events: GameEvent[]): void {
    if (this.over || !isTopped(this.grid)) return;
    this.over = true;
    events.push({ kind: 'gameover' });
  }

  /** Weighted roll, biased toward whatever is currently useful on the board. */
  private rollValue(): number {
    const base = Math.max(1, maxOrbValue(this.grid) - SPAWN_LOOKBACK);
    const roll = this.rng.nextPercent();
    const offset = roll < 70 ? 0 : roll < 95 ? 1 : 2;
    return base + offset;
  }

  snapshot(): Snapshot {
    return {
      grid: this.grid.slice(),
      next: this.next.slice(),
      score: this.score,
      gauge: this.gauge,
      drops: this.drops,
      maxChain: this.maxChain,
      maxOrb: this.maxOrb,
      rngState: this.rng.getState(),
      mode: this.mode,
      seed: this.seed,
      over: this.over,
    };
  }

  /** Rebuilds a run bit-identically, including the upcoming orb sequence. */
  static restore(s: Snapshot): Game {
    const game = new Game(s.mode, s.seed);
    game.grid = s.grid.slice();
    game.next = s.next.slice();
    game.score = s.score;
    game.gauge = s.gauge;
    game.drops = s.drops;
    game.maxChain = s.maxChain;
    game.maxOrb = s.maxOrb;
    game.over = s.over;
    game.rng.setState(s.rngState);
    return game;
  }
}
