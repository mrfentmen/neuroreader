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

assert.strictEqual(chromeFeatures, firefoxFeatures, "Chrome and Firefox feature normalization stays identical");
assert.strictEqual(chromeContent, firefoxContent, "Chrome and Firefox content scripts stay identical");
assert.strictEqual(chromeContent, safariContent, "Chrome and Safari content scripts stay identical");
assert.strictEqual(chromePopup, firefoxPopup, "Chrome and Firefox popup logic stays identical");
assert.strictEqual(chromeHtml, firefoxHtml, "Chrome and Firefox popup markup stays identical");
assert.match(chromeFeatures, /textScale:1/);
assert.match(chromeFeatures, /out\.textScale = Math\.max\(0\.85, Math\.min\(1\.5/);
assert.match(safariFeatures, /textScale:1/);
assert.match(chromeContent, /nr-text-scale-active/);
assert.match(chromeContent, /--nr-text-scale/);
assert.match(chromeContent, /applyTextScale/);
assert.match(chromeContent, /appliedValue/);
assert.doesNotMatch(chromeContent, /data-nr-text-scale/);
assert.match(chromeContent, /font-size.*important/);
assert.match(chromeContent, /function collectTextScaleNodes/);
assert.match(chromePopup, /textScale: featureSettings\.textScale/);
assert.match(firefoxPopup, /textScale: featureSettings\.textScale/);
assert.match(safariPopup, /textScale/);
assert.match(chromeHtml, /data-setting="textScale"/);
assert.match(chromeHtml, /Text size/);
assert.match(safariHtml, /data-setting="textScale"/);
assert.ok(!chromeContent.includes("function transform("), "content script does not redefine the protected formula");

console.log("Phase 30 text-scale tests passed.");
