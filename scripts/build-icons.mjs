#!/usr/bin/env node
// @ts-check
/**
 * Generate ribbon icons for the manifest's IconUrl /
 * HighResolutionIconUrl / VersionOverrides bt:Image entries.
 *
 * Three distinct icon sets so each ribbon control has its own
 * recognisable shape:
 *
 *   icon-{16,32,64,80,128}.png      — bold "K" on Office blue.
 *                                     Used for the IconUrl + group icon.
 *   process-{16,32,80}.png          — white play-triangle on green.
 *                                     "Processa KATS" button.
 *   panel-{16,32,80}.png            — white side-panel on purple.
 *                                     "Öppna KATS-panelen" button.
 *
 * No design-time deps — the encoder is a tiny pure-Node PNG writer
 * (IHDR / IDAT / IEND + CRC32 + zlib for compression).
 *
 * Vite copies `public/` verbatim into `dist/`, so the manifest URLs
 * resolve cleanly:
 *   https://localhost:3000/assets/process-32.png         (dev)
 *   https://ulrik-s.github.io/KATS-Addin/assets/process-32.png  (prod)
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'public/assets');

// Office accent colours.
const OFFICE_BLUE = { r: 0x00, g: 0x78, b: 0xd4, a: 0xff };
const OFFICE_GREEN = { r: 0x10, g: 0x7c, b: 0x10, a: 0xff };
const OFFICE_PURPLE = { r: 0x5c, g: 0x2d, b: 0x91, a: 0xff };
const WHITE = { r: 0xff, g: 0xff, b: 0xff, a: 0xff };

// Bold 6×7 K — chunkier than the previous 5×7 stroke so it reads
// better at 16px ribbon size.
const K_GLYPH = [
  '##....##',
  '##..##..',
  '##.##...',
  '####....',
  '##.##...',
  '##..##..',
  '##....##',
];

/** @type {number[] | undefined} */
let CRC_TABLE;

mkdirSync(outDir, { recursive: true });

for (const size of [16, 32, 64, 80, 128]) {
  writeIcon(`icon-${String(size)}.png`, renderKatsIcon(size, OFFICE_BLUE, WHITE));
}
for (const size of [16, 32, 80]) {
  writeIcon(`process-${String(size)}.png`, renderProcessIcon(size, OFFICE_GREEN, WHITE));
  writeIcon(`panel-${String(size)}.png`, renderPanelIcon(size, OFFICE_PURPLE, WHITE));
}

/** @param {string} name @param {Buffer} png */
function writeIcon(name, png) {
  const path = resolve(outDir, name);
  writeFileSync(path, png);
  console.log(`wrote ${String(png.length)} bytes → ${path}`);
}

/**
 * Bold "K" centered on a coloured background.
 * @param {number} size @param {RGBA} bg @param {RGBA} fg
 * @returns {Buffer}
 */
function renderKatsIcon(size, bg, fg) {
  const buf = new Uint8Array(size * size * 4);
  fillRect(buf, size, 0, 0, size, size, bg);

  const glyphW = K_GLYPH[0]?.length ?? 8;
  const glyphH = K_GLYPH.length;
  const padding = Math.floor(size * 0.12);
  const pixelSize = Math.floor((size - padding * 2) / Math.max(glyphW, glyphH));
  const drawW = pixelSize * glyphW;
  const drawH = pixelSize * glyphH;
  const ox = Math.floor((size - drawW) / 2);
  const oy = Math.floor((size - drawH) / 2);

  for (let gy = 0; gy < glyphH; gy += 1) {
    const row = K_GLYPH[gy] ?? '';
    for (let gx = 0; gx < glyphW; gx += 1) {
      if (row.charAt(gx) !== '#') continue;
      fillRect(buf, size, ox + gx * pixelSize, oy + gy * pixelSize, pixelSize, pixelSize, fg);
    }
  }
  return encodePng(buf, size, size);
}

/**
 * Right-pointing play triangle centered on a coloured background.
 * @param {number} size @param {RGBA} bg @param {RGBA} fg
 * @returns {Buffer}
 */
function renderProcessIcon(size, bg, fg) {
  const buf = new Uint8Array(size * size * 4);
  fillRect(buf, size, 0, 0, size, size, bg);

  // Triangle bounding box: ~32% padding from edges, slightly nudged
  // right so the visual centre matches the optical centre (a flat
  // left edge looks left-heavy).
  const triLeft = Math.round(size * 0.34);
  const triRight = Math.round(size * 0.74);
  const triTop = Math.round(size * 0.22);
  const triBottom = Math.round(size * 0.78);
  const vCenter = (triTop + triBottom) / 2;
  const halfHeight = (triBottom - triTop) / 2;

  for (let y = triTop; y < triBottom; y += 1) {
    const distFromCenter = Math.abs(y - vCenter);
    const fraction = halfHeight === 0 ? 0 : distFromCenter / halfHeight;
    const rightEdge = Math.round(triLeft + (1 - fraction) * (triRight - triLeft));
    if (rightEdge <= triLeft) continue;
    fillRect(buf, size, triLeft, y, rightEdge - triLeft, 1, fg);
  }
  return encodePng(buf, size, size);
}

/**
 * Side-panel pictogram: an outer frame with a narrow vertical bar at
 * the right side, suggesting a docked task pane.
 * @param {number} size @param {RGBA} bg @param {RGBA} fg
 * @returns {Buffer}
 */
function renderPanelIcon(size, bg, fg) {
  const buf = new Uint8Array(size * size * 4);
  fillRect(buf, size, 0, 0, size, size, bg);

  const margin = Math.max(2, Math.round(size * 0.18));
  const left = margin;
  const top = margin;
  const right = size - margin;
  const bottom = size - margin;
  const stroke = Math.max(1, Math.round(size * 0.06));

  // Outer frame border.
  fillRect(buf, size, left, top, right - left, stroke, fg); // top
  fillRect(buf, size, left, bottom - stroke, right - left, stroke, fg); // bottom
  fillRect(buf, size, left, top, stroke, bottom - top, fg); // left
  fillRect(buf, size, right - stroke, top, stroke, bottom - top, fg); // right

  // Filled inner side-panel on the right (~35% of inner width).
  const innerLeft = left + stroke;
  const innerRight = right - stroke;
  const innerTop = top + stroke;
  const innerBottom = bottom - stroke;
  const innerWidth = innerRight - innerLeft;
  const panelLeft = innerLeft + Math.round(innerWidth * 0.65);
  if (panelLeft < innerRight) {
    fillRect(buf, size, panelLeft, innerTop, innerRight - panelLeft, innerBottom - innerTop, fg);
  }
  return encodePng(buf, size, size);
}

/**
 * @typedef {{r:number, g:number, b:number, a:number}} RGBA
 */

/**
 * @param {Uint8Array} buf @param {number} stride
 * @param {number} x @param {number} y @param {number} w @param {number} h
 * @param {RGBA} c
 */
function fillRect(buf, stride, x, y, w, h, c) {
  for (let py = y; py < y + h; py += 1) {
    for (let px = x; px < x + w; px += 1) {
      const idx = (py * stride + px) * 4;
      buf[idx] = c.r;
      buf[idx + 1] = c.g;
      buf[idx + 2] = c.b;
      buf[idx + 3] = c.a;
    }
  }
}

/**
 * Encode raw RGBA pixels into a minimal PNG.
 * @param {Uint8Array} pixels — RGBA, length = w*h*4
 * @param {number} w @param {number} h
 * @returns {Buffer}
 */
function encodePng(pixels, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.writeUInt8(8, 8);
  ihdr.writeUInt8(6, 9);
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  const rowStride = w * 4;
  const raw = Buffer.alloc((rowStride + 1) * h);
  for (let y = 0; y < h; y += 1) {
    raw[y * (rowStride + 1)] = 0;
    raw.set(pixels.subarray(y * rowStride, (y + 1) * rowStride), y * (rowStride + 1) + 1);
  }
  const idat = deflateSync(raw);

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** @param {string} type @param {Buffer} data @returns {Buffer} */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/** @param {Buffer} buf @returns {number} */
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
