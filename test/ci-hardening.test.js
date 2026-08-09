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
const securityPolicy = fs.readFileSync(path.join(root, "SECURITY.md"), "utf8");
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const nvmrc = fs.readFileSync(path.join(root, ".nvmrc"), "utf8").trim();

assert.strictEqual(nvmrc, "20", "local Node major is pinned");
assert.strictEqual(packageJson.engines.node, ">=20 <21", "package Node engine is bounded");
assert.strictEqual(packageJson.engines.npm, ">=10 <11", "package npm engine is bounded");
assert.strictEqual(packageJson.packageManager, "npm@10.8.2", "package manager version is pinned");
assert.match(testWorkflow, /node-version-file: \.nvmrc/, "test workflow uses the repository Node pin");
assert.strictEqual((testWorkflow.match(/npm install --global npm@10\.8\.2 --ignore-scripts && test "\$\(npm --version\)" = "10\.8\.2"/g) || []).length, 4, "test jobs verify the pinned npm version");
assert.match(releaseWorkflow, /node-version-file: \.nvmrc/, "release workflow uses the repository Node pin");
assert.match(releaseWorkflow, /npm install --global npm@10\.8\.2 --ignore-scripts && test "\$\(npm --version\)" = "10\.8\.2"/, "release verifies the pinned npm version");
assert.match(securityPolicy, /Private Vulnerability Reporting/i, "security policy directs reports to a private channel");
assert.match(securityPolicy, /do \*\*not\*\* open a public GitHub issue/i, "security policy discourages public vulnerability disclosure");
assert.match(testWorkflow, /permissions:\s+contents:\s+read/);
assert.strictEqual((testWorkflow.match(/run: npm ci --ignore-scripts/g) || []).length, 4, "every dependency install in the test workflow disables lifecycle scripts");
assert.match(testWorkflow, /name: Audit locked dependencies\n\s+run: npm audit --audit-level=high/, "test workflow audits locked dependencies");
assert(!/^\s+run: npm ci\s*$/m.test(testWorkflow), "test workflow must not use an unguarded npm ci");
assert(!/^\s+contents:\s+write/m.test(testWorkflow), "test workflow must not grant repository write access");
assert.match(testWorkflow, /concurrency:\s+group:\s+neuroreader-tests-/);
assert.match(testWorkflow, /cancel-in-progress:\s+true/);
const testJobs = [
  ["test", 10],
  ["adaptive-pages", 15],
  ["firefox-extension", 35],
  ["firefox-dom", 25],
  ["chrome", 45],
];
for (let index = 0; index < testJobs.length; index++) {
  const [job, minutes] = testJobs[index];
  const nextJob = index + 1 < testJobs.length ? testJobs[index + 1][0] : "";
  const jobSource = testWorkflow.split(`\n  ${job}:`, 2)[1];
  const block = nextJob ? jobSource.split(`\n  ${nextJob}:`, 2)[0] : jobSource;
  assert.match(block, new RegExp(`\\n    timeout-minutes: ${minutes}\\n`), `${job} timeout is bounded`);
}
assert.match(releaseWorkflow, /permissions:\s+contents:\s+write/);
assert.match(releaseWorkflow, /run: npm ci --ignore-scripts/, "release dependency install disables lifecycle scripts");
assert.match(releaseWorkflow, /name: Audit locked dependencies\n\s+run: npm audit --audit-level=high/, "release workflow audits locked dependencies");
assert.match(releaseWorkflow, /dist\/neuroreader-chrome-v\*\.zip\.sha256/, "release publishes the ZIP checksum sidecar");
assert(!/^\s+run: npm ci\s*$/m.test(releaseWorkflow), "release workflow must not use an unguarded npm ci");
assert.match(releaseWorkflow, /concurrency:\s+group:\s+neuroreader-release-/);
assert.match(releaseWorkflow, /cancel-in-progress:\s+false/);
const releaseBlock = releaseWorkflow.split("\n  release-chrome:", 2)[1];
assert.match(releaseBlock, /\n    timeout-minutes: 45\n/, "release timeout is bounded");

for (const file of workflows) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const references = [...source.matchAll(/uses:\s*([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)@([^\s#]+)/g)];
  assert.ok(references.length > 0, `${file} contains pinned actions`);
  for (const [, action, ref] of references) {
    assert.match(ref, /^[0-9a-f]{40}$/i, `${file} pins ${action} to an immutable commit SHA`);
  }
}

console.log("CI hardening tests passed.");
