"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const terser = require("terser");
const zlib = require("zlib");

const ROOT = path.join(__dirname, "..");
const SOURCE = path.join(ROOT, "extensions", "chrome");
const MINIFYABLE = ["formula.js", "content.js", "popup.js", "background.js"];
const REQUIRED = [
  "manifest.json",
  "formula.js",
  "features.js",
  "content.js",
  "reading-mode.js",
  "clipboard.js",
  "stats.js",
  "background.js",
  "popup.html",
  "popup.js",
  "styles.css",
  "library.js",
  "phase3.js",
];
const DEFAULT_VERSION = JSON.parse(fs.readFileSync(path.join(SOURCE, "manifest.json"), "utf8")).version;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const name = Buffer.from(type);
  const body = Buffer.concat([name, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  return Buffer.concat([length, body, crc]);
}

function iconPng(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const background = [17, 17, 17, 255];
  const accent = [220, 38, 38, 255];
  function set(x, y, color) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    for (let i = 0; i < 4; i++) pixels[offset + i] = color[i];
  }
  function line(x1, y1, x2, y2, width, color) {
    const minX = Math.floor(Math.min(x1, x2) - width);
    const maxX = Math.ceil(Math.max(x1, x2) + width);
    const minY = Math.floor(Math.min(y1, y2) - width);
    const maxY = Math.ceil(Math.max(y1, y2) + width);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy || 1;
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const projection = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared));
        const nearX = x1 + projection * dx;
        const nearY = y1 + projection * dy;
        if (Math.hypot(x - nearX, y - nearY) <= width) set(x, y, color);
      }
    }
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, background);
  const margin = size * 0.23;
  const top = size * 0.22;
  const bottom = size * 0.78;
  const stroke = Math.max(1, size * 0.11);
  line(margin, bottom, margin, top, stroke, accent);
  line(margin, top, size - margin, bottom, stroke, accent);
  line(size - margin, bottom, size - margin, top, stroke, accent);

  const rows = [];
  const rowSize = size * 4;
  for (let y = 0; y < size; y++) rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * rowSize, (y + 1) * rowSize)]));
  const raw = Buffer.concat(rows);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from("89504e470d0a1a0a", "hex"),
    chunk("IHDR", header),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    if (entry.name === ".DS_Store") continue;
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}

function assertSource() {
  const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, "manifest.json"), "utf8"));
  if (manifest.manifest_version !== 3) throw new Error("Chrome source must use Manifest V3");
  if (!manifest.background || manifest.background.service_worker !== "background.js") throw new Error("Chrome service worker is missing");
  for (const file of REQUIRED) {
    if (!fs.existsSync(path.join(SOURCE, file))) throw new Error(`Chrome release file is missing: ${file}`);
  }
  return manifest;
}

async function minifyFiles(target) {
  for (const file of MINIFYABLE) {
    const filePath = path.join(target, file);
    const source = fs.readFileSync(filePath, "utf8");
    const result = await terser.minify(source, {
      compress: { passes: 1, dead_code: true },
      mangle: true,
      format: { comments: /^!/ },
    });
    if (result.error) throw result.error;
    fs.writeFileSync(filePath, result.code + "\n");
  }
}

function addManifestIcons(target, version) {
  const manifestPath = path.join(target, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = version;
  manifest.icons = {
    "16": "icons/neuroreader-16.png",
    "48": "icons/neuroreader-48.png",
    "128": "icons/neuroreader-128.png",
  };
  manifest.action = Object.assign({}, manifest.action, { default_icon: manifest.icons });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  const icons = path.join(target, "icons");
  fs.mkdirSync(icons, { recursive: true });
  for (const size of [16, 48, 128]) fs.writeFileSync(path.join(icons, `neuroreader-${size}.png`), iconPng(size));
}

function writeReleaseNote(target, version, sourceHash) {
  fs.writeFileSync(path.join(target, "RELEASE-NOTES.txt"), [
    `NeuroReader Chrome extension v${version}`,
    "Public beta build. Free, private, and locally processed.",
    "Install through the Chrome Web Store when available for automatic updates.",
    "For local testing, use Chrome Extensions > Developer mode > Load unpacked.",
    `Canonical formula source SHA-256: ${sourceHash}`,
    "Page text and popup text are never sent to a NeuroReader server.",
  ].join("\n") + "\n");
}

async function main() {
  const args = process.argv.slice(2);
  const versionIndex = args.indexOf("--version");
  const outIndex = args.indexOf("--out");
  const version = versionIndex >= 0 ? args[versionIndex + 1] : DEFAULT_VERSION;
  const outRoot = path.resolve(outIndex >= 0 ? args[outIndex + 1] : path.join(ROOT, "dist"));
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid extension version: ${version}`);
  if (!outRoot.startsWith(ROOT + path.sep)) throw new Error("Release output must stay inside this repository");
  const sourceManifest = assertSource();
  const formulaHash = crypto.createHash("sha256").update(fs.readFileSync(path.join(SOURCE, "formula.js"))).digest("hex");
  const staging = path.join(outRoot, `neuroreader-chrome-v${version}`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  copyTree(SOURCE, staging);
  addManifestIcons(staging, version);
  await minifyFiles(staging);
  writeReleaseNote(staging, version, formulaHash);
  const packagedManifest = JSON.parse(fs.readFileSync(path.join(staging, "manifest.json"), "utf8"));
  if (packagedManifest.version !== version || !packagedManifest.icons["128"]) throw new Error("Packaged manifest validation failed");
  const zipPath = path.join(outRoot, `neuroreader-chrome-v${version}.zip`);
  fs.rmSync(zipPath, { force: true });
  execFileSync("zip", ["-qr", zipPath, "."], { cwd: staging, stdio: "ignore" });
  console.log(JSON.stringify({
    version,
    sourceVersion: sourceManifest.version,
    directory: path.relative(ROOT, staging),
    zip: path.relative(ROOT, zipPath),
    formulaSha256: formulaHash,
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
