"use strict";

const fs = require("fs");

/*
 * NeuroReader release-tool adapter for image-size.
 *
 * addons-linter only needs dimensions for extension icons. This deliberately
 * supports the formats Mozilla's linter accepts (PNG, GIF, JPEG, WebP, and
 * SVG) and rejects every other format. Every parser advances through a
 * bounded buffer or returns immediately; no attacker-controlled size can
 * create an unbounded loop.
 */

function fail() {
  throw new TypeError("unsupported or invalid image format");
}

function bytes(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof Uint8Array) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (typeof input === "string") {
    try {
      return fs.readFileSync(input);
    } catch {
      fail();
    }
  }
  fail();
}

function dimensions(width, height, type) {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) fail();
  return { width, height, type };
}

function png(buffer) {
  if (buffer.length < 24 || buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") fail();
  return dimensions(buffer.readUInt32BE(16), buffer.readUInt32BE(20), "png");
}

function gif(buffer) {
  if (buffer.length < 10 || (buffer.subarray(0, 6).toString() !== "GIF87a" && buffer.subarray(0, 6).toString() !== "GIF89a")) fail();
  return dimensions(buffer.readUInt16LE(6), buffer.readUInt16LE(8), "gif");
}

function jpeg(buffer) {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) fail();
  let offset = 2;
  while (offset + 3 < buffer.length) {
    while (offset < buffer.length && buffer[offset] === 0xff) offset++;
    if (offset >= buffer.length) break;
    const marker = buffer[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (offset + 1 >= buffer.length) break;
    const length = buffer.readUInt16BE(offset);
    if (length < 2 || offset + length > buffer.length) break;
    const isFrame = (marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf);
    if (isFrame && length >= 7) return dimensions(buffer.readUInt16BE(offset + 5), buffer.readUInt16BE(offset + 3), "jpg");
    offset += length;
  }
  fail();
}

function webp(buffer) {
  if (buffer.length < 16 || buffer.subarray(0, 4).toString() !== "RIFF" || buffer.subarray(8, 12).toString() !== "WEBP") fail();
  const kind = buffer.subarray(12, 16).toString();
  if (kind === "VP8X" && buffer.length >= 30) {
    const width = 1 + buffer[24] + (buffer[25] << 8) + (buffer[26] << 16);
    const height = 1 + buffer[27] + (buffer[28] << 8) + (buffer[29] << 16);
    return dimensions(width, height, "webp");
  }
  if (kind === "VP8 " && buffer.length >= 30 && buffer[23] === 0x9d && buffer[24] === 0x01 && buffer[25] === 0x2a) {
    return dimensions(buffer.readUInt16LE(26) & 0x3fff, buffer.readUInt16LE(28) & 0x3fff, "webp");
  }
  if (kind === "VP8L" && buffer.length >= 26 && buffer[21] === 0x2f) {
    const bits = buffer[22] | (buffer[23] << 8) | (buffer[24] << 16) | (buffer[25] << 24);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >>> 14) & 0x3fff) + 1;
    return dimensions(width, height, "webp");
  }
  fail();
}

function svg(input) {
  const text = Buffer.isBuffer(input) || input instanceof Uint8Array ? Buffer.from(input).toString("utf8") : String(input);
  if (!/<svg(?:\s|>)/i.test(text.slice(0, 4096))) fail();
  const viewBox = text.match(/\bviewBox\s*=\s*["']\s*[-+]?\d+(?:\.\d+)?\s+[-+]?\d+(?:\.\d+)?\s+([-+]?\d+(?:\.\d+)?)\s+([-+]?\d+(?:\.\d+)?)\s*["']/i);
  if (viewBox) return dimensions(Math.round(Number(viewBox[1])), Math.round(Number(viewBox[2])), "svg");
  const read = (name) => {
    const match = text.match(new RegExp("\\b" + name + "\\s*=\\s*[\\\"']\\s*([0-9]+(?:\\.[0-9]+)?)", "i"));
    return match ? Number(match[1]) : 0;
  };
  return dimensions(Math.round(read("width")), Math.round(read("height")), "svg");
}

function imageSize(input) {
  const buffer = bytes(input);
  if (buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return png(buffer);
  if (buffer.subarray(0, 6).toString() === "GIF87a" || buffer.subarray(0, 6).toString() === "GIF89a") return gif(buffer);
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return jpeg(buffer);
  if (buffer.subarray(0, 4).toString() === "RIFF" && buffer.subarray(8, 12).toString() === "WEBP") return webp(buffer);
  if (/^\s*<svg(?:\s|>)/i.test(buffer.toString("utf8", 0, Math.min(buffer.length, 4096)))) return svg(input);
  fail();
}

module.exports = imageSize;
module.exports.imageSize = imageSize;
