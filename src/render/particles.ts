/**
 * Fixed-capacity particle pool. Nothing is allocated after construction, so
 * the game loop stays free of GC pauses on low-end phones.
 */
interface Particle {
  alive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
}

export class Particles {
  private pool: Particle[] = [];
  private cursor = 0;
  /** Hard cap on simultaneous particles; also the per-burst budget source. */
  readonly capacity: number;
  enabled = true;

  constructor(capacity = 90) {
    this.capacity = capacity;
    for (let i = 0; i < capacity; i++) {
      this.pool.push({
        alive: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 1,
        size: 2,
        color: '#fff',
      });
    }
  }

  /** Ring-buffer allocation: a burst past capacity overwrites the oldest. */
  burst(x: number, y: number, color: string, count: number, speed: number): void {
    if (!this.enabled) return;
    for (let i = 0; i < count; i++) {
      const p = this.pool[this.cursor];
      this.cursor = (this.cursor + 1) % this.capacity;
      const angle = Math.random() * Math.PI * 2;
      const v = speed * (0.45 + Math.random() * 0.75);
      p.alive = true;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(angle) * v;
      p.vy = Math.sin(angle) * v - speed * 0.35;
      p.maxLife = 320 + Math.random() * 260;
      p.life = p.maxLife;
      p.size = 1.6 + Math.random() * 2.6;
      p.color = color;
    }
  }

  update(dt: number): void {
    const gravity = 0.0016;
    for (const p of this.pool) {
      if (!p.alive) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += gravity * dt;
      p.vx *= 0.995;
    }
  }

  draw(ctx: CanvasRenderingContext2D, scale: number): void {
    for (const p of this.pool) {
      if (!p.alive) continue;
      ctx.globalAlpha = Math.min(1, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      const size = p.size * scale;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    for (const p of this.pool) p.alive = false;
  }
}
