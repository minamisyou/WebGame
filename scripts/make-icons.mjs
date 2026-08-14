/**
 * Generates the PWA PNG icons from the same shape/colour language the game
 * uses, so no binary art needs to live in the repo by hand.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public');

const BG = [11, 15, 28];
const ORBS = [
  { shape: 'circle', color: [56, 189, 248] },
  { shape: 'square', color: [52, 211, 153] },
  { shape: 'hexagon', color: [251, 191, 36] },
  { shape: 'diamond', color: [167, 139, 250] },
];

/** Signed "inside" test in shape-local coordinates normalised to [-1, 1]. */
function inside(shape, x, y) {
  switch (shape) {
    case 'circle':
      return x * x + y * y <= 1;
    case 'square': {
      // Rounded square: chebyshev distance with a corner radius.
      const r = 0.32;
      const dx = Math.max(Math.abs(x) - (1 - r), 0);
      const dy = Math.max(Math.abs(y) - (1 - r), 0);
      return Math.abs(x) <= 1 && Math.abs(y) <= 1 && dx * dx + dy * dy <= r * r;
    }
    case 'diamond':
      return Math.abs(x) + Math.abs(y) <= 1;
    case 'hexagon': {
      const q = Math.abs(x) * 0.8660254 + Math.abs(y) * 0.5;
      return q <= 0.8660254 && Math.abs(y) <= 0.8660254;
    }
    default:
      return false;
  }
}

function render(size) {
  const px = new Uint8Array(size * size * 4);
  const samples = 3;
  const cellSize = size * 0.34;
  const gap = size * 0.06;
  const totalW = cellSize * 2 + gap;
  const originX = (size - totalW) / 2;
  const originY = (size - totalW) / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = BG[0];
      let g = BG[1];
      let b = BG[2];

      for (let i = 0; i < ORBS.length; i++) {
        const orb = ORBS[i];
        const cx = originX + (i % 2) * (cellSize + gap) + cellSize / 2;
        const cy = originY + Math.floor(i / 2) * (cellSize + gap) + cellSize / 2;
        const radius = cellSize / 2;

        // Supersample the edge so shapes don't come out jagged.
        let hits = 0;
        for (let sy = 0; sy < samples; sy++) {
          for (let sx = 0; sx < samples; sx++) {
            const px0 = x + (sx + 0.5) / samples;
            const py0 = y + (sy + 0.5) / samples;
            if (inside(orb.shape, (px0 - cx) / radius, (py0 - cy) / radius)) hits++;
          }
        }
        if (hits === 0) continue;
        const a = hits / (samples * samples);
        r = Math.round(r * (1 - a) + orb.color[0] * a);
        g = Math.round(g * (1 - a) + orb.color[1] * a);
        b = Math.round(b * (1 - a) + orb.color[2] * a);
      }

      const o = (y * size + x) * 4;
      px[o] = r;
      px[o + 1] = g;
      px[o + 2] = b;
      px[o + 3] = 255;
    }
  }
  return px;
}

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(size, pixels) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // truecolour + alpha
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    Buffer.from(pixels.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
for (const size of [180, 192, 512]) {
  const file = resolve(OUT_DIR, `icon-${size}.png`);
  writeFileSync(file, encodePng(size, render(size)));
  console.log(`wrote ${file}`);
}
