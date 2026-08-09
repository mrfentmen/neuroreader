"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const browsers = ["chrome", "firefox", "safari"];
const html = browsers.map((browser) => fs.readFileSync(path.join(root, "extensions", browser, "popup.html"), "utf8"));
const css = browsers.map((browser) => fs.readFileSync(path.join(root, "extensions", browser, "styles.css"), "utf8"));

for (const source of html) {
  assert(source.indexOf('class="pp-ad-slot"') < source.indexOf('class="pp-support-link"'), "ad placeholder appears above the support link");
  assert.match(source, /class="pp-ad-slot"/);
  assert.match(source, />Your ad here</);
  assert.match(source, />contactae2000@gmail\.com</);
  assert.match(source, /class="pp-support-link"/);
  assert.match(source, /https:\/\/www\.buymeacoffee\.com\/contactae2b/);
  assert.match(source, />Buy Me a Coffee</);
  assert.match(source, /target="_blank"/);
  assert.match(source, /rel="noopener noreferrer"/);
}
for (const source of html) {
  assert.match(source, /The popup contains|Support free reading tools/);
}
for (const source of css) {
  assert.match(source, /\.pp-ad-slot/);
  assert.match(source, /\.pp-support-link/);
}
assert.strictEqual(html[0], html[1], "Chrome and Firefox popup markup stays byte-identical");
assert.strictEqual(html[1], html[2], "Firefox and Safari popup markup stays byte-identical");
assert.strictEqual(css[0], css[1], "Chrome and Firefox popup styles stay byte-identical");
assert.strictEqual(css[1], css[2], "Firefox and Safari popup styles stay byte-identical");

const runtimeFiles = ["extensions/chrome/popup.js", "extensions/firefox/popup.js", "extensions/safari/popup.js"];
for (const file of runtimeFiles) {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  assert(!source.includes("contactae2000@gmail.com"), `${file} must not contain ad content in executable code`);
  assert(!source.includes("buymeacoffee.com"), `${file} must not open support links automatically`);
}

console.log("Phase 40 popup support-banner tests passed.");
