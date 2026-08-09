"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const workflows = [
  ".github/workflows/test.yml",
  ".github/workflows/release-chrome.yml",
];
const testWorkflow = fs.readFileSync(path.join(root, workflows[0]), "utf8");
const releaseWorkflow = fs.readFileSync(path.join(root, workflows[1]), "utf8");

assert.match(testWorkflow, /permissions:\s+contents:\s+read/);
assert(!/^\s+contents:\s+write/m.test(testWorkflow), "test workflow must not grant repository write access");
assert.match(testWorkflow, /concurrency:\s+group:\s+neuroreader-tests-/);
assert.match(testWorkflow, /cancel-in-progress:\s+true/);
assert.match(releaseWorkflow, /permissions:\s+contents:\s+write/);
assert.match(releaseWorkflow, /concurrency:\s+group:\s+neuroreader-release-/);
assert.match(releaseWorkflow, /cancel-in-progress:\s+false/);

for (const file of workflows) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const references = [...source.matchAll(/uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)/g)];
  assert.ok(references.length > 0, `${file} contains pinned actions`);
  for (const [, action, ref] of references) {
    assert.match(ref, /^[0-9a-f]{40}$/i, `${file} pins ${action} to an immutable commit SHA`);
  }
}

console.log("CI hardening tests passed.");
