/** Board geometry. Square so a 90-degree rotation keeps the same shape. */
export const SIZE = 7;

/** Row 0 is the death line: an orb resting there ends the run. */
export const DEATH_ROW = 0;

/** Empty cell marker. */
export const EMPTY = 0;

/**
 * Petrified tile. Never merges, but falls and rotates like an orb, and is
 * destroyed by an adjacent merge. Encoded as a negative so a single number
 * per cell describes the whole board (orb values are >= 1).
 */
export const STONE = -1;

/** A board cell: EMPTY, STONE, or an orb value >= 1. */
export type Cell = number;

/** Row-major grid, SIZE * SIZE cells. */
export type Grid = Cell[];

export type Mode = 'endless' | 'daily' | 'rush';

export type RotateDir = 'cw' | 'ccw';

export interface Pos {
  r: number;
  c: number;
}

export interface MoveStep {
  fromR: number;
  fromC: number;
  toR: number;
  toC: number;
}

export interface MergeGroup {
  /** Cells consumed by this merge, in the order found. */
  cells: Pos[];
  /** Where the upgraded orb lands. */
  anchor: Pos;
  /** Value of the orb produced (input value + 1). */
  newValue: number;
  /** Stones destroyed by being adjacent to this group. */
  stones: Pos[];
  /** Points this group awarded. */
  gained: number;
}

/**
 * Animation script emitted by the core alongside each state change. The core
 * itself resolves everything instantly; the renderer replays these in order
 * so the player sees the cascade unfold.
 */
export type GameEvent =
  | { kind: 'drop'; col: number; toR: number; value: number }
  | { kind: 'rotate'; dir: RotateDir }
  | { kind: 'gravity'; moves: MoveStep[] }
  | { kind: 'merge'; groups: MergeGroup[]; chain: number }
  | { kind: 'petrify'; pos: Pos }
  | { kind: 'gauge'; value: number }
  | { kind: 'gameover' };

export interface Snapshot {
  grid: Grid;
  next: number[];
  score: number;
  gauge: number;
  drops: number;
  maxChain: number;
  maxOrb: number;
  rngState: number;
  mode: Mode;
  seed: number;
  over: boolean;
}
