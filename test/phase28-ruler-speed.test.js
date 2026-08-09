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
assert.match(chromeFeatures, /rulerStep:8/);
assert.match(chromeFeatures, /out\.rulerStep = Math\.max\(2, Math\.min\(20, Number\(out\.rulerStep\) \|\| DEFAULTS\.rulerStep\)\)/);
assert.match(safariFeatures, /rulerStep:8/);
assert.match(chromeContent, /rulerStep: 8/);
assert.match(chromeContent, /Number\(featureSettings\.rulerStep\) \|\| 8/);
assert.match(chromeContent, /height \* rulerStep \/ 100/);
assert.strictEqual((chromePopup.match(/rulerStep: featureSettings\.rulerStep/g) || []).length, 2, "Chrome preserves movement speed in profile and preset flows");
assert.strictEqual((firefoxPopup.match(/rulerStep: featureSettings\.rulerStep/g) || []).length, 2, "Firefox preserves movement speed in profile and preset flows");
assert.match(chromeHtml, /data-setting="rulerStep"/);
assert.match(chromeHtml, /Keyboard movement/);
assert.match(safariHtml, /data-setting="rulerStep"/);
assert.ok(!chromeContent.includes("function transform("), "content script does not redefine the protected formula");

console.log("Phase 28 ruler-speed tests passed.");
