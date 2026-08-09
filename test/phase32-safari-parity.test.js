"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const safariPopup = read("extensions/safari/popup.js");
const firefoxPopup = read("extensions/firefox/popup.js");
const safariHtml = read("extensions/safari/popup.html");
const firefoxHtml = read("extensions/firefox/popup.html");
const safariStyles = read("extensions/safari/styles.css");
const firefoxStyles = read("extensions/firefox/styles.css");
const safariLibrary = read("extensions/safari/library.js");
const firefoxLibrary = read("extensions/firefox/library.js");
const safariPhase3 = read("extensions/safari/phase3.js");
const firefoxPhase3 = read("extensions/firefox/phase3.js");
const safariClipboard = read("extensions/safari/clipboard.js");
const firefoxClipboard = read("extensions/firefox/clipboard.js");
const safariBackground = read("extensions/safari/background.js");
const firefoxBackground = read("extensions/firefox/background.js");
const manifest = JSON.parse(read("extensions/safari/manifest.json"));

assert.strictEqual(safariPopup, firefoxPopup, "Safari and Firefox popup logic stays identical");
assert.strictEqual(safariHtml, firefoxHtml, "Safari and Firefox popup markup stays identical");
assert.strictEqual(safariStyles, firefoxStyles, "Safari and Firefox popup styling stays identical");
assert.strictEqual(safariLibrary, firefoxLibrary, "Safari and Firefox saved-reading libraries stay identical");
assert.strictEqual(safariPhase3, firefoxPhase3, "Safari and Firefox timer/export helpers stay identical");
assert.strictEqual(safariClipboard, firefoxClipboard, "Safari and Firefox clipboard helpers stay identical");
assert.ok(safariBackground.length > 1000 && firefoxBackground.length > 1000, "Safari and Firefox background behavior is present");

for (const id of ["nr-site-input", "nr-site-add", "nr-site-color-save", "nr-profile", "nr-daily-goal", "nr-preset-code", "nr-library-save", "nr-library-export", "nr-stats-summary", "nr-export-text", "nr-timer-toggle", "nr-clipboard-setting"]) {
  assert.match(safariHtml, new RegExp(`id="${id}"`), `Safari popup includes ${id}`);
}
assert.match(safariPopup, /storageGetArea\("local"/);
assert.match(safariPopup, /storageSetArea\("local"/);
assert.match(safariPopup, /NeuroReaderLibrary/);
assert.match(safariPopup, /NeuroReaderPhase3/);
assert.match(safariPopup, /activeTab/);
assert.match(safariBackground, /contextMenus/);
assert.match(safariBackground, /api\.commands && api\.commands\.onCommand/);
assert.match(safariBackground, /nr-clipboard-offer/);
assert.deepStrictEqual(manifest.permissions.sort(), ["activeTab", "contextMenus", "storage", "tabs"]);
assert.deepStrictEqual(manifest.browser_specific_settings.safari, { strict_min_version: "15.0" }, "Safari manifest metadata remains minimal and platform-specific");
assert.deepStrictEqual(manifest.background, { scripts: ["background.js"] });
assert.deepStrictEqual(manifest.content_scripts[0].js, ["formula.js", "features.js", "content.js", "reading-mode.js", "clipboard.js", "stats.js"]);
for (const file of ["phase3.js", "library.js", "clipboard.js", "background.js"]) {
  assert.strictEqual(fs.existsSync(path.join(root, "extensions/safari", file)), true, `Safari ${file} exists`);
}
assert.ok(!safariPopup.includes("window.NeuroReader.transform ="), "Safari popup does not redefine the formula");
console.log("Phase 32 Safari parity tests passed.");
