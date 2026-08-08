"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function load(file, api) {
  const context = { window: {}, browser: api.browser, chrome: api.chrome, Date, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return context.window.NeuroReaderStats;
}
function memoryApi(promiseStyle) {
  let value = null;
  const area = {
    get(defaults, callback) {
      const result = { nrExtensionStats: value || defaults.nrExtensionStats };
      if (promiseStyle) return Promise.resolve(result);
      if (callback) callback(result);
      return undefined;
    },
    set(values, callback) {
      value = values.nrExtensionStats;
      if (promiseStyle) return Promise.resolve();
      if (callback) callback();
      return undefined;
    },
    remove(key, callback) {
      if (key === "nrExtensionStats" || key === "nrReadingTotals") value = null;
      if (promiseStyle) return Promise.resolve();
      if (callback) callback();
      return undefined;
    },
  };
  const api = { storage: { local: area }, runtime: { lastError: null } };
  return promiseStyle ? { browser: api, chrome: undefined } : { browser: undefined, chrome: api };
}

const chromeStats = load("extensions/chrome/stats.js", memoryApi(false));
chromeStats.normalize({ totalWords: -10, days: [{ date: "bad" }] });
assert.strictEqual(chromeStats.normalize({ totalWords: -10 }).totalWords, 0);
let chromeState;
chromeStats.recordSession(120, (state) => { chromeState = state; });
assert.strictEqual(chromeState.totalWords, 120);
assert.strictEqual(chromeState.totalSessions, 1);
assert.strictEqual(chromeState.days[0].words, 120);
let chromeReset;
chromeStats.reset((state) => { chromeReset = state; });
assert.strictEqual(chromeReset.totalWords, 0);

const firefoxStats = load("extensions/firefox/stats.js", memoryApi(true));
let firefoxState;
firefoxStats.recordSession(80, (state) => { firefoxState = state; });
setImmediate(() => {
  assert.strictEqual(firefoxState.totalWords, 80);
  assert.strictEqual(firefoxState.totalSessions, 1);
  assert.strictEqual(firefoxState.days[0].sessions, 1);
  console.log("Phase 4 stats tests passed.");
});
