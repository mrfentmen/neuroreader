"use strict";

const assert = require("assert");
const crypto = require("crypto");
const fs = require("fs");

const index = fs.readFileSync("index.html", "utf8");
const privacy = fs.readFileSync("privacy.html", "utf8");
const formula = fs.readFileSync("formula.min.js", "utf8");
const canonical = fs.readFileSync("extensions/chrome/formula.js", "utf8");

assert.match(index, /id="library-export"/);
assert.match(index, /id="library-import-trigger"/);
assert.match(index, /id="library-import"/);
assert.match(index, /accept="application\/json,\.json"/);
assert.match(index, /neuroreader-saved-readings\.json/);
assert.match(index, /version: 1/);
assert.match(index, /FileReader/);
assert.match(index, /file\.size > 2000000/);
assert.match(index, /Could not import that file/);
assert.match(index, /Choose a NeuroReader saved-readings JSON file/);
assert.match(index, /imported\.length > libraryMaxItems \* 4/);
assert.match(index, /typeof item\.text !== "string"/);
assert.match(index, /not imported to stay within local storage limits/);
assert.match(privacy, /Exporting saved/);
assert.match(index, /seen\[text\]/);
assert.strictEqual(
  crypto.createHash("sha256").update(formula).digest("hex"),
  "c0da1814936d1871b69568681e8447276f6f6890997085e59f58caac6916d13d",
  "shipped formula checksum changed",
);
assert.strictEqual(
  crypto.createHash("sha256").update(canonical).digest("hex"),
  "73c92fd092fa1d365c6391b70d8cd541a68287e4b9ae848fc5ef061739cd3549",
  "canonical formula checksum changed",
);

console.log("Phase 11 saved-reading transfer tests passed.");
