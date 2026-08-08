"use strict";
const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

function makeApi(promiseStyle, failureMode) {
  let items = [];
  let failWrites = !!failureMode;
  const runtime = { lastError: null };
  const area = {
    get(defaults, callback) {
      const result = { nrSavedReadings: items };
      if (promiseStyle) return Promise.resolve(result);
      callback(result);
    },
    set(values, callback) {
      if (failWrites) {
        if (promiseStyle) return Promise.reject(new Error("quota"));
        runtime.lastError = { message: "quota" };
        callback();
        runtime.lastError = null;
        return;
      }
      items = values.nrSavedReadings;
      if (promiseStyle) return Promise.resolve();
      callback();
    },
  };
  const api = { storage: { local: area }, runtime: runtime };
  return {
    api: promiseStyle ? { browser: api, chrome: undefined } : { browser: undefined, chrome: api },
    read: () => items,
  };
}

function load(file, promiseStyle, failureMode = false) {
  const fixture = makeApi(promiseStyle, failureMode);
  const context = { window: {}, browser: fixture.api.browser, chrome: fixture.api.chrome, Date, Math, console };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(file, "utf8"), context);
  return { library: context.window.NeuroReaderLibrary, read: fixture.read };
}

function callbackCall(fn, ...args) {
  return new Promise((resolve) => fn(...args, (...result) => resolve(result)));
}

(async () => {
  for (const promiseStyle of [false, true]) {
    const file = promiseStyle ? "extensions/firefox/library.js" : "extensions/chrome/library.js";
    const { library, read } = load(file, promiseStyle);
    assert.strictEqual(library.wordCount("One café, two words."), 4);
    const [saved, listed] = await callbackCall(library.save, {
      title: "  Local reading  ",
      text: "One café, two words.",
      html: "<b>One</b> café, two words.",
      url: "https://should-not-be-stored.example/secret",
    });
    assert.strictEqual(saved.title, "Local reading");
    assert.strictEqual(saved.wordCount, 4);
    assert.ok(!Object.prototype.hasOwnProperty.call(saved, "url"));
    assert.strictEqual(listed.length, 1);
    assert.strictEqual(read()[0].text, "One café, two words.");

    const [loaded] = await callbackCall(library.list);
    assert.strictEqual(loaded[0].html, "<b>One</b> café, two words.");
    const [remaining] = await callbackCall(library.remove, loaded[0].id);
    assert.strictEqual(remaining.length, 0);

    await callbackCall(library.save, { title: "Again", text: "Keep this." });
    const [cleared] = await callbackCall(library.clear);
    assert.strictEqual(cleared.length, 0);
    assert.strictEqual(read().length, 0);

    const failure = load("extensions/chrome/library.js", promiseStyle, true).library;
    const [failedSaved, failedItems, saveError] = await callbackCall(failure.save, { title: "Quota", text: "will fail" });
    assert.strictEqual(failedSaved, null);
    assert.ok(saveError && saveError.message === "quota");

    const normalized = library.normalizeList(Array.from({ length: 30 }, (_, i) => ({ text: "item " + i, title: "item " + i, updatedAt: i + 1 })));
    assert.strictEqual(normalized.length, library.MAX_ITEMS);
    assert.ok(library.normalizeList([{ text: "x".repeat(library.MAX_TEXT + 10), title: "large" }])[0].text.length <= library.MAX_TEXT);
    assert.strictEqual(normalized[0].text, "item 29");
  }
  console.log("Phase 5 library tests passed.");
})().catch((error) => { console.error(error); process.exit(1); });
