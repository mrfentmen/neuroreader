"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const workflows = [
  ".github/workflows/test.yml",
  ".github/workflows/release-chrome.yml",
];
const expected = {
  "actions/checkout": "11d5960a326750d5838078e36cf38b85af677262",
  "actions/setup-node": "49933ea5288caeca8642d1e84afbd3f7d6820020",
  "softprops/action-gh-release": "3bb12739c298aeb8a4eeaf626c5b8d85266b0e65",
};

for (const file of workflows) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  for (const [action, sha] of Object.entries(expected)) {
    if (!source.includes(action)) continue;
    assert.match(source, new RegExp(`${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}@${sha}(?:\\s|#|$)`), `${file} pins ${action}`);
    assert(!new RegExp(`${action.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}@v\\d`).test(source), `${file} must not use mutable ${action} tags`);
  }
}

console.log("CI hardening tests passed.");
