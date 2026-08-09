"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const parserPath = path.join(root, "vendor", "image-size", "index.js");
const runnerPath = path.join(root, "tools", "run-web-ext.js");
const parser = require(parserPath);

const png = Buffer.alloc(24);
png.write("\x89PNG\r\n\x1a\n", 0, "binary");
png.writeUInt32BE(320, 16);
png.writeUInt32BE(240, 20);
assert.deepStrictEqual(parser(png), { width: 320, height: 240, type: "png" });

const gif = Buffer.alloc(10);
gif.write("GIF89a", 0, "ascii");
gif.writeUInt16LE(64, 6);
gif.writeUInt16LE(48, 8);
assert.deepStrictEqual(parser(gif), { width: 64, height: 48, type: "gif" });

const jpeg = Buffer.from([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30, 0x00, 0x40, 0x03,
  0x01, 0x11, 0x00, 0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
  0xff, 0xd9,
]);
assert.deepStrictEqual(parser(jpeg), { width: 64, height: 48, type: "jpg" });

const webp = Buffer.alloc(30);
webp.write("RIFF", 0, "ascii");
webp.write("WEBP", 8, "ascii");
webp.write("VP8X", 12, "ascii");
webp[24] = 99;
webp[27] = 49;
assert.deepStrictEqual(parser(webp), { width: 100, height: 50, type: "webp" });

const svg = Buffer.from('<svg viewBox="0 0 128 96"></svg>');
assert.deepStrictEqual(parser(svg), { width: 128, height: 96, type: "svg" });
assert.deepStrictEqual(parser(Buffer.from('<svg width="80" height="40"></svg>')), { width: 80, height: 40, type: "svg" });
const tempImage = path.join(root, ".tmp-security-tooling-image.png");
fs.writeFileSync(tempImage, png);
try {
  assert.deepStrictEqual(parser(tempImage), { width: 320, height: 240, type: "png" });
} finally {
  fs.rmSync(tempImage, { force: true });
}

for (const malformed of [
  Buffer.from("icns\x00\x00\x00\x00", "binary"),
  Buffer.from("\x00\x00\x00\x00", "binary"),
  Buffer.from("RIFF\x00\x00\x00\x00WEBPVP8X", "binary"),
  Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x01]),
  Buffer.from('<svg viewBox="0 0 0 0"></svg>'),
]) {
  assert.throws(() => parser(malformed), /unsupported|invalid/);
}
assert.match(fs.readFileSync(parserPath, "utf8"), /bounded|unbounded loop|advances/);
assert.match(fs.readFileSync(runnerPath, "utf8"), /addons-linter.*image-size|image-size.*file:/s);
assert.match(fs.readFileSync(runnerPath, "utf8"), /rmSync\(temp/);

const tracked = [
  "extensions/chrome/formula.js",
  "extensions/chrome/content.js",
  "extensions/firefox/formula.js",
  "extensions/firefox/content.js",
  "extensions/chrome/features.js",
  "extensions/firefox/features.js",
  "extensions/safari/formula.js",
  "extensions/safari/content.js",
];
const before = new Map(tracked.map((file) => [file, crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex")]));
const result = spawnSync(process.execPath, [runnerPath, "lint", "--source-dir", path.join(root, "extensions", "firefox")], {
  cwd: root,
  encoding: "utf8",
  timeout: 180000,
});
assert.strictEqual(result.status, 0, result.stderr || result.stdout);
for (const [file, hash] of before) {
  const current = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
  assert.strictEqual(current, hash, `${file} changed during tooling run`);
}
console.log("Security tooling regression tests passed.");
