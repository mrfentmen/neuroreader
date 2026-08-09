"use strict";

const assert = require("assert");
const fs = require("fs");

const index = fs.readFileSync("index.html", "utf8");
const features = fs.readFileSync("features.js", "utf8");

assert.match(index, /id="setting-spotlight"/);
assert.match(index, /id="setting-ruler"/);
assert.match(index, /className = "nr-reading-ruler"/);
assert.match(index, /event\.key === "ArrowDown"/);
assert.match(index, /event\.key === "ArrowUp"/);
assert.match(index, /scrollIntoView/);
assert.match(index, /readingRuler\.hidden = false/);
assert.match(index, /readingRuler\.hidden = true/);
assert.match(features, /ruler: false/);
assert.ok(!index.includes("<script>\n      function transform"), "the protected formula is not redefined by the spotlight UI");

console.log("Phase 14 spotlight wiring tests passed.");
