/**
 * 生成应用图标：build/icon.ico（256×256，PNG 内嵌）+ build/icon.png
 * 纯 Node 画图，不依赖任何图形库
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const OUT = path.join(__dirname, '..', 'build');
const S = 1024; // 超采样后缩到 256
const TARGET = 256;

const buf = new Float32Array(S * S * 4); // premultiplied-ish，最后再归一

function blend(x, y, r, g, b, a) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || y < 0 || x >= S || y >= S || a <= 0) return;
  const i = (y * S + x) * 4;
  const src = a;
  const dstA = buf[i + 3];
  const outA = src + dstA * (1 - src);
  if (outA <= 0) return;
  buf[i] = (r * src + buf[i] * dstA * (1 - src)) / outA;
  buf[i + 1] = (g * src + buf[i + 1] * dstA * (1 - src)) / outA;
  buf[i + 2] = (b * src + buf[i + 2] * dstA * (1 - src)) / outA;
  buf[i + 3] = outA;
}

function circle(cx, cy, rad, color, alpha = 1) {
  const [r, g, b] = color;
  const x0 = Math.floor(cx - rad - 2);
  const x1 = Math.ceil(cx + rad + 2);
  const y0 = Math.floor(cy - rad - 2);
  const y1 = Math.ceil(cy + rad + 2);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const cov = Math.max(0, Math.min(1, rad - d + 0.5));
      if (cov > 0) blend(x, y, r, g, b, cov * alpha);
    }
  }
}

function capsule(x1, y1, x2, y2, r1, r2, color, alpha = 1) {
  const [r, g, b] = color;
  const minX = Math.floor(Math.min(x1, x2) - Math.max(r1, r2) - 2);
  const maxX = Math.ceil(Math.max(x1, x2) + Math.max(r1, r2) + 2);
  const minY = Math.floor(Math.min(y1, y2) - Math.max(r1, r2) - 2);
  const maxY = Math.ceil(Math.max(y1, y2) + Math.max(r1, r2) + 2);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy || 1;
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      let t = ((x - x1) * dx + (y - y1) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
      const px = x1 + dx * t;
      const py = y1 + dy * t;
      const rad = r1 + (r2 - r1) * t;
      const d = Math.hypot(x - px, y - py);
      const cov = Math.max(0, Math.min(1, rad - d + 0.5));
      if (cov > 0) blend(x, y, r, g, b, cov * alpha);
    }
  }
}

function roundRect(x0, y0, w, h, rad, topColor, bottomColor) {
  for (let y = Math.floor(y0); y < Math.ceil(y0 + h); y++) {
    for (let x = Math.floor(x0); x < Math.ceil(x0 + w); x++) {
      const cx = Math.min(Math.max(x, x0 + rad), x0 + w - rad);
      const cy = Math.min(Math.max(y, y0 + rad), y0 + h - rad);
      const d = Math.hypot(x - cx, y - cy);
      const cov = Math.max(0, Math.min(1, rad - d + 0.5));
      if (cov <= 0) continue;
      const t = (y - y0) / h;
      const r = topColor[0] + (bottomColor[0] - topColor[0]) * t;
      const g = topColor[1] + (bottomColor[1] - topColor[1]) * t;
      const b = topColor[2] + (bottomColor[2] - topColor[2]) * t;
      blend(x, y, r, g, b, cov);
    }
  }
}

/* ---------- 构图 ---------- */
const cx = S / 2;

// 背景：深紫圆角方块
roundRect(56, 56, S - 112, S - 112, 190, [42, 30, 62], [16, 12, 24]);
// 内部柔光
for (let i = 10; i >= 1; i--) {
  circle(cx, S * 0.62, 120 + i * 26, [150, 108, 255], 0.018);
}

// 石盆：盆体 + 盆沿 + 底部阴影
for (let i = 0; i < 6; i++) {
  const t = i / 5;
  capsule(cx - 104 + t * 14, S * (0.775 + t * 0.045), cx + 104 - t * 14, S * (0.775 + t * 0.045), 22 - t * 4, 22 - t * 4, [74 + t * 10, 52 + t * 8, 36 + t * 6], 1);
}
capsule(cx - 122, S * 0.765, cx + 122, S * 0.765, 13, 13, [126, 92, 62], 1);
capsule(cx - 118, S * 0.758, cx + 118, S * 0.758, 7, 7, [168, 128, 88], 1);

// 树冠（多个圆叠成不规则冠幅）
const canopy = [
  [cx - 96, S * 0.36, 92],
  [cx + 78, S * 0.34, 84],
  [cx - 10, S * 0.28, 104],
  [cx - 128, S * 0.46, 66],
  [cx + 122, S * 0.45, 62],
  [cx + 10, S * 0.44, 78]
];
for (const [x, y, r] of canopy) circle(x, y, r, [36, 74, 58], 1);
// 受光面提亮
for (const [x, y, r] of canopy) circle(x - r * 0.18, y - r * 0.22, r * 0.72, [52, 104, 78], 0.85);

// 主干 + 两根分枝
capsule(cx, S * 0.79, cx + 4, S * 0.55, 26, 18, [232, 222, 204], 1);
capsule(cx + 4, S * 0.56, cx - 74, S * 0.42, 17, 9, [232, 222, 204], 1);
capsule(cx + 4, S * 0.56, cx + 82, S * 0.41, 17, 9, [232, 222, 204], 1);
capsule(cx - 74, S * 0.42, cx - 118, S * 0.34, 9, 5, [232, 222, 204], 1);
capsule(cx + 82, S * 0.41, cx + 124, S * 0.33, 9, 5, [232, 222, 204], 1);

// 花与果
const dots = [
  [cx - 120, S * 0.33, 17, [255, 157, 196]],
  [cx + 122, S * 0.32, 15, [199, 155, 255]],
  [cx - 40, S * 0.24, 14, [255, 157, 196]],
  [cx + 46, S * 0.27, 13, [243, 208, 138]],
  [cx - 8, S * 0.19, 12, [199, 155, 255]],
  [cx + 96, S * 0.50, 11, [243, 208, 138]]
];
for (const [x, y, r, c] of dots) {
  circle(x, y, r * 1.7, c, 0.12);
  circle(x, y, r, c, 1);
  circle(x - r * 0.3, y - r * 0.3, r * 0.34, [255, 255, 255], 0.65);
}

/* ---------- 降采样到 256 ---------- */
const out = Buffer.alloc(TARGET * TARGET * 4);
const k = S / TARGET;
for (let y = 0; y < TARGET; y++) {
  for (let x = 0; x < TARGET; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let sy = 0; sy < k; sy++) {
      for (let sx = 0; sx < k; sx++) {
        const i = ((y * k + sy) * S + (x * k + sx)) * 4;
        r += buf[i];
        g += buf[i + 1];
        b += buf[i + 2];
        a += buf[i + 3];
        n++;
      }
    }
    const o = (y * TARGET + x) * 4;
    out[o] = Math.round(r / n);
    out[o + 1] = Math.round(g / n);
    out[o + 2] = Math.round(b / n);
    out[o + 3] = Math.round((a / n) * 255);
  }
}

/* ---------- PNG / ICO ---------- */
let CRC = null;
function crc32(b) {
  if (!CRC) {
    CRC = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC[n] = c;
    }
  }
  let c = -1;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
const png = encodePNG(TARGET, TARGET, out);
fs.writeFileSync(path.join(OUT, 'icon.png'), png);

// ICO：单条 256×256 PNG 条目
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
const entry = Buffer.alloc(16);
entry[0] = 0; // 256
entry[1] = 0;
entry[2] = 0;
entry[3] = 0;
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(22, 12);
fs.writeFileSync(path.join(OUT, 'icon.ico'), Buffer.concat([header, entry, png]));

console.log('icon written:', path.join(OUT, 'icon.ico'), 'png', png.length, 'bytes');
