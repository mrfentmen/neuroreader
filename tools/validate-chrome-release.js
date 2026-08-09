"use strict";

const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const extension = path.join(root, "extensions", "chrome");
const manifestPath = process.env.NR_CHROME_MANIFEST
  ? path.resolve(root, process.env.NR_CHROME_MANIFEST)
  : path.join(extension, "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
const errors = [];
const requiredPermissions = new Set(["storage", "activeTab", "tabs", "contextMenus"]);
const allowedPermissions = new Set(requiredPermissions);
const requiredFiles = [
  "background.js",
  "clipboard.js",
  "content.js",
  "features.js",
  "formula.js",
  "library.js",
  "manifest.json",
  "phase3.js",
  "popup.html",
  "popup.js",
  "reading-mode.js",
  "stats.js",
  "styles.css",
];

function fail(message) { errors.push(message); }
function exists(file) { return fs.existsSync(path.join(extension, file)); }
function isVersion(value) { return /^\d+\.\d+\.\d+$/.test(String(value || "")); }

if (manifest.manifest_version !== 3) fail("Chrome extension must use Manifest V3");
if (manifest.name !== "NeuroReader") fail("Chrome manifest name must remain NeuroReader");
if (!isVersion(manifest.version)) fail(`Chrome Web Store version must be stable semver, received ${manifest.version}`);
if (!manifest.background || manifest.background.service_worker !== "background.js") fail("background service worker must be background.js");
if (!manifest.action || manifest.action.default_popup !== "popup.html") fail("action popup must be popup.html");
if (!manifest.action.default_title) fail("action default_title is required");
if (!manifest.commands || !manifest.commands["nr-toggle-page"] || !manifest.commands["nr-reading-mode"]) fail("both keyboard commands are required");
if (!Array.isArray(manifest.permissions)) fail("permissions must be an array");
for (const permission of manifest.permissions || []) {
  if (!allowedPermissions.has(permission)) fail(`unexpected permission: ${permission}`);
}
for (const permission of requiredPermissions) {
  if (!manifest.permissions.includes(permission)) fail(`required permission missing: ${permission}`);
}
if (!Array.isArray(manifest.content_scripts) || manifest.content_scripts.length !== 1) fail("exactly one content_scripts block is required");
const content = manifest.content_scripts && manifest.content_scripts[0];
if (!content || JSON.stringify(content.matches) !== JSON.stringify(["<all_urls>"])) fail("content script must explicitly document <all_urls> coverage");
const expectedScripts = ["formula.js", "features.js", "content.js", "reading-mode.js", "clipboard.js", "stats.js"];
if (!content || JSON.stringify(content.js) !== JSON.stringify(expectedScripts)) fail("content script order or files changed");
for (const file of requiredFiles) if (!exists(file)) fail(`required extension file missing: ${file}`);
const runtimeFiles = fs.readdirSync(extension).filter((file) => file.endsWith(".js"));
for (const source of runtimeFiles) {
  const text = fs.readFileSync(path.join(extension, source), "utf8");
  const urls = text.match(/https?:\/\/[^"'\s)]+/gi) || [];
  for (const url of urls) {
    // The private feedback handoff intentionally opens one blank GitHub issue
    // draft. It never includes page text or report contents in the URL; every
    // other runtime URL remains a release blocker.
    if (source === "popup.js" && url === "https://github.com/mrfentmen/neuroreader/issues/new?labels=bug,beta&title=NeuroReader%20beta%20issue") continue;
    fail(`${source} contains an unapproved network URL`);
  }
  if (/\b(?:fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/.test(text)) fail(`${source} contains a network API`);
}
const listing = fs.readFileSync(path.join(root, "STORE-LISTING.md"), "utf8");
for (const phrase of ["does not collect", "never sent", "activeTab", "storage", "Chrome Web Store"]) {
  if (!listing.toLowerCase().includes(phrase.toLowerCase())) fail(`store listing privacy disclosure missing: ${phrase}`);
}
if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}
console.log(`Chrome release validation passed for v${manifest.version}.`);
