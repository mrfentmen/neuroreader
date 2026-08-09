"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const builds = [
  { name: "Chrome", file: "extensions/chrome/background.js", mode: "callback" },
  { name: "Firefox", file: "extensions/firefox/background.js", mode: "promise" },
  { name: "Safari", file: "extensions/safari/background.js", mode: "promise" },
];

function eventSlot() {
  let listener = null;
  return {
    addListener(fn) { listener = fn; },
    fire(...args) { return listener && listener(...args); },
  };
}

async function runBuild(build, failure) {
  const message = eventSlot();
  const clicked = eventSlot();
  const installed = eventSlot();
  const startup = eventSlot();
  const menus = [];
  const opened = [];
  const stored = [];
  let runtimeError = null;
  let response = null;
  const callbacks = build.mode === "callback";
  const api = {
    runtime: {
      onMessage: message,
      onInstalled: installed,
      onStartup: startup,
      lastError: null,
      getURL: (value) => "extension://test/" + value,
    },
    commands: { onCommand: eventSlot() },
    contextMenus: {
      removeAll: callbacks ? (cb) => { menus.length = 0; cb(); } : () => { menus.length = 0; return Promise.resolve(); },
      create: callbacks ? ((item, cb) => { menus.push(item); cb(); }) : ((item) => { menus.push(item); return Promise.resolve(); }),
      onClicked: clicked,
    },
    storage: { local: {
      set(value, cb) {
        stored.push(value);
        if (failure === "storage") {
          if (callbacks) { api.runtime.lastError = { message: "storage failed" }; cb(); api.runtime.lastError = null; }
          else return Promise.reject(new Error("storage failed"));
        } else if (callbacks) cb();
        else return Promise.resolve();
      },
    } },
    tabs: {
      create(value, cb) {
        if (failure === "tabs") {
          if (callbacks) { api.runtime.lastError = { message: "tabs failed" }; if (typeof cb === "function") cb(); api.runtime.lastError = null; }
          else return Promise.reject(new Error("tabs failed"));
          return;
        }
        opened.push(value);
        if (callbacks) { if (typeof cb === "function") cb(); }
        else return Promise.resolve({ id: 9 });
      },
      sendMessage() { return callbacks ? undefined : Promise.resolve(); },
    },
  };
  const context = callbacks
    ? { chrome: api, browser: undefined, Date: { now: () => 1234 }, String, Promise, setTimeout }
    : { browser: api, chrome: undefined, Date: { now: () => 1234 }, String, Promise, setTimeout };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(build.file, "utf8"), context);
  if (callbacks) installed.fire();
  else await new Promise((resolve) => setTimeout(resolve, 0));
  clicked.fire({ menuItemId: "nr-share-snippet", selectionText: "selected text" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (failure === "none") assert.strictEqual(opened.length, 1, `${build.name} opens popup after storage`);
  if (failure === "storage" || failure === "tabs") assert.strictEqual(opened.length, 0, `${build.name} does not open after ${failure} failure`);

  message.fire({ type: "nr-clipboard-offer", text: "clipboard text" }, null, (value) => { response = value; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepStrictEqual(JSON.parse(JSON.stringify(response)), { ok: failure === "none" }, `${build.name} responds with pending action status`);
  if (failure === "none") assert.strictEqual(opened.length, 2, `${build.name} opens clipboard popup`);
  if (failure === "storage" || failure === "tabs") assert.strictEqual(opened.length, 0, `${build.name} does not open failed clipboard popup`);

  clicked.fire({ menuItemId: "nr-share-snippet", selectionText: "selected text" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  if (failure === "none") assert.strictEqual(opened.length, 3, `${build.name} opens selection popup`);
  if (failure === "storage" || failure === "tabs") assert.strictEqual(opened.length, 0, `${build.name} does not open failed selection popup`);
}

(async () => {
  for (const build of builds) {
    for (const failure of ["none", "storage", "tabs"]) {
      await runBuild(build, failure);
    }
  }
  console.log("Phase 38 background failure tests passed.");
})().catch((error) => { console.error(error); process.exit(1); });
