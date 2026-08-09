"use strict";

const assert = require("assert");
const fs = require("fs");

const index = fs.readFileSync("index.html", "utf8");
const formula = fs.readFileSync("formula.min.js", "utf8");

assert.match(index, /id="queue-list"/);
assert.match(index, /id="queue-clear"/);
assert.match(index, /neuroreader-web-queue/);
assert.match(index, /function queueRead\(\)/);
assert.match(index, /function queueWrite\(ids\)/);
assert.match(index, /function renderQueue\(\)/);
assert.match(index, /function addToQueue\(item\)/);
assert.match(index, /Move .* earlier in queue/);
assert.match(index, /Move .* later in queue/);
assert.match(index, /Reading queue cleared on this device/);
assert.ok(formula.length > 100, "the shipped formula remains present");
assert.ok(!index.includes("function transform(text)"), "queue UI does not redefine the formula");

console.log("Phase 15 queue tests passed.");
