import { EMPTY, SIZE, STONE, type Cell, type Grid, type MoveStep, type RotateDir } from './types';

export function idx(r: number, c: number): number {
  return r * SIZE + c;
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < SIZE && c >= 0 && c < SIZE;
}

export function createGrid(): Grid {
  return new Array<Cell>(SIZE * SIZE).fill(EMPTY);
}

export function cloneGrid(grid: Grid): Grid {
  return grid.slice();
}

export function get(grid: Grid, r: number, c: number): Cell {
  return grid[idx(r, c)];
}

export function set(grid: Grid, r: number, c: number, value: Cell): void {
  grid[idx(r, c)] = value;
}

export function isOrb(cell: Cell): boolean {
  return cell >= 1;
}

export function isOccupied(cell: Cell): boolean {
  return cell !== EMPTY;
}

/**
 * Lowest empty row in a column, or -1 when the column is completely full.
 * A dropped orb lands here.
 */
export function landingRow(grid: Grid, col: number): number {
  for (let r = SIZE - 1; r >= 0; r--) {
    if (grid[idx(r, col)] === EMPTY) return r;
  }
  return -1;
}

export function columnHasRoom(grid: Grid, col: number): boolean {
  return landingRow(grid, col) >= 0;
}

/**
 * Compacts every column downward. Mutates the grid and returns the moves the
 * renderer needs to animate. Order within a column is preserved.
 */
export function applyGravity(grid: Grid): MoveStep[] {
  const moves: MoveStep[] = [];
  for (let c = 0; c < SIZE; c++) {
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      const cell = grid[idx(r, c)];
      if (cell === EMPTY) continue;
      if (write !== r) {
        grid[idx(write, c)] = cell;
        grid[idx(r, c)] = EMPTY;
        moves.push({ fromR: r, fromC: c, toR: write, toC: c });
      }
      write--;
    }
  }
  return moves;
}

/**
 * Rotates the board contents 90 degrees. Gravity always points down on
 * screen, so rotating the contents is what makes everything fall anew.
 */
export function rotateGrid(grid: Grid, dir: RotateDir): Grid {
  const out = createGrid();
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      out[idx(r, c)] = dir === 'cw' ? grid[idx(SIZE - 1 - c, r)] : grid[idx(c, SIZE - 1 - r)];
    }
  }
  return out;
}

/** Highest orb value currently on the board (0 when there are none). */
export function maxOrbValue(grid: Grid): number {
  let max = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] > max) max = grid[i];
  }
  return max;
}

export function countEmpty(grid: Grid): number {
  let n = 0;
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === EMPTY) n++;
  }
  return n;
}

/** Columns that can still accept a drop. */
export function openColumns(grid: Grid): number[] {
  const cols: number[] = [];
  for (let c = 0; c < SIZE; c++) {
    if (columnHasRoom(grid, c)) cols.push(c);
  }
  return cols;
}

/** True once an orb or stone is resting on the death row. */
export function isTopped(grid: Grid): boolean {
  for (let c = 0; c < SIZE; c++) {
    if (grid[idx(0, c)] !== EMPTY) return true;
  }
  return false;
}

export function isStone(cell: Cell): boolean {
  return cell === STONE;
}
