"use strict";

const assert = require("assert");
const fs = require("fs");

const read = (file) => fs.readFileSync(file, "utf8");
const chromeFeatures = read("extensions/chrome/features.js");
const firefoxFeatures = read("extensions/firefox/features.js");
const safariFeatures = read("extensions/safari/features.js");
const chromeContent = read("extensions/chrome/content.js");
const firefoxContent = read("extensions/firefox/content.js");
const safariContent = read("extensions/safari/content.js");
const chromePopup = read("extensions/chrome/popup.js");
const firefoxPopup = read("extensions/firefox/popup.js");
const safariPopup = read("extensions/safari/popup.js");
const chromeHtml = read("extensions/chrome/popup.html");
const firefoxHtml = read("extensions/firefox/popup.html");
const safariHtml = read("extensions/safari/popup.html");
const chromeStyles = read("extensions/chrome/styles.css");
const firefoxStyles = read("extensions/firefox/styles.css");
const safariStyles = read("extensions/safari/styles.css");

assert.strictEqual(chromeFeatures, firefoxFeatures, "Chrome and Firefox feature normalization stays identical");
assert.strictEqual(chromeContent, firefoxContent, "Chrome and Firefox content stays identical");
assert.strictEqual(chromeContent, safariContent, "Safari content stays identical");
assert.strictEqual(chromePopup, firefoxPopup, "Chrome and Firefox popup logic stays identical");
assert.strictEqual(chromeHtml, firefoxHtml, "Chrome and Firefox popup markup stays identical");
assert.match(safariHtml, /id="nr-ruler-size" type="range" min="2" max="14"/);
assert.match(safariHtml, /id="nr-ruler-dim" type="range" min="0" max="70"/);
assert.strictEqual(chromeStyles, firefoxStyles, "Chrome and Firefox popup styling stays identical");
assert.match(safariStyles, /\.pp-range/);

assert.match(chromeFeatures, /rulerSize:6/);
assert.match(chromeFeatures, /rulerDim:28/);
assert.match(chromeFeatures, /Math\.max\(2, Math\.min\(14/);
assert.match(chromeFeatures, /Math\.max\(0, Math\.min\(70/);
assert.match(chromeFeatures, /isFinite\(rulerDim\)/);
assert.match(chromeContent, /updateRulerStyle/);
assert.match(chromeContent, /featureSettings\.rulerSize/);
assert.match(chromeContent, /featureSettings\.rulerDim/);
assert.match(chromeContent, /--nr-ruler-half/);
assert.match(chromeContent, /--nr-ruler-dim/);
assert.match(chromePopup, /type === "range" \? Number\(this\.value\)/);
assert.match(chromeHtml, /id="nr-ruler-size" type="range" min="2" max="14"/);
assert.match(chromeHtml, /id="nr-ruler-dim" type="range" min="0" max="70"/);
assert.match(chromeStyles, /\.pp-range/);
assert.ok(!chromeContent.includes("function transform("), "formula implementation is not duplicated");

console.log("Phase 25 ruler-control tests passed.");
