"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const chromeSource = fs.readFileSync("extensions/chrome/phase3.js", "utf8");
const firefoxSource = fs.readFileSync("extensions/firefox/phase3.js", "utf8");
const chromePopup = fs.readFileSync("extensions/chrome/popup.js", "utf8");
const firefoxPopup = fs.readFileSync("extensions/firefox/popup.js", "utf8");
assert.ok(chromeSource.length > 0 && firefoxSource.length > 0, "both browser Phase 3 helpers exist");
assert.ok(chromeSource.includes("NeuroReaderPhase3"));
assert.ok(firefoxSource.includes("NeuroReaderPhase3"));
assert.ok(chromePopup.includes("nrPendingText"));
assert.ok(firefoxPopup.includes("nrPendingText"));
assert.ok(chromePopup.includes("Formatted snippet shared or copied"));
assert.ok(firefoxPopup.includes("Formatted snippet shared or copied"));

function load(source, browserApi, chromeApi) {
  const holder = { innerHTML: "", textContent: "" };
  const context = {
    window: {},
    document: { createElement() { return holder; } },
    Blob: function () {},
    URL: { createObjectURL() { return "blob:test"; }, revokeObjectURL() {} },
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    unescape,
    encodeURIComponent,
    navigator: {},
    browser: browserApi,
    chrome: chromeApi,
    setTimeout,
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return context.window.NeuroReaderPhase3;
}

const local = { set() { return Promise.resolve(); }, get() { return Promise.resolve({}); } };
const firefox = load(firefoxSource, { storage: { local } }, undefined);
assert.strictEqual(firefox.timerState({ duration: 0 }).duration, 1500);
assert.strictEqual(firefox.markdownFromHtml("<b>Read</b><br>now &quot;here&quot;"), "**Read**\nnow \"here\"");

const callbacks = { set() {}, get(_defaults, callback) { callback({}); } };
const chrome = load(chromeSource, undefined, { storage: { local: callbacks } });
assert.strictEqual(chrome.markdownFromHtml("<b>Read</b><br>now &quot;here&quot;"), "**Read**\nnow \"here\"");
console.log("Phase 3 Firefox parity tests passed.");
