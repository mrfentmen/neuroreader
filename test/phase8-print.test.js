"use strict";
const assert = require("assert");
const fs = require("fs");
const crypto = require("crypto");

const index = fs.readFileSync("index.html", "utf8");
const formula = fs.readFileSync("formula.min.js", "utf8");
const extensionFormula = fs.readFileSync("extensions/chrome/formula.js", "utf8");

assert.match(index, /id="print-btn"/);
assert.match(index, /Print reading/);
assert.match(index, /window\.print\(\)/);
assert.match(index, /@media print/);
assert.match(index, /\.output-box b \{[\s\S]*?color: #000 !important/);
assert.match(index, /print-heading/);
assert.match(index, /printBtn\.disabled = true/);
assert.match(index, /printBtn\.disabled = false/);
assert.match(index, /Transform some text before printing/);

assert.notStrictEqual(crypto.createHash("sha256").update(formula).digest("hex"), "", "shipped formula is present");
assert.ok(extensionFormula.length > 0, "canonical extension formula remains present");
assert.ok(!index.includes("function transform(text)"), "formula implementation remains outside index.html");

console.log("Phase 8 print tests passed.");
