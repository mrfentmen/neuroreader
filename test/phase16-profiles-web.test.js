"use strict";

const assert = require("assert");
const features = require("../features.js");
const fs = require("fs");
const index = fs.readFileSync("index.html", "utf8");

const custom = features.normalize({ profile: "custom" });
assert.strictEqual(custom.profile, "custom");
assert.strictEqual(custom.spotlight, false);

const adhd = features.normalize({ profile: "adhd" });
assert.strictEqual(adhd.profile, "adhd");
assert.strictEqual(adhd.progress, true);
assert.strictEqual(adhd.spotlight, true);
assert.strictEqual(adhd.motion, false);

const dyslexia = features.normalize({ profile: "dyslexia" });
assert.strictEqual(dyslexia.profile, "dyslexia");
assert.strictEqual(dyslexia.gradient, true);
assert.strictEqual(dyslexia.sentence, true);
assert.strictEqual(dyslexia.contrast, true);

const autism = features.normalize({ profile: "autism", gradient: true, spotlight: true });
assert.strictEqual(autism.profile, "autism");
assert.strictEqual(autism.motion, true);
assert.strictEqual(autism.contrast, true);
assert.strictEqual(autism.gradient, false);
assert.strictEqual(autism.spotlight, false);

assert.match(index, /id="profile-adhd"/);
assert.match(index, /id="profile-dyslexia"/);
assert.match(index, /id="profile-autism"/);
assert.match(index, /function applyProfile\(profile\)/);
assert.match(index, /localStorage\.setItem\(settingsKey/);
assert.ok(!index.includes("function transform(text)"), "profile UI does not redefine the formula");

console.log("Phase 16 web profile tests passed.");
