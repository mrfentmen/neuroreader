"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const chromeManifest = JSON.parse(fs.readFileSync("extensions/chrome/manifest.json", "utf8"));
const firefoxManifest = JSON.parse(fs.readFileSync("extensions/firefox/manifest.json", "utf8"));
const chromeBackground = fs.readFileSync("extensions/chrome/background.js", "utf8");
const firefoxBackground = fs.readFileSync("extensions/firefox/background.js", "utf8");

for (const [label, manifest] of [["Chrome", chromeManifest], ["Firefox", firefoxManifest]]) {
  assert.ok(manifest.commands, `${label} commands declared`);
  assert.strictEqual(manifest.commands["nr-toggle-page"].suggested_key.default, "Alt+Shift+N", `${label} page shortcut`);
  assert.strictEqual(manifest.commands["nr-reading-mode"].suggested_key.default, "Alt+Shift+R", `${label} reading-mode shortcut`);
  assert.match(manifest.commands["nr-toggle-page"].description, /current page/);
  assert.match(manifest.commands["nr-reading-mode"].description, /reading mode/);
}
assert.match(chromeBackground, /api\.commands\.onCommand\.addListener/);
assert.match(firefoxBackground, /api\.commands\.onCommand\.addListener/);
assert.match(chromeBackground, /nr-toggle-page/);
assert.match(firefoxBackground, /nr-reading-mode/);

function eventSlot() {
  let listener = null;
  return {
    addListener(fn) { listener = fn; },
    fire(...args) { return listener && listener(...args); },
  };
}

function loadChrome() {
  const command = eventSlot();
  const sent = [];
  const api = {
    commands: { onCommand: command },
    runtime: { onInstalled: eventSlot(), onStartup: eventSlot(), onMessage: eventSlot(), lastError: null },
    contextMenus: { removeAll(cb) { cb(); }, create(_item, cb) { cb(); }, onClicked: eventSlot() },
    storage: { local: { set(_value, cb) { cb(); } } },
    tabs: { sendMessage(id, message, cb) { sent.push({ id, message }); if (cb) cb(); } },
  };
  vm.createContext({ chrome: api, Date, String });
  vm.runInContext(chromeBackground, vm.createContext({ chrome: api, Date, String }));
  command.fire("nr-toggle-page", { id: 7 });
  command.fire("nr-reading-mode", { id: 7 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sent)), [
    { id: 7, message: { type: "nr-toggle" } },
    { id: 7, message: { type: "nr-reading-mode-toggle" } },
  ]);
}

function loadFirefox() {
  const command = eventSlot();
  const sent = [];
  const api = {
    commands: { onCommand: command },
    runtime: { onMessage: eventSlot(), getURL: (value) => value },
    contextMenus: { removeAll() { return Promise.resolve(); }, create() { return Promise.resolve(); }, onClicked: eventSlot() },
    storage: { local: { set() { return Promise.resolve(); } } },
    tabs: { sendMessage(id, message) { sent.push({ id, message }); return Promise.resolve(); }, create() {} },
  };
  const context = { browser: api, Date, String, Promise, setTimeout };
  vm.createContext(context);
  vm.runInContext(firefoxBackground, context);
  command.fire("nr-toggle-page", { id: 9 });
  command.fire("nr-reading-mode", { id: 9 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(sent)), [
    { id: 9, message: { type: "nr-toggle" } },
    { id: 9, message: { type: "nr-reading-mode-toggle" } },
  ]);
}

loadChrome();
loadFirefox();
console.log("Phase 21 command tests passed.");
