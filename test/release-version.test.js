"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extensions/chrome/manifest.json"), "utf8"));
function run(tag) {
  return spawnSync(process.execPath, ["tools/check-release-version.js", tag], { cwd: root, encoding: "utf8" });
}
const matching = run(`v${manifest.version}`);
assert.strictEqual(matching.status, 0);
assert.match(matching.stdout, /Release version verified/);
const suppliedTag = process.argv[2];
if (suppliedTag) {
  const supplied = run(suppliedTag);
  assert.strictEqual(supplied.status, 0, `supplied release tag matches manifest: ${suppliedTag}`);
}
for (const invalid of ["", "1.0.0", "v1.0.0", `v${manifest.version}-wrong`]) {
  const result = run(invalid);
  assert.notStrictEqual(result.status, 0, `rejected invalid tag ${invalid}`);
}
console.log("Release version tests passed.");
