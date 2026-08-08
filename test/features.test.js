"use strict";
const assert = require("assert");
const features = require("../features.js");
const api = require("../api/neuroreader-api.js");

const canonical = '<b>He</b>llo <b>w</b>orld<b>.</b> <b>Next</b>!';
const plain = (html) => features.plainText(html);

assert.strictEqual(features.decorateHtml(canonical, {}), canonical);
const gradient = features.decorateHtml(canonical, { gradient: true, color: "#dc2626" });
assert.ok((gradient.match(/data-nr-fixation/g) || []).length >= 3);
assert.ok(gradient.includes("linear-gradient"));
assert.strictEqual(plain(gradient), plain(canonical));

const complexity = features.decorateHtml('<b>A</b>bc <b>Medium</b> <b>Longwo</b>rdhere', { complexity: true });
assert.ok(complexity.includes("#dc2626"));
assert.ok(complexity.includes("#2563eb"));
assert.ok(complexity.includes("#16a34a"));

const sentenceSource = '<b>F</b><b>i</b>rst <b>w</b><b>o</b><b>r</b>d<b>.</b> <b>N</b><b>e</b>xt <b>w</b><b>o</b><b>r</b>d<b>!</b>';
const sentence = features.decorateHtml(sentenceSource, { sentence: true });
assert.ok(sentence.includes("#16a34a"));
assert.ok(sentence.includes("#2563eb"));
assert.strictEqual(plain(sentence), "First word. Next word!");

const rainbow = features.decorateHtml('<b>Pneu</b>mono <b>word</b>', { rainbowWords: true, gradient: true });
assert.ok(rainbow.includes("#dc2626"));
assert.ok(rainbow.includes("#ea580c"));
assert.ok(rainbow.includes('data-nr-gradient="1"'));
assert.strictEqual(plain(rainbow), "Pneumono word");

const apiHtml = api.transform("Hello, world!", { gradient: true, complexity: true });
assert.ok(apiHtml.includes("<b"));
assert.ok(apiHtml.includes("data-nr-fixation"));
assert.strictEqual(plain(apiHtml), "Hello, world!");

console.log("Feature/API tests passed.");
