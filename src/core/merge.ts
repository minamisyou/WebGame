import { applyGravity, get, idx, inBounds, isStone, set } from './board';
import { EMPTY, SIZE, type GameEvent, type Grid, type MergeGroup, type Pos } from './types';

/** Minimum connected orbs of the same value required to merge. */
export const MERGE_MIN = 3;

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
];

/**
 * All 4-connected components of equal-valued orbs with at least MERGE_MIN
 * cells. Scan order is fixed (row-major) so results are deterministic.
 */
export function findGroups(grid: Grid): Pos[][] {
  const seen = new Uint8Array(SIZE * SIZE);
  const groups: Pos[][] = [];
  const queue: Pos[] = [];

  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const i = idx(r, c);
      if (seen[i]) continue;
      const value = grid[i];
      if (value < 1) {
        seen[i] = 1;
        continue;
      }

      // Flood fill from this cell.
      const component: Pos[] = [];
      queue.length = 0;
      queue.push({ r, c });
      seen[i] = 1;
      while (queue.length > 0) {
        const cur = queue.pop() as Pos;
        component.push(cur);
        for (const [dr, dc] of NEIGHBORS) {
          const nr = cur.r + dr;
          const nc = cur.c + dc;
          if (!inBounds(nr, nc)) continue;
          const ni = idx(nr, nc);
          if (seen[ni] || grid[ni] !== value) continue;
          seen[ni] = 1;
          queue.push({ r: nr, c: nc });
        }
      }

      if (component.length >= MERGE_MIN) groups.push(component);
    }
  }
  return groups;
}

/**
 * Where a merged group lands: the lowest cell, ties broken leftward. Merging
 * downward keeps the board compact and makes cascades read naturally.
 */
export function anchorOf(cells: Pos[]): Pos {
  let best = cells[0];
  for (const p of cells) {
    if (p.r > best.r || (p.r === best.r && p.c < best.c)) best = p;
  }
  return best;
}

/** Points for one merged group. Chain multiplies, so cascades are the payoff. */
export function scoreFor(newValue: number, size: number, chain: number, stones: number): number {
  return Math.pow(2, newValue) * size * chain + stones * 25 * chain;
}

export interface SettleResult {
  events: GameEvent[];
  gained: number;
  /** Highest chain step reached (0 when nothing merged). */
  chain: number;
}

/**
 * Runs the full cascade: gravity, merge, gravity, merge ... until the board
 * is stable. Mutates the grid and returns the animation script plus scoring.
 */
export function settle(grid: Grid): SettleResult {
  const events: GameEvent[] = [];
  let gained = 0;
  let chain = 0;

  for (;;) {
    const moves = applyGravity(grid);
    if (moves.length > 0) events.push({ kind: 'gravity', moves });

    const components = findGroups(grid);
    if (components.length === 0) break;

    chain++;
    const claimedStones = new Set<number>();
    const groups: MergeGroup[] = [];

    for (const cells of components) {
      const anchor = anchorOf(cells);
      const newValue = get(grid, cells[0].r, cells[0].c) + 1;

      // Stones next to a merge shatter. Dedupe so two groups touching the
      // same stone don't both claim it.
      const stones: Pos[] = [];
      for (const p of cells) {
        for (const [dr, dc] of NEIGHBORS) {
          const nr = p.r + dr;
          const nc = p.c + dc;
          if (!inBounds(nr, nc)) continue;
          const ni = idx(nr, nc);
          if (!isStone(grid[ni]) || claimedStones.has(ni)) continue;
          claimedStones.add(ni);
          stones.push({ r: nr, c: nc });
        }
      }

      const groupScore = scoreFor(newValue, cells.length, chain, stones.length);
      gained += groupScore;
      groups.push({ cells, anchor, newValue, stones, gained: groupScore });
    }

    // Clear first, then place upgrades, so overlapping clears can't erase a
    // freshly created orb.
    for (const g of groups) {
      for (const p of g.cells) set(grid, p.r, p.c, EMPTY);
      for (const p of g.stones) set(grid, p.r, p.c, EMPTY);
    }
    for (const g of groups) set(grid, g.anchor.r, g.anchor.c, g.newValue);

    events.push({ kind: 'merge', groups, chain });
  }

  return { events, gained, chain };
}
