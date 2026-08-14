import { describe, expect, it } from 'vitest';
import { anchorOf, findGroups, scoreFor, settle } from '../src/core/merge';
import type { GameEvent, MergeGroup } from '../src/core/types';
import { parse, render } from './helpers';

function mergeEvents(events: GameEvent[]): Array<{ groups: MergeGroup[]; chain: number }> {
  return events.filter((e): e is Extract<GameEvent, { kind: 'merge' }> => e.kind === 'merge');
}

describe('findGroups', () => {
  it('ignores pairs and picks up triples', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '22.....',
      '111....',
    ]);
    const groups = findGroups(grid);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it('connects orthogonally but not diagonally', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '.1.....',
      '.1.....',
      '.1.1...',
    ]);
    const groups = findGroups(grid);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });

  it('never groups stones', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '###....',
    ]);
    expect(findGroups(grid)).toHaveLength(0);
  });

  it('finds L-shaped and larger components', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '3......',
      '3......',
      '333....',
    ]);
    const groups = findGroups(grid);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(5);
  });
});

describe('anchorOf', () => {
  it('picks the lowest cell, breaking ties leftward', () => {
    expect(anchorOf([{ r: 4, c: 3 }, { r: 6, c: 5 }, { r: 6, c: 2 }])).toEqual({ r: 6, c: 2 });
  });
});

describe('settle', () => {
  it('merges a triple into one upgraded orb at the anchor', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '111....',
    ]);
    const result = settle(grid);
    expect(render(grid)[6]).toBe('2......');
    expect(result.chain).toBe(1);
    expect(result.gained).toBe(scoreFor(2, 3, 1, 0));
  });

  it('cascades and multiplies the chain', () => {
    // The three 1s merge into a 2 directly under the waiting pair of 2s.
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '2......',
      '2......',
      '111....',
    ]);
    const result = settle(grid);
    expect(result.chain).toBe(2);
    const merges = mergeEvents(result.events);
    expect(merges.map((m) => m.chain)).toEqual([1, 2]);
    expect(render(grid)[6]).toBe('3......');
    expect(result.gained).toBe(scoreFor(2, 3, 1, 0) + scoreFor(3, 3, 2, 0));
  });

  it('drops floating orbs after a merge clears the ground beneath them', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '5......',
      '5......',
      '5......',
    ]);
    settle(grid);
    // Column collapses to a single 6 resting on the floor.
    expect(render(grid)[6]).toBe('6......');
    expect(render(grid)[5]).toBe('.......');
  });

  it('shatters stones adjacent to a merge', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '111#...',
    ]);
    const result = settle(grid);
    expect(render(grid)[6]).toBe('2......');
    expect(mergeEvents(result.events)[0].groups[0].stones).toHaveLength(1);
  });

  it('leaves a stone that no merge touches', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '111.#..',
    ]);
    settle(grid);
    expect(render(grid)[6]).toBe('2...#..');
  });

  it('counts a stone once when groups on both sides touch it', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '111#222',
    ]);
    const result = settle(grid);
    const stones = mergeEvents(result.events)[0].groups.flatMap((g) => g.stones);
    expect(stones).toHaveLength(1);
  });

  it('is a no-op on a stable board', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '1212121',
    ]);
    const result = settle(grid);
    expect(result.events).toHaveLength(0);
    expect(result.gained).toBe(0);
    expect(result.chain).toBe(0);
  });

  it('resolves two separate groups in the same chain step', () => {
    const grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '111.222',
    ]);
    const result = settle(grid);
    const merges = mergeEvents(result.events);
    expect(merges).toHaveLength(1);
    expect(merges[0].groups).toHaveLength(2);
  });
});
