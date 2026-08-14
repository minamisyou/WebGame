import { createGrid, get, set } from '../src/core/board';
import { SIZE, STONE, type Grid } from '../src/core/types';

/**
 * Builds a grid from SIZE rows of chars: '.' empty, '#' stone, digit = orb.
 * Reading test boards as pictures beats hand-indexing a flat array.
 */
export function parse(rows: string[]): Grid {
  if (rows.length !== SIZE) throw new Error(`expected ${SIZE} rows, got ${rows.length}`);
  const grid = createGrid();
  rows.forEach((row, r) => {
    if (row.length !== SIZE) throw new Error(`row ${r} must be ${SIZE} wide: "${row}"`);
    [...row].forEach((ch, c) => {
      if (ch === '.') return;
      set(grid, r, c, ch === '#' ? STONE : Number(ch));
    });
  });
  return grid;
}

export function render(grid: Grid): string[] {
  const rows: string[] = [];
  for (let r = 0; r < SIZE; r++) {
    let line = '';
    for (let c = 0; c < SIZE; c++) {
      const cell = get(grid, r, c);
      line += cell === 0 ? '.' : cell === STONE ? '#' : String(cell);
    }
    rows.push(line);
  }
  return rows;
}
