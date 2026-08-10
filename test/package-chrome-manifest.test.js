"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, "extensions/chrome/manifest.json"), "utf8"));
const version = sourceManifest.version;
const output = path.join(root, "dist-manifest-test");
fs.rmSync(output, { recursive: true, force: true });
try {
  execFileSync(process.execPath, ["tools/package-chrome.js", "--version", version, "--out", "dist-manifest-test"], { cwd: root, stdio: "pipe" });
  const staging = path.join(output, `neuroreader-chrome-v${version}`);
  const checksumPath = path.join(output, `neuroreader-chrome-v${version}.zip.sha256`);
  assert.ok(fs.existsSync(checksumPath), "packaged ZIP checksum exists");
  const manifest = JSON.parse(fs.readFileSync(path.join(staging, "manifest.json"), "utf8"));
  const referenced = new Set([
    manifest.background.service_worker,
    manifest.action.default_popup,
    ...manifest.content_scripts[0].js,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    "icons/neuroreader-brain.svg",
  ]);
  for (const file of referenced) assert.ok(fs.existsSync(path.join(staging, file)), `packaged manifest reference exists: ${file}`);
  assert.strictEqual(manifest.background.service_worker, "background.js");
  assert.strictEqual(manifest.action.default_popup, "popup.html");
  assert.strictEqual(manifest.content_scripts[0].js.length, 6);
  console.log("Packaged Chrome manifest references passed.");
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
