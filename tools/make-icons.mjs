// Generates the PWA icons (assets/icons/*.png) with no dependencies: a tiny
// rasterizer (4x supersampled) plus a minimal PNG encoder over node:zlib.
//
// Design: brand-blue rounded tile with a white "document" carrying highlight
// stripes in the label colors — a highlighted legal draft.
//
// Usage: node tools/make-icons.mjs

import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

// ----------------------------------------------------------------- raster

function makeCanvas(size, scale = 4) {
  const w = size * scale;
  return { size, scale, w, data: new Uint8Array(w * w * 4) };
}

function fillRoundedRect(cv, x, y, rw, rh, radius, [r, g, b, a = 255]) {
  const s = cv.scale;
  const X = x * s, Y = y * s, W = rw * s, H = rh * s, R = radius * s;
  const x2 = X + W, y2 = Y + H;
  for (let py = Math.floor(Y); py < y2; py++) {
    for (let px = Math.floor(X); px < x2; px++) {
      // Rounded-corner test
      let inside = true;
      const cx = px < X + R ? X + R : px > x2 - R ? x2 - R : px;
      const cy = py < Y + R ? Y + R : py > y2 - R ? y2 - R : py;
      if ((cx !== px || cy !== py) && (px - cx) ** 2 + (py - cy) ** 2 > R * R) {
        inside = false;
      }
      if (!inside) continue;
      const i = (py * cv.w + px) * 4;
      cv.data[i] = r;
      cv.data[i + 1] = g;
      cv.data[i + 2] = b;
      cv.data[i + 3] = a;
    }
  }
}

/** Box-downsample the supersampled canvas to size×size RGBA. */
function downsample(cv) {
  const { size, scale, w, data } = cv;
  const out = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const i = ((y * scale + sy) * w + x * scale + sx) * 4;
          const alpha = data[i + 3] / 255;
          r += data[i] * alpha;
          g += data[i + 1] * alpha;
          b += data[i + 2] * alpha;
          a += data[i + 3];
        }
      }
      const n = scale * scale;
      const o = (y * size + x) * 4;
      const aAvg = a / n;
      const aNorm = aAvg > 0 ? (a / 255) : 1;
      out[o] = Math.round(r / aNorm);
      out[o + 1] = Math.round(g / aNorm);
      out[o + 2] = Math.round(b / aNorm);
      out[o + 3] = Math.round(aAvg);
    }
  }
  return out;
}

// ------------------------------------------------------------------- png

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

function chunk(type, payload) {
  const out = Buffer.alloc(12 + payload.length);
  out.writeUInt32BE(payload.length, 0);
  out.write(type, 4, "ascii");
  payload.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + payload.length)), 8 + payload.length);
  return out;
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  // raw scanlines with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, y * size * 4, size * 4).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ------------------------------------------------------------------ icon

const BLUE = [0x1d, 0x4e, 0xd8];
const WHITE = [0xff, 0xff, 0xff];
const STRIPES = [
  [[0xec, 0x48, 0x99], 0.78], // issue pink
  [[0x22, 0xc5, 0x5e], 0.92], // rule green
  [[0x22, 0xc5, 0x5e], 0.55],
  [[0xf9, 0x73, 0x16], 0.85], // application orange
  [[0xf9, 0x73, 0x16], 0.68],
  [[0x3b, 0x82, 0xf6], 0.62], // conclusion blue
];

function drawIcon(size, { pad = 0, bgRadiusFrac = 0.22 } = {}) {
  const cv = makeCanvas(size);
  fillRoundedRect(cv, 0, 0, size, size, size * bgRadiusFrac, BLUE);

  const inset = size * (0.14 + pad);
  const docX = inset;
  const docY = inset * 0.85;
  const docW = size - 2 * inset;
  const docH = size - 1.7 * inset * 0.85 - inset * 0.45;
  fillRoundedRect(cv, docX, docY, docW, docH, size * 0.05, WHITE);

  const sx = docX + docW * 0.1;
  const maxW = docW * 0.8;
  const lineH = docH * 0.085;
  const gap = docH * 0.155;
  let y = docY + docH * 0.09;
  for (const [color, frac] of STRIPES) {
    fillRoundedRect(cv, sx, y, maxW * frac, lineH, lineH / 2, color);
    y += gap;
  }
  return encodePng(size, downsample(cv));
}

mkdirSync("assets/icons", { recursive: true });
writeFileSync("assets/icons/icon-512.png", drawIcon(512));
writeFileSync("assets/icons/icon-192.png", drawIcon(192));
writeFileSync("assets/icons/maskable-512.png", drawIcon(512, { pad: 0.08, bgRadiusFrac: 0 }));
writeFileSync("assets/icons/apple-touch-icon.png", drawIcon(180, { bgRadiusFrac: 0 }));
console.log("wrote 4 icons to assets/icons/");
