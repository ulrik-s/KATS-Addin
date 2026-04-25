#!/usr/bin/env node
// @ts-check
/**
 * Generate placeholder PNG icons for the manifest's IconUrl /
 * HighResolutionIconUrl / VersionOverrides bt:Image entries.
 *
 * The Word ribbon needs *something* at every icon URL or it silently
 * suppresses the tab. These are intentionally simple — a flat colored
 * square with a "K" stamp — so the build is self-contained (no
 * design-time deps).
 *
 * Output: public/assets/icon-{16,32,64,80,128}.png
 *
 * Vite's `public/` is copied verbatim into `dist/` at build time, and
 * served at root path during dev. The manifest's URLs map cleanly:
 *
 *   https://localhost:3000/assets/icon-32.png
 *   https://ulrik-s.github.io/KATS-Addin/assets/icon-32.png
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'public/assets');

const SIZES = [16, 32, 64, 80, 128];

// Office-blue background, white "K". Matches Microsoft accent (~#0078d4).
const BG = { r: 0x00, g: 0x78, b: 0xd4, a: 0xff };
const FG = { r: 0xff, g: 0xff, b: 0xff, a: 0xff };

const K_GLYPH = ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'];

/** @type {number[] | undefined} */
let CRC_TABLE;

mkdirSync(outDir, { recursive: true });
for (const size of SIZES) {
  const png = renderKatsIcon(size, BG, FG);
  const path = resolve(outDir, `icon-${String(size)}.png`);
  writeFileSync(path, png);
  console.log(`wrote ${String(png.length)} bytes → ${path}`);
}

/**
 * @param {number} size
 * @param {{r:number,g:number,b:number,a:number}} bg
 * @param {{r:number,g:number,b:number,a:number}} fg
 * @returns {Buffer}
 */
function renderKatsIcon(size, bg, fg) {
  // Build a `size × size` RGBA framebuffer + PNG-encode it.
  // We draw a "K" using a tiny 5×7 bitmap font scaled to the icon size.
  const buf = new Uint8Array(size * size * 4);
  fillRect(buf, size, 0, 0, size, size, bg);

  const glyphW = 5;
  const glyphH = 7;
  const padding = Math.floor(size * 0.15);
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
 * @param {Uint8Array} buf
 * @param {number} stride
 * @param {number} x
 * @param {number} y
 * @param {number} w
 * @param {number} h
 * @param {{r:number,g:number,b:number,a:number}} c
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
 * Encode raw RGBA pixels into a minimal PNG. Uses Node's zlib for IDAT
 * compression. Format reference: https://www.w3.org/TR/png/.
 *
 * @param {Uint8Array} pixels — RGBA, length = w*h*4
 * @param {number} w
 * @param {number} h
 * @returns {Buffer}
 */
function encodePng(pixels, w, h) {
  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type: truecolor + alpha
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  // Each row needs a leading filter-type byte (0 = none).
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

/**
 * @param {string} type — 4-char chunk type
 * @param {Buffer} data
 * @returns {Buffer}
 */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

/**
 * @param {Buffer} buf
 * @returns {number}
 */
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
