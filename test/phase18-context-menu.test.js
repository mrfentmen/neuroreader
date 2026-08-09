"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const chromeManifest = JSON.parse(fs.readFileSync("extensions/chrome/manifest.json", "utf8"));
const firefoxManifest = JSON.parse(fs.readFileSync("extensions/firefox/manifest.json", "utf8"));
const chromeBackground = fs.readFileSync("extensions/chrome/background.js", "utf8");
const firefoxBackground = fs.readFileSync("extensions/firefox/background.js", "utf8");
const chromePopup = fs.readFileSync("extensions/chrome/popup.js", "utf8");
const firefoxPopup = fs.readFileSync("extensions/firefox/popup.js", "utf8");

assert.ok(chromeManifest.permissions.includes("contextMenus"));
assert.ok(firefoxManifest.permissions.includes("contextMenus"));
assert.match(chromeBackground, /contexts:\s*\["selection"\]/);
assert.match(firefoxBackground, /contexts:\s*\["selection"\]/);
assert.match(chromeBackground, /Transform selection with NeuroReader/);
assert.match(firefoxBackground, /Transform selection with NeuroReader/);
assert.match(chromeBackground, /info\.selectionText/);
assert.match(firefoxBackground, /info\.selectionText/);
assert.match(chromeBackground, /nrPendingText/);
assert.match(firefoxBackground, /nrPendingText/);
assert.match(chromePopup, /pending.*===\s*"1"/);
assert.match(firefoxPopup, /pending.*===\s*"1"/);
assert.match(chromePopup, /Selected text is ready to transform/);
assert.match(firefoxPopup, /Selected text is ready to transform/);
assert.match(chromePopup, /10 \* 60 \* 1000/);
assert.match(firefoxPopup, /10 \* 60 \* 1000/);
assert.match(chromeBackground, /value\.slice\(0, 20000\)/);
assert.match(firefoxBackground, /value\.slice\(0, 20000\)/);
assert.match(chromeBackground, /removeAll/);
assert.match(firefoxBackground, /removeAll/);

function eventSlot() {
  let listener = null;
  return {
    addListener(fn) { listener = fn; },
    fire(...args) { return listener && listener(...args); },
  };
}

function loadChromeBackground() {
  const installed = eventSlot();
  const startup = eventSlot();
  const clicked = eventSlot();
  const message = eventSlot();
  const menus = [];
  const stored = [];
  const tabs = [];
  const api = {
    runtime: {
      onInstalled: installed,
      onStartup: startup,
      onMessage: message,
      getURL: (path) => "chrome-extension://test/" + path,
    },
    contextMenus: {
      removeAll(callback) { menus.length = 0; callback(); },
      create(item, callback) { menus.push(item); if (callback) callback(); },
      onClicked: clicked,
    },
    storage: { local: { set(value, callback) { stored.push(value); callback(); } } },
    tabs: { create(tab) { tabs.push(tab); } },
  };
  const context = { chrome: api, Date: { now: () => 1234 }, String };
  vm.createContext(context);
  vm.runInContext(chromeBackground, context);
  installed.fire();
  assert.strictEqual(menus.length, 1);
  assert.deepStrictEqual(Array.from(menus[0].contexts), ["selection"]);
  clicked.fire({ menuItemId: "nr-share-snippet", selectionText: "  Selected from Chrome  " });
  assert.strictEqual(stored[0].nrPendingText.kind, "selection");
  assert.strictEqual(stored[0].nrPendingText.text, "Selected from Chrome");
  assert.strictEqual(tabs[0].url, "chrome-extension://test/popup.html?pending=1");
  assert.strictEqual(stored[0].nrPendingText.text.length <= 20000, true);
  startup.fire();
  assert.strictEqual(menus.length, 1, "startup recreates one menu instead of duplicating it");
}

async function loadFirefoxBackground() {
  const clicked = eventSlot();
  const message = eventSlot();
  const menus = [];
  const stored = [];
  const tabs = [];
  const api = {
    runtime: {
      onMessage: message,
      getURL: (path) => "moz-extension://test/" + path,
    },
    contextMenus: {
      removeAll() { menus.length = 0; return Promise.resolve(); },
      create(item) { menus.push(item); return Promise.resolve(); },
      onClicked: clicked,
    },
    storage: { local: { set(value) { stored.push(value); return Promise.resolve(); } } },
    tabs: { create(tab) { tabs.push(tab); } },
  };
  const context = { browser: api, Date: { now: () => 5678 }, String, Promise, setTimeout };
  vm.createContext(context);
  vm.runInContext(firefoxBackground, context);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(menus.length, 1);
  assert.deepStrictEqual(Array.from(menus[0].contexts), ["selection"]);
  clicked.fire({ menuItemId: "nr-share-snippet", selectionText: "  Selected from Firefox  " });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(stored[0].nrPendingText.kind, "selection");
  assert.strictEqual(stored[0].nrPendingText.text, "Selected from Firefox");
  assert.strictEqual(tabs[0].url, "moz-extension://test/popup.html?pending=1");
  assert.strictEqual(stored[0].nrPendingText.text.length <= 20000, true);
}

(async () => {
  loadChromeBackground();
  await loadFirefoxBackground();
  console.log("Phase 18 context-menu tests passed.");
})().catch((error) => { console.error(error); process.exit(1); });
