"use strict";
const assert = require("assert");
const api = require("../api/neuroreader-api.js");
const features = require("../features.js");
const html = api.transform("NeuroReader keeps focus.", { gradient:true, complexity:true, sentence:true });
assert.ok(html.includes("data-nr-fixation"));
assert.strictEqual(features.plainText(html), "NeuroReader keeps focus.");
assert.throws(() => api.transform(42), /text must be a string/);
console.log("API tests passed.");
