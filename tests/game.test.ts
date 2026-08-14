import { describe, expect, it } from 'vitest';
import { get } from '../src/core/board';
import { GAUGE_MAX, GAUGE_START, Game, QUEUE_LEN, STONE_INTERVAL } from '../src/core/game';
import { STONE, type GameEvent } from '../src/core/types';
import { parse, render } from './helpers';

function countStones(game: Game): number {
  return game.grid.filter((cell) => cell === STONE).length;
}

function kinds(events: GameEvent[]): string[] {
  return events.map((e) => e.kind);
}

/** Plays a fixed column sequence so runs are comparable. */
function playScript(game: Game, drops: number): void {
  for (let i = 0; i < drops; i++) game.drop(i % 7);
}

describe('new game', () => {
  it('starts empty with one rotation banked and a filled queue', () => {
    const game = new Game('endless', 1234);
    expect(game.grid.every((cell) => cell === 0)).toBe(true);
    expect(game.gauge).toBe(GAUGE_START);
    expect(game.next).toHaveLength(QUEUE_LEN);
    expect(game.score).toBe(0);
    expect(game.over).toBe(false);
  });

  it('spawns only low orbs on an empty board', () => {
    for (let seed = 0; seed < 50; seed++) {
      const game = new Game('endless', seed);
      expect(game.current).toBeGreaterThanOrEqual(1);
      expect(game.current).toBeLessThanOrEqual(3);
    }
  });
});

describe('drop', () => {
  it('lands the current orb and refills the queue', () => {
    const game = new Game('endless', 7);
    const value = game.current;
    const events = game.drop(3);
    expect(get(game.grid, 6, 3)).toBe(value);
    expect(game.next).toHaveLength(QUEUE_LEN);
    expect(game.drops).toBe(1);
    expect(kinds(events)[0]).toBe('drop');
  });

  it('rejects a drop into a full column', () => {
    const game = new Game('endless', 7);
    game.grid = parse(['1......', '2......', '1......', '2......', '1......', '2......', '1......']);
    expect(game.canDrop(0)).toBe(false);
    expect(game.drop(0)).toEqual([]);
  });

  it('rejects a drop once the run is over', () => {
    const game = new Game('endless', 7);
    game.over = true;
    expect(game.drop(0)).toEqual([]);
  });

  it('scores the cascade a drop sets off', () => {
    const game = new Game('endless', 7);
    game.grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '2......',
      '2......',
      '.11....',
    ]);
    game.next = [1, 1];
    const events = game.drop(0);
    expect(game.score).toBeGreaterThan(0);
    expect(game.maxChain).toBe(2);
    expect(render(game.grid)[6]).toBe('3......');
    expect(kinds(events)).toContain('merge');
  });
});

describe('rotation', () => {
  it('spends a gauge point and re-settles the board', () => {
    const game = new Game('endless', 7);
    game.grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '.......',
      '111....',
    ]);
    const events = game.rotate('cw');
    expect(game.gauge).toBe(GAUGE_START - 1);
    expect(kinds(events)[0]).toBe('rotate');
    // The bottom row becomes the left column, falls, and still merges.
    expect(render(game.grid)[6]).toBe('2......');
  });

  it('is refused with an empty gauge', () => {
    const game = new Game('endless', 7);
    game.gauge = 0;
    expect(game.canRotate).toBe(false);
    expect(game.rotate('cw')).toEqual([]);
  });

  it('refunds one point for a chain of two', () => {
    const game = new Game('endless', 7);
    game.gauge = 0;
    game.grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '2......',
      '2......',
      '.11....',
    ]);
    game.next = [1, 1];
    game.drop(0);
    expect(game.gauge).toBe(1);
  });

  it('never banks more than the cap', () => {
    const game = new Game('endless', 7);
    game.gauge = GAUGE_MAX;
    game.grid = parse([
      '.......',
      '.......',
      '.......',
      '.......',
      '2......',
      '2......',
      '.11....',
    ]);
    game.next = [1, 1];
    game.drop(0);
    expect(game.gauge).toBe(GAUGE_MAX);
  });
});

describe('stones', () => {
  it('spawns one every STONE_INTERVAL drops', () => {
    const game = new Game('endless', 99);
    playScript(game, STONE_INTERVAL - 1);
    expect(countStones(game)).toBe(0);
    const events = game.drop(0);
    expect(kinds(events)).toContain('petrify');
    expect(countStones(game)).toBe(1);
  });
});

describe('game over', () => {
  it('ends when an orb comes to rest on the death row', () => {
    const game = new Game('endless', 7);
    game.grid = parse(['.......', '1......', '2......', '1......', '2......', '1......', '2......']);
    const events = game.drop(0);
    expect(game.over).toBe(true);
    expect(kinds(events)).toContain('gameover');
  });

  it('keeps playing when the incoming orb merges away', () => {
    const game = new Game('endless', 7);
    game.grid = parse(['.......', '1......', '1......', '2......', '2......', '1......', '2......']);
    game.next = [1, 1];
    game.drop(0);
    expect(game.over).toBe(false);
  });
});

describe('determinism', () => {
  it('produces identical runs from the same seed and inputs', () => {
    const a = new Game('daily', 20260814);
    const b = new Game('daily', 20260814);
    playScript(a, 40);
    playScript(b, 40);
    expect(b.snapshot()).toEqual(a.snapshot());
  });

  it('resumes a snapshot without diverging', () => {
    const original = new Game('endless', 555);
    playScript(original, 10);
    const saved = original.snapshot();

    for (let i = 10; i < 25; i++) original.drop(i % 7);

    const resumed = Game.restore(saved);
    for (let i = 10; i < 25; i++) resumed.drop(i % 7);

    expect(resumed.snapshot()).toEqual(original.snapshot());
  });

  it('keeps the snapshot independent of the live grid', () => {
    const game = new Game('endless', 3);
    const saved = game.snapshot();
    game.drop(0);
    expect(saved.grid.every((cell) => cell === 0)).toBe(true);
  });
});
