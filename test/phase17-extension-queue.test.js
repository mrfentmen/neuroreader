"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function makeApi(promiseStyle) {
  let values = { nrSavedReadings: [], nrReadingQueue: [] };
  const runtime = { lastError: null };
  const area = {
    get(defaults, callback) {
      const result = Object.assign({}, defaults, values);
      if (promiseStyle) return Promise.resolve(result);
      callback(result);
    },
    set(next, callback) {
      values = Object.assign({}, values, next);
      if (promiseStyle) return Promise.resolve();
      callback();
    },
  };
  const api = { storage: { local: area }, runtime };
  return {
    api: promiseStyle ? { browser: api, chrome: undefined } : { browser: undefined, chrome: api },
    read() { return JSON.parse(JSON.stringify(values)); },
    injectQueue(ids) { values.nrReadingQueue = ids.slice(); },
  };
}

function load(file, promiseStyle) {
  const fixture = makeApi(promiseStyle);
  const context = {
    window: {}, browser: fixture.api.browser, chrome: fixture.api.chrome,
    Date, Math, console, encodeURIComponent, JSON,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return { library: context.window.NeuroReaderLibrary, read: fixture.read, injectQueue: fixture.injectQueue };
}

function call(fn, ...args) {
  return new Promise((resolve) => fn(...args, (...result) => resolve(result)));
}

(async () => {
  for (const promiseStyle of [false, true]) {
    const file = promiseStyle ? "extensions/firefox/library.js" : "extensions/chrome/library.js";
    const { library, read, injectQueue } = load(file, promiseStyle);
    const [first] = await call(library.save, { id: "first", title: "First", text: "First saved text." });
    const [second] = await call(library.save, { id: "second", title: "Second", text: "Second saved text." });
    const [queuedFirst, activeFirst, firstError] = await call(library.queueToggle, first.id);
    assert.ifError(firstError);
    assert.strictEqual(activeFirst, true);
    assert.deepStrictEqual(queuedFirst.map((item) => item.id), ["first"]);
    const [queuedSecond, activeSecond] = await call(library.queueToggle, second.id);
    assert.strictEqual(activeSecond, true);
    assert.deepStrictEqual(queuedSecond.map((item) => item.id), ["first", "second"]);
    const [moved] = await call(library.queueMove, second.id, -1);
    assert.deepStrictEqual(moved.map((item) => item.id), ["second", "first"]);
    const [reloaded] = await call(library.queueList);
    assert.deepStrictEqual(reloaded.map((item) => item.id), ["second", "first"]);
    const [removed] = await call(library.queueRemove, second.id);
    assert.deepStrictEqual(Array.from(removed), ["first"]);
    const [toggledOff, inactive] = await call(library.queueToggle, first.id);
    assert.strictEqual(inactive, false);
    assert.deepStrictEqual(Array.from(toggledOff), []);
    const [, , missingError] = await call(library.queueToggle, "missing");
    assert.ok(missingError && missingError.message === "Saved reading not found");

    await call(library.queueToggle, first.id);
    await call(library.queueToggle, second.id);
    const [cleared] = await call(library.queueClear);
    assert.deepStrictEqual(Array.from(cleared), []);
    assert.deepStrictEqual(read().nrReadingQueue, []);

    injectQueue(["stale"]);
    const [cleaned, cleanupError] = await call(library.queueList);
    assert.ifError(cleanupError);
    assert.deepStrictEqual(Array.from(cleaned), []);
    assert.deepStrictEqual(read().nrReadingQueue, []);
  }
  console.log("Phase 17 extension queue tests passed.");
})().catch((error) => { console.error(error); process.exit(1); });
