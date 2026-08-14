import { cloneGrid, idx, landingRow, rotateGrid } from '../core/board';
import { EMPTY, SIZE, STONE, type GameEvent, type Grid, type MergeGroup } from '../core/types';
import { Particles } from './particles';
import {
  COLORS,
  inkColor,
  orbColor,
  orbShape,
  roundedRect,
  traceShape,
  type PaletteName,
} from './theme';

/** Cap the backing store at 2x: beyond that costs fill rate for no clarity. */
const MAX_DPR = 2;

/** Lifetime of the settle "pop" bump, in ms. Pop values are normalised 1 -> 0. */
const POP_MS = 220;

const DUR = {
  dropPerRow: 17,
  dropBase: 90,
  gravityPerRow: 20,
  gravityBase: 100,
  merge: 210,
  petrify: 190,
  rotate: 260,
};

type Anim =
  | { kind: 'drop'; t: number; dur: number; r: number; c: number }
  | { kind: 'gravity'; t: number; dur: number; moves: Array<{ r: number; c: number; dist: number }> }
  | { kind: 'merge'; t: number; dur: number; groups: MergeGroup[]; chain: number }
  | { kind: 'petrify'; t: number; dur: number; r: number; c: number }
  | { kind: 'rotate'; t: number; dur: number; from: number };

export interface ViewCallbacks {
  onLand?: () => void;
  onMerge?: (chain: number, groups: MergeGroup[]) => void;
  onGauge?: (value: number) => void;
  onRotate?: () => void;
  onPetrify?: () => void;
  onGameOver?: () => void;
  onIdle?: () => void;
}

export interface ViewOptions {
  palette: PaletteName;
  reducedMotion: boolean;
}

/**
 * Draws the board and replays the core's event script as animation. The core
 * resolves a move instantly; this class is what makes the cascade legible.
 */
export class BoardView {
  private ctx: CanvasRenderingContext2D;
  private grid: Grid;
  private queue: GameEvent[] = [];
  private anim: Anim | null = null;
  private offX = new Float32Array(SIZE * SIZE);
  private offY = new Float32Array(SIZE * SIZE);
  private scale = new Float32Array(SIZE * SIZE);
  private pop = new Float32Array(SIZE * SIZE);
  private particles = new Particles();
  private shake = 0;
  private boardAngle = 0;
  private ghostCol: number | null = null;
  private ghostValue = 1;
  /** CSS pixel size of the square board. */
  private size = 0;
  private cell = 0;
  private pad = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private options: ViewOptions,
    private callbacks: ViewCallbacks = {},
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('2D canvas is not available');
    this.ctx = ctx;
    this.grid = new Array<number>(SIZE * SIZE).fill(EMPTY);
    this.scale.fill(1);
  }

  setOptions(options: ViewOptions): void {
    this.options = options;
    this.particles.enabled = !options.reducedMotion;
  }

  /** Hard reset to a known board — new run, restore, or mode switch. */
  setGrid(grid: Grid): void {
    this.grid = cloneGrid(grid);
    this.queue.length = 0;
    this.anim = null;
    this.pop.fill(0);
    this.particles.clear();
    this.boardAngle = 0;
    this.shake = 0;
  }

  enqueue(events: GameEvent[]): void {
    this.queue.push(...events);
  }

  /** True while animation is playing; input stays locked until it clears. */
  get busy(): boolean {
    return this.anim !== null || this.queue.length > 0;
  }

  setGhost(col: number | null, value: number): void {
    this.ghostCol = col;
    this.ghostValue = value;
  }

  /** Board column under a client-space point, or null when outside. */
  columnAt(clientX: number, clientY: number): number | null {
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
    const col = Math.floor((x - this.pad) / this.cell);
    return col >= 0 && col < SIZE ? col : null;
  }

  /** Sizes the canvas to the largest square its container allows. */
  resize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const box = parent.getBoundingClientRect();
    const size = Math.max(120, Math.floor(Math.min(box.width, box.height)));
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.size = size;
    this.pad = Math.round(size * 0.018);
    this.cell = (size - this.pad * 2) / SIZE;
    this.canvas.style.width = `${size}px`;
    this.canvas.style.height = `${size}px`;
    this.canvas.width = Math.round(size * dpr);
    this.canvas.height = Math.round(size * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  update(dt: number): void {
    this.particles.update(dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 0.012);
    for (let i = 0; i < this.pop.length; i++) {
      if (this.pop[i] > 0) this.pop[i] = Math.max(0, this.pop[i] - dt / POP_MS);
    }

    let remaining = dt;
    // Zero-length events (gauge, gameover) resolve without consuming time, so
    // loop until either time runs out or the queue stalls on a real animation.
    for (let guard = 0; guard < 64; guard++) {
      if (!this.anim) {
        if (this.queue.length === 0) break;
        this.beginNext();
        if (!this.anim) continue;
      }
      this.anim.t += remaining;
      if (this.anim.t < this.anim.dur) break;
      remaining = this.anim.t - this.anim.dur;
      this.finish(this.anim);
      this.anim = null;
      if (this.queue.length === 0) {
        this.callbacks.onIdle?.();
        break;
      }
    }
  }

  private speed(ms: number): number {
    return this.options.reducedMotion ? ms * 0.35 : ms;
  }

  /** Pulls the next event, applies its immediate effect, starts its animation. */
  private beginNext(): void {
    const event = this.queue.shift();
    if (!event) return;

    switch (event.kind) {
      case 'drop': {
        const i = idx(event.toR, event.col);
        this.grid[i] = event.value;
        this.offY[i] = -(event.toR + 1.5);
        this.anim = {
          kind: 'drop',
          t: 0,
          dur: this.speed(DUR.dropBase + event.toR * DUR.dropPerRow),
          r: event.toR,
          c: event.col,
        };
        break;
      }
      case 'gravity': {
        const moves: Array<{ r: number; c: number; dist: number }> = [];
        let longest = 0;
        for (const m of event.moves) {
          this.grid[idx(m.toR, m.toC)] = this.grid[idx(m.fromR, m.fromC)];
          this.grid[idx(m.fromR, m.fromC)] = EMPTY;
          const dist = m.toR - m.fromR;
          if (dist > longest) longest = dist;
          moves.push({ r: m.toR, c: m.toC, dist });
        }
        this.anim = {
          kind: 'gravity',
          t: 0,
          dur: this.speed(DUR.gravityBase + longest * DUR.gravityPerRow),
          moves,
        };
        break;
      }
      case 'merge':
        this.anim = {
          kind: 'merge',
          t: 0,
          dur: this.speed(DUR.merge),
          groups: event.groups,
          chain: event.chain,
        };
        break;
      case 'petrify': {
        this.grid[idx(event.pos.r, event.pos.c)] = STONE;
        this.anim = {
          kind: 'petrify',
          t: 0,
          dur: this.speed(DUR.petrify),
          r: event.pos.r,
          c: event.pos.c,
        };
        break;
      }
      case 'rotate': {
        this.grid = rotateGrid(this.grid, event.dir);
        this.anim = {
          kind: 'rotate',
          t: 0,
          dur: this.speed(DUR.rotate),
          from: event.dir === 'cw' ? -Math.PI / 2 : Math.PI / 2,
        };
        this.callbacks.onRotate?.();
        break;
      }
      case 'gauge':
        this.callbacks.onGauge?.(event.value);
        break;
      case 'gameover':
        this.callbacks.onGameOver?.();
        break;
    }
  }

  /** Applies an animation's end state and fires its feedback callback. */
  private finish(anim: Anim): void {
    switch (anim.kind) {
      case 'drop': {
        const i = idx(anim.r, anim.c);
        this.offY[i] = 0;
        this.pop[i] = 1;
        this.callbacks.onLand?.();
        break;
      }
      case 'gravity':
        for (const m of anim.moves) {
          const i = idx(m.r, m.c);
          this.offY[i] = 0;
          if (m.dist >= 2) this.pop[i] = 0.7;
        }
        break;
      case 'merge': {
        for (const group of anim.groups) {
          for (const p of group.cells) this.grid[idx(p.r, p.c)] = EMPTY;
          for (const p of group.stones) {
            this.grid[idx(p.r, p.c)] = EMPTY;
            const { x, y } = this.center(p.r, p.c);
            this.particles.burst(x, y, COLORS.stoneEdge, 6, 0.09);
          }
        }
        for (const group of anim.groups) {
          const i = idx(group.anchor.r, group.anchor.c);
          this.grid[i] = group.newValue;
          this.pop[i] = 1;
          const { x, y } = this.center(group.anchor.r, group.anchor.c);
          const budget = this.options.reducedMotion ? 0 : Math.min(14, 4 + group.cells.length * 2);
          this.particles.burst(x, y, orbColor(group.newValue, this.options.palette), budget, 0.13);
        }
        if (!this.options.reducedMotion) {
          this.shake = Math.min(1, this.shake + 0.16 * anim.chain);
        }
        this.callbacks.onMerge?.(anim.chain, anim.groups);
        break;
      }
      case 'petrify': {
        this.pop[idx(anim.r, anim.c)] = 0.8;
        this.callbacks.onPetrify?.();
        break;
      }
      case 'rotate':
        this.boardAngle = 0;
        break;
    }
  }

  /** Recomputes per-cell transforms for the frame from the active animation. */
  private applyAnimTransforms(): void {
    this.offX.fill(0);
    this.offY.fill(0);
    this.scale.fill(1);
    this.boardAngle = 0;
    const anim = this.anim;
    if (!anim) return;
    const p = Math.min(1, anim.t / anim.dur);

    switch (anim.kind) {
      case 'drop': {
        const eased = easeOutBack(p);
        this.offY[idx(anim.r, anim.c)] = -(anim.r + 1.5) * (1 - eased);
        break;
      }
      case 'gravity': {
        const eased = easeOutCubic(p);
        for (const m of anim.moves) this.offY[idx(m.r, m.c)] = -m.dist * (1 - eased);
        break;
      }
      case 'merge': {
        // Hold briefly so the group reads as a set, then collapse inward.
        const slide = easeInCubic(Math.max(0, (p - 0.25) / 0.75));
        for (const group of anim.groups) {
          for (const cell of group.cells) {
            const i = idx(cell.r, cell.c);
            if (cell.r === group.anchor.r && cell.c === group.anchor.c) {
              this.scale[i] = 1 + 0.12 * slide;
              continue;
            }
            this.offX[i] = (group.anchor.c - cell.c) * slide;
            this.offY[i] = (group.anchor.r - cell.r) * slide;
            this.scale[i] = 1 - 0.55 * slide;
          }
          for (const stone of group.stones) {
            this.scale[idx(stone.r, stone.c)] = 1 - 0.7 * slide;
          }
        }
        break;
      }
      case 'petrify':
        this.scale[idx(anim.r, anim.c)] = easeOutBack(p);
        break;
      case 'rotate':
        this.boardAngle = anim.from * (1 - easeInOutCubic(p));
        break;
    }
  }

  private center(r: number, c: number): { x: number; y: number } {
    return {
      x: this.pad + (c + 0.5) * this.cell,
      y: this.pad + (r + 0.5) * this.cell,
    };
  }

  draw(): void {
    const ctx = this.ctx;
    const size = this.size;
    if (size <= 0) return;
    this.applyAnimTransforms();

    ctx.fillStyle = COLORS.boardBg;
    ctx.fillRect(0, 0, size, size);

    ctx.save();
    if (this.shake > 0) {
      const amp = this.shake * this.cell * 0.07;
      ctx.translate((Math.random() - 0.5) * amp, (Math.random() - 0.5) * amp);
    }
    if (this.boardAngle !== 0) {
      ctx.translate(size / 2, size / 2);
      ctx.rotate(this.boardAngle);
      ctx.translate(-size / 2, -size / 2);
    }

    this.drawSlots();
    this.drawGhost();
    this.drawCells();
    this.particles.draw(ctx, this.cell / 34);
    ctx.restore();
  }

  private drawSlots(): void {
    const ctx = this.ctx;
    const inset = this.cell * 0.06;
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        ctx.fillStyle = r === 0 ? COLORS.slotDanger : COLORS.slot;
        ctx.beginPath();
        roundedRect(
          ctx,
          this.pad + c * this.cell + inset,
          this.pad + r * this.cell + inset,
          this.cell - inset * 2,
          this.cell - inset * 2,
          this.cell * 0.2,
        );
        ctx.fill();
      }
    }

    // Death line: the boundary an orb must never rest above.
    const y = this.pad + this.cell;
    ctx.strokeStyle = COLORS.deathLine;
    ctx.globalAlpha = 0.5;
    ctx.lineWidth = Math.max(1, this.cell * 0.035);
    ctx.setLineDash([this.cell * 0.22, this.cell * 0.16]);
    ctx.beginPath();
    ctx.moveTo(this.pad, y);
    ctx.lineTo(this.size - this.pad, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  private drawGhost(): void {
    if (this.ghostCol === null || this.busy) return;
    const col = this.ghostCol;
    const row = landingRow(this.grid, col);
    if (row < 0) return;
    const ctx = this.ctx;

    ctx.fillStyle = COLORS.ghost;
    ctx.beginPath();
    roundedRect(
      ctx,
      this.pad + col * this.cell,
      this.pad,
      this.cell,
      this.size - this.pad * 2,
      this.cell * 0.2,
    );
    ctx.fill();

    const { x, y } = this.center(row, col);
    ctx.strokeStyle = orbColor(this.ghostValue, this.options.palette);
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = Math.max(1.5, this.cell * 0.045);
    traceShape(ctx, orbShape(this.ghostValue), x, y, this.cell * 0.36);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  private drawCells(): void {
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        const i = idx(r, c);
        const cell = this.grid[i];
        if (cell === EMPTY) continue;

        const x = this.pad + (c + 0.5 + this.offX[i]) * this.cell;
        const y = this.pad + (r + 0.5 + this.offY[i]) * this.cell;
        const popScale = this.pop[i] > 0 ? 1 + 0.22 * Math.sin(this.pop[i] * Math.PI) : 1;
        const radius = this.cell * 0.4 * this.scale[i] * popScale;
        if (radius <= 0.5) continue;

        if (cell === STONE) this.drawStone(x, y, radius);
        else this.drawOrbCell(x, y, radius, cell);
      }
    }
  }

  private drawStone(x: number, y: number, radius: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = COLORS.stone;
    ctx.beginPath();
    roundedRect(ctx, x - radius, y - radius, radius * 2, radius * 2, radius * 0.25);
    ctx.fill();
    ctx.strokeStyle = COLORS.stoneEdge;
    ctx.lineWidth = Math.max(1, radius * 0.12);
    ctx.stroke();
    // A branching fracture, so a stone never reads as a dark orb.
    ctx.lineWidth = Math.max(1, radius * 0.09);
    ctx.beginPath();
    ctx.moveTo(x - radius * 0.6, y - radius * 0.1);
    ctx.lineTo(x - radius * 0.12, y + radius * 0.08);
    ctx.lineTo(x + radius * 0.16, y - radius * 0.32);
    ctx.lineTo(x + radius * 0.6, y + radius * 0.06);
    ctx.moveTo(x - radius * 0.12, y + radius * 0.08);
    ctx.lineTo(x - radius * 0.02, y + radius * 0.6);
    ctx.stroke();
  }

  private drawOrbCell(x: number, y: number, radius: number, value: number): void {
    drawOrb(this.ctx, x, y, radius, value, this.options.palette);
  }
}

/** Shared orb painter, also used by the HUD's next-orb preview. */
export function drawOrb(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  value: number,
  palette: PaletteName,
): void {
  const color = orbColor(value, palette);
  const shape = orbShape(value);

  const gradient = ctx.createLinearGradient(x, y - radius, x, y + radius);
  gradient.addColorStop(0, lighten(color, 0.22));
  gradient.addColorStop(1, color);

  traceShape(ctx, shape, x, y, radius);
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = lighten(color, 0.4);
  ctx.lineWidth = Math.max(1, radius * 0.07);
  ctx.stroke();

  ctx.fillStyle = inkColor(color);
  ctx.font = `700 ${Math.round(radius * 0.92)}px ui-rounded, system-ui, -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), x, y + radius * 0.04);
}

function lighten(hex: string, amount: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutBack(t: number): number {
  const c1 = 1.7;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}
