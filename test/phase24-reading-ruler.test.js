"use strict";

const assert = require("assert");
const fs = require("fs");

const chromeContent = fs.readFileSync("extensions/chrome/content.js", "utf8");
const firefoxContent = fs.readFileSync("extensions/firefox/content.js", "utf8");
const safariContent = fs.readFileSync("extensions/safari/content.js", "utf8");
const chromeFeatures = fs.readFileSync("extensions/chrome/features.js", "utf8");
const firefoxFeatures = fs.readFileSync("extensions/firefox/features.js", "utf8");
const safariFeatures = fs.readFileSync("extensions/safari/features.js", "utf8");
const chromePopup = fs.readFileSync("extensions/chrome/popup.js", "utf8");
const firefoxPopup = fs.readFileSync("extensions/firefox/popup.js", "utf8");
const chromeHtml = fs.readFileSync("extensions/chrome/popup.html", "utf8");
const firefoxHtml = fs.readFileSync("extensions/firefox/popup.html", "utf8");

assert.strictEqual(chromeContent, firefoxContent, "Chrome and Firefox content scripts stay identical");
assert.strictEqual(chromeContent, safariContent, "Safari content script stays identical");
assert.strictEqual(chromeFeatures, firefoxFeatures, "Chrome and Firefox feature defaults stay identical");
assert.match(chromeFeatures, /ruler:false/);
assert.match(safariFeatures, /ruler:false/);
assert.strictEqual(chromePopup, firefoxPopup, "Chrome and Firefox popup logic stays identical");
assert.strictEqual(chromeHtml, firefoxHtml, "Chrome and Firefox popup markup stays identical");
assert.match(chromeHtml, /data-setting="ruler"/);
assert.match(chromeHtml, /Reading ruler/);
assert.match(chromeHtml, /Follow your pointer/);
assert.match(chromeContent, /id = "nr-reading-ruler"/);
assert.match(chromeContent, /pointer-events: none/);
assert.match(chromeContent, /requestAnimationFrame/);
assert.match(chromeContent, /mousemove/);
assert.match(chromeContent, /pointermove/);
assert.match(chromeContent, /--nr-ruler-y/);
assert.match(chromeContent, /isFinite\(numericY\)/);
assert.match(chromeContent, /applyReadingRuler\(\)/);
assert.match(chromeContent, /removeReadingRuler\(\)/);
assert.ok(!chromeContent.includes("function transform("), "content script does not redefine the formula");

console.log("Phase 24 reading-ruler tests passed.");
