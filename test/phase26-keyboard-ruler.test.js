"use strict";

const assert = require("assert");
const fs = require("fs");

const read = (file) => fs.readFileSync(file, "utf8");
const chromeContent = read("extensions/chrome/content.js");
const firefoxContent = read("extensions/firefox/content.js");
const safariContent = read("extensions/safari/content.js");
const chromeHtml = read("extensions/chrome/popup.html");
const firefoxHtml = read("extensions/firefox/popup.html");
const safariHtml = read("extensions/safari/popup.html");

assert.strictEqual(chromeContent, firefoxContent, "Chrome and Firefox content scripts stay identical");
assert.strictEqual(chromeContent, safariContent, "Safari content script stays identical");
assert.strictEqual(chromeHtml, firefoxHtml, "Chrome and Firefox popup markup stays identical");
assert.match(chromeHtml, /data-setting="ruler"/);
assert.match(chromeHtml, /hold Alt and use arrow keys/);
assert.match(safariHtml, /data-setting="ruler"/);
assert.match(safariHtml, /hold Alt and use arrow keys/);
assert.match(chromeContent, /function isRulerKeyboardTarget/);
assert.match(chromeContent, /function moveRulerByKeyboard/);
assert.match(chromeContent, /function handleRulerKeydown/);
assert.match(chromeContent, /var rulerDocument = null/);
assert.match(chromeContent, /var owner = rulerDocument \|\| document/);
assert.match(chromeContent, /event\.altKey/);
assert.match(chromeContent, /key === "ArrowUp"/);
assert.match(chromeContent, /key === "ArrowDown"/);
assert.match(chromeContent, /key === "PageUp"/);
assert.match(chromeContent, /key === "PageDown"/);
assert.match(chromeContent, /key === "Home"/);
assert.match(chromeContent, /key === "End"/);
assert.match(chromeContent, /key === "PageUp"/);
assert.match(chromeContent, /key === "PageDown"/);
assert.match(chromeContent, /rulerDocument\.addEventListener\("keydown", handleRulerKeydown, true\)/);
assert.match(chromeContent, /owner\.removeEventListener\("keydown", handleRulerKeydown, true\)/);
assert.match(chromeContent, /input,textarea,select,button/);
assert.ok(!chromeContent.includes("function transform("), "content script does not redefine the protected formula");
const firefoxDom = read("test/firefox-dom.e2e.js");
assert.match(firefoxDom, /Firefox keyboard ruler starts centered/);
assert.match(firefoxDom, /Firefox Alt\+ArrowDown moves the ruler/);

console.log("Phase 26 keyboard-ruler tests passed.");
