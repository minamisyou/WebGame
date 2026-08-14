import { describe, expect, it } from 'vitest';
import { applyGravity, get, isTopped, landingRow, openColumns, rotateGrid } from '../src/core/board';
import { SIZE, STONE } from '../src/core/types';
import { parse, render } from './helpers';

describe('gravity', () => {
  it('compacts each column downward and preserves order', () => {
    const grid = parse([
      '1......',
      '.......',
      '2......',
      '.......',
      '.......',
      '.......',
      '3......',
    ]);
    const moves = applyGravity(grid);
    expect(render(grid)[4]).toBe('1......');
    expect(render(grid)[5]).toBe('2......');
    expect(render(grid)[6]).toBe('3......');
    expect(moves).toHaveLength(2);
  });

  it('reports no moves for an already settled board', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '123####',
    ]);
    expect(applyGravity(grid)).toHaveLength(0);
  });

  it('makes stones fall like orbs', () => {
    const grid = parse([
      '#......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
    ]);
    applyGravity(grid);
    expect(get(grid, SIZE - 1, 0)).toBe(STONE);
  });
});

describe('rotation', () => {
  const start = parse([
    '1234567',
    '.......',
    '..#....',
    '.......',
    '.......',
    '.......',
    '9......',
  ]);

  it('returns to the original after four turns in one direction', () => {
    let grid = start;
    for (let i = 0; i < 4; i++) grid = rotateGrid(grid, 'cw');
    expect(render(grid)).toEqual(render(start));
  });

  it('is reversible by the opposite direction', () => {
    expect(render(rotateGrid(rotateGrid(start, 'cw'), 'ccw'))).toEqual(render(start));
  });

  it('moves the top-left cell to the top-right when rotating clockwise', () => {
    const grid = rotateGrid(start, 'cw');
    expect(get(grid, 0, SIZE - 1)).toBe(1);
  });

  it('preserves cell contents', () => {
    const before = render(start).join('').split('').sort().join('');
    const after = render(rotateGrid(start, 'ccw')).join('').split('').sort().join('');
    expect(after).toBe(before);
  });
});

describe('column queries', () => {
  it('lands an orb on the lowest empty row', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '1......',
      '1......',
    ]);
    expect(landingRow(grid, 0)).toBe(4);
    expect(landingRow(grid, 1)).toBe(SIZE - 1);
  });

  it('reports a full column as closed', () => {
    const grid = parse(['1......', '1......', '1......', '1......', '1......', '1......', '1......']);
    expect(landingRow(grid, 0)).toBe(-1);
    expect(openColumns(grid)).not.toContain(0);
    expect(isTopped(grid)).toBe(true);
  });
});
