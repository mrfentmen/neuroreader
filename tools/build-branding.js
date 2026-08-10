"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "icons", "neuroreader-brain.png");

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function buildBrain(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const background = [17, 17, 17, 255];
  const accent = [220, 38, 38, 255];
  function set(x, y, color) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    for (let i = 0; i < 4; i++) pixels[offset + i] = color[i];
  }
  function line(x1, y1, x2, y2, width) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy || 1;
    for (let y = Math.floor(Math.min(y1, y2) - width); y <= Math.ceil(Math.max(y1, y2) + width); y++) {
      for (let x = Math.floor(Math.min(x1, x2) - width); x <= Math.ceil(Math.max(x1, x2) + width); x++) {
        const projection = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
        const nearX = x1 + projection * dx;
        const nearY = y1 + projection * dy;
        if (Math.hypot(x - nearX, y - nearY) <= width) set(x, y, accent);
      }
    }
  }
  function path(points, width) {
    for (let i = 1; i < points.length; i++) line(points[i - 1][0] * size, points[i - 1][1] * size, points[i][0] * size, points[i][1] * size, width);
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, background);
  const left = [[0.50, 0.25], [0.43, 0.17], [0.34, 0.16], [0.28, 0.22], [0.20, 0.22], [0.15, 0.31], [0.16, 0.40], [0.11, 0.49], [0.16, 0.58], [0.13, 0.68], [0.19, 0.76], [0.28, 0.75], [0.31, 0.84], [0.41, 0.85], [0.50, 0.76]];
  path(left, Math.max(1, size * 0.065));
  path(left.map(([x, y]) => [1 - x, y]), Math.max(1, size * 0.065));
  line(0.50 * size, 0.25 * size, 0.50 * size, 0.76 * size, Math.max(1, size * 0.065));
  const folds = [
    [[0.31, 0.27], [0.37, 0.32], [0.34, 0.40], [0.41, 0.45]],
    [[0.27, 0.48], [0.35, 0.51], [0.33, 0.61], [0.42, 0.64]],
    [[0.29, 0.68], [0.38, 0.70], [0.39, 0.78]],
  ];
  for (const fold of folds) {
    path(fold, Math.max(1, size * 0.045));
    path(fold.map(([x, y]) => [1 - x, y]), Math.max(1, size * 0.045));
  }
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4)]));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buildBrain(512));
console.log(`Wrote ${path.relative(ROOT, OUT)}`);
