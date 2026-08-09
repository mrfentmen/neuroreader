"use strict";

const assert = require("assert");
const fs = require("fs");

const manifest = JSON.parse(fs.readFileSync("manifest.webmanifest", "utf8"));
const serviceWorker = fs.readFileSync("sw.js", "utf8");
const index = fs.readFileSync("index.html", "utf8");

assert.strictEqual(manifest.name, "NeuroReader — Read like your brain works");
assert.strictEqual(manifest.short_name, "NeuroReader");
assert.strictEqual(manifest.start_url, "./index.html");
assert.strictEqual(manifest.scope, "./");
assert.strictEqual(manifest.display, "standalone");
assert.strictEqual(manifest.id, "./");
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2);
manifest.icons.forEach((icon) => {
  assert.ok(icon.src.startsWith("icons/"));
  assert.ok(fs.existsSync(icon.src), "missing PWA icon: " + icon.src);
  assert.ok(icon.sizes && icon.type);
});
assert.ok(manifest.share_target && manifest.share_target.action === "./index.html");

assert.match(serviceWorker, /const CACHE_NAME = "neuroreader-static-v2"/);
assert.match(serviceWorker, /"\.\/index\.html"/);
assert.match(serviceWorker, /"\.\/accessibility\.html"/);
assert.match(serviceWorker, /request\.mode === "navigate"/);
assert.match(serviceWorker, /url\.origin !== self\.location\.origin/);
assert.match(serviceWorker, /caches\.match\("\.\/index\.html"\)/);
assert.ok(!/catch\(\(\) => caches\.match\("\.\/index\.html"\)\)/.test(serviceWorker), "asset failures must not receive HTML");

assert.match(index, /rel="manifest" href="manifest\.webmanifest"/);
assert.match(index, /id="install-app"/);
assert.match(index, /id="offline-status"/);
assert.match(index, /beforeinstallprompt/);
assert.match(index, /navigator\.serviceWorker\.register\("sw\.js"\)/);
assert.match(index, /navigator\.onLine/);
assert.match(index, /Promise\.resolve\(pendingInstall\.prompt\(\)\)/);
assert.match(index, /Installation was cancelled/);
assert.match(index, /Offline installation is unavailable on this site/);

console.log("Phase 10 PWA tests passed.");
