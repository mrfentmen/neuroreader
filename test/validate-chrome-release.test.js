"use strict";
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const manifestPath = path.join(root, "extensions/chrome/manifest.json");
const original = fs.readFileSync(manifestPath, "utf8");
function run(env) {
  return spawnSync(process.execPath, ["tools/validate-chrome-release.js"], { cwd: root, env: Object.assign({}, process.env, env || {}), encoding: "utf8" });
}
const valid = run();
assert.strictEqual(valid.status, 0, valid.stderr || valid.stdout);
assert.match(valid.stdout, /Chrome release validation passed/);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "nr-manifest-"));
try {
  const invalid = JSON.parse(original);
  invalid.version = "0.1.1-beta.1";
  const invalidPath = path.join(temp, "manifest.json");
  fs.writeFileSync(invalidPath, JSON.stringify(invalid));
  const rejected = run({ NR_CHROME_MANIFEST: invalidPath });
  assert.notStrictEqual(rejected.status, 0);
  assert.match(rejected.stderr, /stable semver/);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}
assert.strictEqual(fs.readFileSync(manifestPath, "utf8"), original);
console.log("Chrome release validator tests passed.");
