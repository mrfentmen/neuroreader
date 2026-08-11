"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const REPOSITORY_SOURCE = path.join(ROOT, "extensions", "image-vault");
const SOURCE = process.env.IMAGE_VAULT_EXTENSION_DIR || REPOSITORY_SOURCE;
const DEFAULT_VERSION = JSON.parse(fs.readFileSync(path.join(SOURCE, "manifest.json"), "utf8")).version;
const REQUIRED = ["manifest.json", "app.html", "app.css", "app.js", "README.md", "privacy.html"];

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
function crc32(buffer) { let crc = 0xffffffff; for (const byte of buffer) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const body = Buffer.concat([Buffer.from(type), data]); const length = Buffer.alloc(4); length.writeUInt32BE(data.length, 0); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0); return Buffer.concat([length, body, crc]); }
function iconPng(size) {
  const pixels = Buffer.alloc(size * size * 4); const orange = [249, 115, 22, 255]; const white = [255, 255, 255, 255];
  const set = (x, y, color) => { if (x < 0 || y < 0 || x >= size || y >= size) return; const offset = (y * size + x) * 4; color.forEach((value, index) => { pixels[offset + index] = value; }); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) set(x, y, orange);
  const stroke = Math.max(1, Math.round(size * .08)); const left = Math.round(size * .29); const right = Math.round(size * .71); const top = Math.round(size * .32); const bottom = Math.round(size * .77);
  for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) if (x < left + stroke || x > right - stroke || y < top + stroke || y > bottom - stroke) set(x, y, white);
  for (let y = Math.round(size * .22); y < top + stroke; y++) for (let x = Math.round(size * .40); x <= Math.round(size * .60); x++) if (x < Math.round(size * .40) + stroke || x > Math.round(size * .60) - stroke || y < Math.round(size * .22) + stroke) set(x, y, white);
  const rows = []; for (let y = 0; y < size; y++) rows.push(Buffer.concat([Buffer.from([0]), pixels.subarray(y * size * 4, (y + 1) * size * 4)]));
  const header = Buffer.alloc(13); header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(Buffer.concat(rows), { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}
function validate(source) {
  const manifest = JSON.parse(fs.readFileSync(path.join(source, "manifest.json"), "utf8"));
  if (manifest.manifest_version !== 3) throw new Error("Lockbox must use Manifest V3");
  if (manifest.permissions || manifest.host_permissions || manifest.content_scripts) throw new Error("Lockbox must not request permissions or host access");
  if (!manifest.action || manifest.action.default_popup !== "app.html") throw new Error("Lockbox toolbar action must use app.html as its popup");
  if (!manifest.content_security_policy) throw new Error("Lockbox CSP is missing");
  for (const file of REQUIRED) if (!fs.existsSync(path.join(source, file))) throw new Error(`Lockbox file is missing: ${file}`);
  for (const file of ["app.js"]) {
    const contents = fs.readFileSync(path.join(source, file), "utf8");
    if (/https?:\/\//i.test(contents)) throw new Error(`Unexpected remote URL in ${file}`);
  }
  return manifest;
}
function pngDimensions(filePath) { const buffer = fs.readFileSync(filePath); if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" || buffer.subarray(12, 16).toString("ascii") !== "IHDR") throw new Error("Invalid PNG icon"); return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }; }
function main() {
  const args = process.argv.slice(2); const versionAt = args.indexOf("--version"); const outAt = args.indexOf("--out");
  const version = versionAt >= 0 ? args[versionAt + 1] : DEFAULT_VERSION; const outRoot = path.resolve(outAt >= 0 ? args[outAt + 1] : path.join(ROOT, "dist"));
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) throw new Error(`Invalid Lockbox version: ${version}`);
  if (!outRoot.startsWith(ROOT + path.sep)) throw new Error("Output must stay inside this repository");
  const sourceManifest = validate(SOURCE); const staging = path.join(outRoot, `clipforge-lockbox-chrome-v${version}`); const zipPath = path.join(outRoot, `clipforge-lockbox-chrome-v${version}.zip`);
  fs.rmSync(staging, { recursive: true, force: true }); fs.rmSync(zipPath, { force: true }); fs.mkdirSync(outRoot, { recursive: true }); copyTree(SOURCE, staging);
  fs.mkdirSync(path.join(staging, "icons"), { recursive: true });
  for (const size of [16, 48, 128]) { const iconPath = path.join(staging, "icons", `clipforge-lockbox-${size}.png`); fs.writeFileSync(iconPath, iconPng(size)); const dimensions = pngDimensions(iconPath); if (dimensions.width !== size || dimensions.height !== size) throw new Error(`Generated icon dimensions are wrong for ${size}px`); }
  const manifestPath = path.join(staging, "manifest.json"); const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  manifest.version = version; manifest.icons = { "16": "icons/clipforge-lockbox-16.png", "48": "icons/clipforge-lockbox-48.png", "128": "icons/clipforge-lockbox-128.png" }; manifest.action = Object.assign({}, manifest.action, { default_icon: manifest.icons });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n"); execFileSync("zip", ["-qr", zipPath, "."], { cwd: staging, stdio: "ignore" });
  const sha256 = crypto.createHash("sha256").update(fs.readFileSync(zipPath)).digest("hex"); fs.writeFileSync(zipPath + ".sha256", `${sha256}  ${path.basename(zipPath)}\n`);
  console.log(JSON.stringify({ version, sourceVersion: sourceManifest.version, staging: path.relative(ROOT, staging), zip: path.relative(ROOT, zipPath), sha256 }, null, 2));
}
try { main(); } catch (error) { console.error(error.message || error); process.exit(1); }
