"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REPOSITORY_SOURCE = path.join(ROOT, "extensions", "video-compressor");
const SOURCE = process.env.CLIPFORGE_EXTENSION_DIR || REPOSITORY_SOURCE;
const DEFAULT_VERSION = JSON.parse(fs.readFileSync(path.join(SOURCE, "manifest.json"), "utf8")).version;
const REQUIRED = ["manifest.json", "app.html", "app.css", "app.js", "README.md", "privacy.html", "branding/clipforge-icon.svg"];

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === ".DS_Store" || entry.name === "Screenshots") continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else fs.copyFileSync(source, target);
  }
}

function iconPng(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const orange = [249, 115, 22, 255];
  const light = [255, 255, 255, 255];
  const set = (x, y, color) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const offset = (y * size + x) * 4;
    color.forEach((value, index) => { pixels[offset + index] = value; });
  };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, orange);
  const bars = [[.28, .32, .14], [.50, .20, .32], [.72, .27, .23]];
  for (const [x, top, height] of bars) for (let y = top * size; y < (top + height) * size; y++) for (let dx = -size * .035; dx <= size * .035; dx++) set(Math.round(x * size + dx), Math.round(y), light);
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4)]));
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  const crc32 = (buffer) => { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const length = Buffer.alloc(4); length.writeUInt32BE(data.length, 0); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0); return Buffer.concat([length, body, crc]); };
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", require("zlib").deflateSync(Buffer.concat(rows), { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

function pngDimensions(filePath) {
  const buffer = fs.readFileSync(filePath);
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || buffer.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error(`Invalid PNG icon: ${filePath}`);
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function validate(source) {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, "manifest.json"), "utf8"));
  if (manifest.manifest_version !== 3) throw new Error("ClipForge must use Manifest V3");
  if (manifest.permissions.some((permission) => permission !== "storage")) throw new Error("ClipForge has an unexpected permission");
  if (manifest.host_permissions || manifest.content_scripts) throw new Error("ClipForge must not request host access");
  if (!manifest.action || manifest.action.default_popup !== "app.html") throw new Error("ClipForge toolbar action must use app.html as its popup");
  for (const file of REQUIRED) if (!fs.existsSync(path.join(source, file))) throw new Error(`ClipForge file is missing: ${file}`);
  const files = [];
  function collectFiles(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filePath = path.join(directory, entry.name);
      if (entry.isDirectory()) collectFiles(filePath);
      else files.push(filePath);
    }
  }
  collectFiles(source);
  for (const filePath of files) {
    const file = path.relative(source, filePath);

    if (/\.(png|svg)$/i.test(file)) continue;
    const contents = fs.readFileSync(filePath, "utf8");
    if (/https?:\/\/(?!www\.buymeacoffee\.com\/contactae2b)/i.test(contents) && file !== "README.md") throw new Error(`Unexpected remote URL in ${file}`);
  }
  return manifest;
}

function main() {
  const args = process.argv.slice(2);
  const versionAt = args.indexOf("--version");
  const outAt = args.indexOf("--out");
  const version = versionAt >= 0 ? args[versionAt + 1] : DEFAULT_VERSION;
  const outRoot = path.resolve(outAt >= 0 ? args[outAt + 1] : path.join(ROOT, "dist"));
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid ClipForge version: ${version}`);
  if (!outRoot.startsWith(ROOT + path.sep)) throw new Error("Output must stay inside this repository");
  const sourceManifest = validate(SOURCE);
  const staging = path.join(outRoot, `clipforge-chrome-v${version}`);
  const zipPath = path.join(outRoot, `clipforge-chrome-v${version}.zip`);
  fs.rmSync(staging, { recursive: true, force: true });
  fs.rmSync(zipPath, { force: true });
  fs.mkdirSync(outRoot, { recursive: true });
  copyTree(SOURCE, staging);
  fs.mkdirSync(path.join(staging, "icons"), { recursive: true });
  for (const size of [16, 48, 128]) {
    const iconPath = path.join(staging, "icons", `clipforge-${size}.png`);
    fs.writeFileSync(iconPath, iconPng(size));
    const dimensions = pngDimensions(iconPath);
    if (dimensions.width !== size || dimensions.height !== size) throw new Error(`Generated icon dimensions are wrong for ${size}px`);
  }
  const manifestPath = path.join(staging, "manifest.json");
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = version;
  manifest.icons = { "16": "icons/clipforge-16.png", "48": "icons/clipforge-48.png", "128": "icons/clipforge-128.png" };
  manifest.action = Object.assign({}, manifest.action, { default_icon: manifest.icons });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  execFileSync("zip", ["-qr", zipPath, "."], { cwd: staging, stdio: "ignore" });
  const sha = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex");
  fs.writeFileSync(zipPath + ".sha256", `${sha}  ${path.basename(zipPath)}\n`);
  console.log(JSON.stringify({ version, sourceVersion: sourceManifest.version, staging: path.relative(ROOT, staging), zip: path.relative(ROOT, zipPath), sha256: sha }, null, 2));
}

try { main(); } catch (error) { console.error(error.message || error); process.exit(1); }
