"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const manifests = [
  ["Chrome", "extensions/chrome/manifest.json"],
  ["Firefox", "extensions/firefox/manifest.json"],
  ["Safari", "extensions/safari/manifest.json"],
];
for (const [label, file] of manifests) {
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.ok(manifest.commands, `${label} declares keyboard commands`);
  assert.strictEqual(manifest.commands["nr-toggle-page"].suggested_key.default, "Alt+Shift+N", `${label} page command`);
  assert.strictEqual(manifest.commands["nr-reading-mode"].suggested_key.default, "Alt+Shift+R", `${label} reading-mode command`);
}

const sources = [
  ["Chrome", fs.readFileSync("extensions/chrome/background.js", "utf8")],
  ["Firefox", fs.readFileSync("extensions/firefox/background.js", "utf8")],
  ["Safari", fs.readFileSync("extensions/safari/background.js", "utf8")],
];
for (const [label, source] of sources) {
  assert.match(source, /function registerLifecycle\(\)/, `${label} has lifecycle registration`);
  assert.match(source, /api\.runtime\.onInstalled && api\.runtime\.onInstalled\.addListener/, `${label} guards install lifecycle`);
  assert.match(source, /api\.runtime\.onStartup && api\.runtime\.onStartup\.addListener/, `${label} guards startup lifecycle`);
  assert.match(source, /if \(!hasLifecycle\) createContextMenu\(\)/, `${label} has fallback initialization`);
  assert.match(source, /nr-toggle-page/);
  assert.match(source, /nr-reading-mode/);
}

function eventSlot() {
  let listener = null;
  return {
    addListener(fn) { listener = fn; },
    fire(...args) { return listener && listener(...args); },
  };
}

function makePromiseBackgroundApi() {
  const command = eventSlot();
  const clicked = eventSlot();
  const message = eventSlot();
  const menus = [];
  const sent = [];
  const api = {
    commands: { onCommand: command },
    runtime: { onMessage: message, getURL: (value) => "extension://test/" + value },
    contextMenus: {
      removeAll() { menus.length = 0; return Promise.resolve(); },
      create(item) { menus.push(item); return Promise.resolve(); },
      onClicked: clicked,
    },
    storage: { local: { set() { return Promise.resolve(); } } },
    tabs: {
      sendMessage(id, payload) { sent.push({ id, payload }); return Promise.resolve(); },
      create() {},
    },
  };
  return { api, command, menus, sent };
}

async function checkPromiseBuild(file) {
  const fixture = makePromiseBackgroundApi();
  const context = { browser: fixture.api, chrome: undefined, Date, String, Promise, setTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.strictEqual(fixture.menus.length, 1, `${file} initializes without lifecycle events`);
  fixture.command.fire("nr-toggle-page", { id: 11 });
  fixture.command.fire("nr-reading-mode", { id: 11 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(fixture.sent)), [
    { id: 11, payload: { type: "nr-toggle" } },
    { id: 11, payload: { type: "nr-reading-mode-toggle" } },
  ]);
}

function checkChromeBuild() {
  const fixture = makePromiseBackgroundApi();
  const installed = eventSlot();
  const startup = eventSlot();
  fixture.api.runtime.onInstalled = installed;
  fixture.api.runtime.onStartup = startup;
  fixture.api.contextMenus.removeAll = (callback) => { fixture.menus.length = 0; callback(); };
  fixture.api.contextMenus.create = (item, callback) => { fixture.menus.push(item); callback(); };
  fixture.api.storage.local.set = (_value, callback) => callback();
  fixture.api.tabs.sendMessage = (id, payload, callback) => { fixture.sent.push({ id, payload }); callback(); };
  const context = { chrome: fixture.api, browser: undefined, Date, String, Promise, setTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("extensions/chrome/background.js", "utf8"), context);
  assert.strictEqual(fixture.menus.length, 0, "Chrome waits for lifecycle event when events exist");
  installed.fire();
  assert.strictEqual(fixture.menus.length, 1, "Chrome creates the menu on install");
  startup.fire();
  assert.strictEqual(fixture.menus.length, 1, "Chrome recreates one menu on startup");
  fixture.command.fire("nr-toggle-page", { id: 12 });
  fixture.command.fire("nr-reading-mode", { id: 12 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(fixture.sent)), [
    { id: 12, payload: { type: "nr-toggle" } },
    { id: 12, payload: { type: "nr-reading-mode-toggle" } },
  ]);
}

(async () => {
  checkChromeBuild();
  await checkPromiseBuild("extensions/firefox/background.js");
  await checkPromiseBuild("extensions/safari/background.js");
  console.log("Phase 33 background lifecycle tests passed.");
})().catch((error) => { console.error(error); process.exit(1); });
