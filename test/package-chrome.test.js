"use strict";
const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const sourceManifest = JSON.parse(fs.readFileSync(path.join(root, "extensions/chrome/manifest.json"), "utf8"));
const version = sourceManifest.version;
const formula = path.join(root, "extensions/chrome/formula.js");
const before = crypto.createHash("sha256").update(fs.readFileSync(formula)).digest("hex");
const output = path.join(root, "dist-test");
fs.rmSync(output, { recursive: true, force: true });
try {
  const result = execFileSync(process.execPath, ["tools/package-chrome.js", "--version", version, "--out", "dist-test"], { cwd: root, encoding: "utf8" });
  const info = JSON.parse(result);
  const staging = path.join(root, info.directory);
  const zip = path.join(root, info.zip);
  const manifest = JSON.parse(fs.readFileSync(path.join(staging, "manifest.json"), "utf8"));

  assert.strictEqual(manifest.manifest_version, 3);
  assert.strictEqual(manifest.version, version);
  assert.deepStrictEqual(manifest.icons, {
    "16": "icons/neuroreader-16.png",
    "48": "icons/neuroreader-48.png",
    "128": "icons/neuroreader-128.png",
  });
  assert.deepStrictEqual(manifest.action.default_icon, manifest.icons);
  for (const size of [16, 48, 128]) {
    const icon = fs.readFileSync(path.join(staging, `icons/neuroreader-${size}.png`));
    assert.deepStrictEqual(icon.subarray(0, 8), Buffer.from("89504e470d0a1a0a", "hex"));
    assert.strictEqual(icon.readUInt32BE(16), size);
    assert.strictEqual(icon.readUInt32BE(20), size);
  }
  assert.ok(fs.statSync(zip).size > 1000, "release ZIP is non-empty");
  assert.match(fs.readFileSync(path.join(staging, "RELEASE-NOTES.txt"), "utf8"), /Public beta build/);
  assert.strictEqual(crypto.createHash("sha256").update(fs.readFileSync(formula)).digest("hex"), before, "packaging changed canonical formula");
  assert.strictEqual(info.formulaSha256, before);
  console.log("Chrome release packaging tests passed.");
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
