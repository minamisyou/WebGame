/**
 * Orb appearance. Every orb is coded three ways at once — colour, silhouette
 * and number — so the board stays readable for colour-blind players and in
 * bright sunlight, where hue alone fails.
 */

export type PaletteName = 'default' | 'accessible';

/** Vivid palette tuned for the dark board. */
const DEFAULT_HUES = [
  '#38bdf8',
  '#34d399',
  '#fbbf24',
  '#fb7185',
  '#a78bfa',
  '#f97316',
  '#22d3ee',
  '#a3e635',
  '#f472b6',
  '#60a5fa',
];

/** Okabe-Ito, safe across the common colour-vision deficiencies. */
const ACCESSIBLE_HUES = [
  '#56b4e9',
  '#e69f00',
  '#009e73',
  '#f0e442',
  '#0072b2',
  '#d55e00',
  '#cc79a7',
  '#bbbbbb',
];

export type ShapeKind = 'circle' | 'square' | 'hexagon' | 'diamond' | 'triangle' | 'octagon';

const SHAPES: ShapeKind[] = ['circle', 'square', 'hexagon', 'diamond', 'triangle', 'octagon'];

export function orbColor(value: number, palette: PaletteName): string {
  const hues = palette === 'accessible' ? ACCESSIBLE_HUES : DEFAULT_HUES;
  return hues[(value - 1) % hues.length];
}

export function orbShape(value: number): ShapeKind {
  return SHAPES[(value - 1) % SHAPES.length];
}

/** Dark ink on light orbs, light ink on dark ones. */
export function inkColor(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? '#0b1020' : '#ffffff';
}

export const COLORS = {
  boardBg: '#0e1424',
  slot: '#161e33',
  slotDanger: '#2a1a2c',
  deathLine: '#f43f5e',
  stone: '#4b5468',
  stoneEdge: '#5f6a82',
  ghost: 'rgba(255,255,255,0.10)',
  ghostEdge: 'rgba(255,255,255,0.35)',
};

/** Traces an orb silhouette centred at (x, y) with the given radius. */
export function traceShape(
  ctx: CanvasRenderingContext2D,
  kind: ShapeKind,
  x: number,
  y: number,
  radius: number,
): void {
  ctx.beginPath();
  switch (kind) {
    case 'circle':
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      break;
    case 'square':
      roundedRect(ctx, x - radius, y - radius, radius * 2, radius * 2, radius * 0.32);
      break;
    case 'triangle':
      polygon(ctx, x, y + radius * 0.12, radius * 1.14, 3, -Math.PI / 2);
      break;
    case 'diamond':
      polygon(ctx, x, y, radius * 1.08, 4, -Math.PI / 2);
      break;
    case 'hexagon':
      polygon(ctx, x, y, radius * 1.04, 6, -Math.PI / 2);
      break;
    case 'octagon':
      polygon(ctx, x, y, radius * 1.02, 8, Math.PI / 8);
      break;
  }
  ctx.closePath();
}

function polygon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  sides: number,
  rotation: number,
): void {
  for (let i = 0; i < sides; i++) {
    const angle = rotation + (i * Math.PI * 2) / sides;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
}

export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
}
