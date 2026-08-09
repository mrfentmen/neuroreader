"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const chromeMode = read("extensions/chrome/reading-mode.js");
const firefoxMode = read("extensions/firefox/reading-mode.js");
const safariMode = read("extensions/safari/reading-mode.js");
const safariPopup = read("extensions/safari/popup.js");
const safariHtml = read("extensions/safari/popup.html");
const safariManifest = JSON.parse(read("extensions/safari/manifest.json"));

assert.match(chromeMode, /storageApi\.runtime\.onMessage/, "Chrome uses the selected browser runtime namespace");
assert.match(firefoxMode, /storageApi\.runtime\.onMessage/, "Firefox uses the selected browser runtime namespace");
for (const [label, source] of [["Chrome", chromeMode], ["Firefox", firefoxMode], ["Safari", safariMode]]) {
  assert.match(source, /nr-reading-mode-toggle/, `${label} exposes reading-mode toggle messaging`);
  assert.match(source, /nr-reading-mode-state/, `${label} exposes reading-mode state messaging`);
  assert.match(source, /nr-blue-light-active/, `${label} exposes blue-light state`);
  assert.match(source, /nr-eye-reminder/, `${label} exposes eye-rest reminder`);
  assert.match(source, /NeuroReaderStats/, `${label} records aggregate local progress`);
  assert.match(source, /storageApi\.runtime\.onMessage/, `${label} uses the selected browser runtime namespace`);
  assert.match(source, /Math\.max\(0\.05/, `${label} clamps reminder intervals to a safe minimum`);
}
assert.match(safariPopup, /storageGet\(/, "Safari popup supports promise and callback storage APIs");
assert.match(safariPopup, /api\.tabs\.query/, "Safari popup queries the active tab through the browser API");
assert.match(safariPopup, /api\.tabs\.sendMessage/, "Safari popup sends reading-mode messages through the browser API");
assert.doesNotMatch(safariMode, /chrome\.runtime\.onMessage/, "Safari does not hard-code the Chrome runtime namespace");
assert.match(safariHtml, /id="nr-focus-setting"/, "Safari popup exposes focus control");
assert.match(safariHtml, /id="nr-blue-light-setting"/, "Safari popup exposes blue-light control");
assert.match(safariHtml, /id="nr-eye-rest-setting"/, "Safari popup exposes eye-rest control");
assert.match(safariHtml, /id="nr-reading-mode"/, "Safari popup exposes reading-mode control");
assert.deepStrictEqual(safariManifest.content_scripts[0].js, ["formula.js", "features.js", "content.js", "reading-mode.js", "stats.js"], "Safari loads focus runtime files in order");
assert.strictEqual(fs.existsSync(path.join(root, "extensions/safari/reading-mode.js")), true);
assert.strictEqual(fs.existsSync(path.join(root, "extensions/safari/stats.js")), true);
console.log("Phase 31 focus-tool wiring tests passed.");
