"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const chromeFile = "extensions/chrome/features.js";
const firefoxFile = "extensions/firefox/features.js";
const chromeSource = fs.readFileSync(chromeFile, "utf8");
const firefoxSource = fs.readFileSync(firefoxFile, "utf8");
assert.strictEqual(chromeSource, firefoxSource, "Chrome and Firefox profile engines stay byte-identical");

function load(source, filename) {
  const context = { window: {}, globalThis: {}, console };
  vm.createContext(context);
  vm.runInContext(source, context, { filename });
  return context.window.NeuroReaderFeatures;
}

function checkEngine(features, label) {
  const defaults = features.normalize({});
  assert.strictEqual(defaults.profile, "custom", label + " defaults to custom");
  assert.strictEqual(defaults.gradient, false, label + " gradient default");
  assert.strictEqual(defaults.progress, false, label + " progress default");
  assert.strictEqual(defaults.spotlight, false, label + " spotlight default");
  assert.strictEqual(defaults.focus, false, label + " focus default");
  assert.strictEqual(defaults.blueLight, false, label + " blue-light default");
  assert.strictEqual(defaults.eyeRest, false, label + " eye-rest default");

  const adhd = features.normalize({ profile: "adhd" });
  assert.strictEqual(adhd.profile, "adhd", label + " ADHD profile");
  assert.strictEqual(adhd.progress, true, label + " ADHD progress");
  assert.strictEqual(adhd.spotlight, true, label + " ADHD spotlight");
  assert.strictEqual(adhd.motion, false, label + " ADHD motion");

  const dyslexia = features.normalize({ profile: "dyslexia" });
  assert.strictEqual(dyslexia.profile, "dyslexia", label + " dyslexia profile");
  assert.strictEqual(dyslexia.gradient, true, label + " dyslexia gradient");
  assert.strictEqual(dyslexia.sentence, true, label + " dyslexia sentence cues");
  assert.strictEqual(dyslexia.contrast, true, label + " dyslexia contrast");
  const dyslexiaHtml = features.decorateHtml('<b>Clear</b> <b>reading</b>.', dyslexia);
  assert.match(dyslexiaHtml, /linear-gradient/, label + " dyslexia gradient markup");
  assert.match(dyslexiaHtml, /#16a34a/, label + " dyslexia sentence color");
  assert.strictEqual(
    dyslexiaHtml.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'"),
    "Clear reading.",
    label + " preserves readable text",
  );

  const autism = features.normalize({ profile: "autism", gradient: true, rainbowWords: true, progress: true, spotlight: true });
  assert.strictEqual(autism.profile, "autism", label + " autism profile");
  assert.strictEqual(autism.motion, true, label + " autism motion");
  assert.strictEqual(autism.contrast, true, label + " autism contrast");
  assert.strictEqual(autism.gradient, false, label + " autism removes gradient");
  assert.strictEqual(autism.rainbowWords, false, label + " autism removes rainbow");
  assert.strictEqual(autism.progress, false, label + " autism removes progress fade");
  assert.strictEqual(autism.spotlight, false, label + " autism removes spotlight");

  const switched = features.normalize({ profile: "dyslexia", progress: true, spotlight: true, motion: true, rainbowWords: true });
  assert.strictEqual(switched.progress, false, label + " profile switch clears progress");
  assert.strictEqual(switched.spotlight, false, label + " profile switch clears spotlight");
  assert.strictEqual(switched.motion, false, label + " profile switch clears motion");
  assert.strictEqual(switched.rainbowWords, false, label + " profile switch clears rainbow");

  const invalid = features.normalize({ profile: "diagnosis" });
  assert.strictEqual(invalid.profile, "custom", label + " invalid profile fallback");
}

checkEngine(load(chromeSource, chromeFile), "Chrome");
checkEngine(load(firefoxSource, firefoxFile), "Firefox");

const chromePopup = fs.readFileSync("extensions/chrome/popup.js", "utf8");
const firefoxPopup = fs.readFileSync("extensions/firefox/popup.js", "utf8");
assert.strictEqual(chromePopup, firefoxPopup, "Chrome and Firefox profile popup logic stays byte-identical");
assert.match(chromePopup, /nr-profile/);
assert.match(chromePopup, /NeuroReaderFeatures\.normalize/);

console.log("Phase 6 profile tests passed for Chrome and Firefox.");
