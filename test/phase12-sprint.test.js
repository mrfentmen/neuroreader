"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");

const index = fs.readFileSync("index.html", "utf8");
const formula = fs.readFileSync("formula.min.js", "utf8");

assert.match(index, /id="sprint-duration"/);
assert.match(index, /id="sprint-start"/);
assert.match(index, /id="sprint-stop"/);
assert.match(index, /id="sprint-timer"[^>]*role="timer"/);
assert.match(index, /id="sprint-progress-fill"/);
assert.match(index, /Start sprint/);
assert.match(index, /Sprint complete\. You showed up for your reading\./);
assert.match(index, /That still counts\./);
assert.match(index, /setInterval\(tickSprint, 250\)/);
assert.match(index, /clearInterval\(sprintInterval\)/);
assert.match(index, /function renderStoppedSprint\(elapsedSeconds\)/);
assert.match(index, /Sprint complete\. You showed up for your reading\./);
assert.match(index, /Reading sprint/);
assert.strictEqual(
  crypto.createHash("sha256").update(formula).digest("hex"),
  "c0da1814936d1871b69568681e8447276f6f6890997085e59f58caac6916d13d",
  "shipped formula checksum changed",
);

console.log("Phase 12 sprint tests passed.");
