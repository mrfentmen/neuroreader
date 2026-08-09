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
assert.match(chromeFeatures, /rulerLock:false/);
assert.match(chromeFeatures, /out\.rulerLock = out\.rulerLock === true/);
assert.match(safariFeatures, /rulerLock:false/);
assert.match(chromeContent, /featureSettings\.rulerLock/);
assert.match(chromeContent, /function scheduleRulerPosition/);
assert.match(chromeContent, /function scheduleFrameRulerPosition/);
assert.match(chromeContent, /if \(featureSettings\.rulerLock\) return/);
assert.match(chromeContent, /nr-ruler-pointer[\s\S]{0,120}featureSettings\.rulerLock/);
assert.match(chromeContent, /function scheduleFrameRulerPosition[\s\S]{0,180}featureSettings\.rulerLock/);
assert.match(chromeContent, /rulerLock: false/);
assert.match(chromeHtml, /data-setting="rulerLock"/);
assert.match(chromeHtml, /Lock ruler to keyboard/);
assert.match(safariHtml, /data-setting="rulerLock"/);
assert.match(chromePopup, /rulerLock:false/);
assert.match(chromePopup, /rulerLock: featureSettings\.rulerLock/);
assert.match(firefoxPopup, /rulerLock: featureSettings\.rulerLock/);
assert.ok(!chromeContent.includes("function transform("), "content script does not redefine the protected formula");

console.log("Phase 27 ruler-lock tests passed.");
