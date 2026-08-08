"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const chrome = fs.readFileSync(path.join(root, "extensions/chrome/content.js"), "utf8");
const firefox = fs.readFileSync(path.join(root, "extensions/firefox/content.js"), "utf8");
const safari = fs.readFileSync(path.join(root, "extensions/safari/content.js"), "utf8");
for (const source of [chrome, firefox, safari]) {
  assert.match(source, /select,option,optgroup,datalist/);
  assert.match(source, /\[role='listbox'\]/);
  assert.match(source, /\[role='option'\]/);
  assert.match(source, /\[aria-haspopup='menu'\]/);
}
assert.strictEqual(chrome.match(/var SKIP_SELECTOR =([\s\S]*?)var OBSERVE_DEBOUNCE_MS/)[1], safari.match(/var SKIP_SELECTOR =([\s\S]*?)var OBSERVE_DEBOUNCE_MS/)[1]);
console.log("Safari dropdown-control parity passed.");
