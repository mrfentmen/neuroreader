"use strict";
const assert = require("assert");
const crypto = require("crypto");
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
  return { library: context.window.NeuroReaderLibrary, read: fixture.read };
}

function call(fn, ...args) {
  return new Promise((resolve) => fn(...args, (...result) => resolve(result)));
}

(async () => {
  const formulaHashes = [
    ["formula.min.js", "c0da1814936d1871b69568681e8447276f6f6890997085e59f58caac6916d13d"],
    ["extensions/chrome/formula.js", "73c92fd092fa1d365c6391b70d8cd541a68287e4b9ae848fc5ef061739cd3549"],
    ["extensions/firefox/formula.js", "73c92fd092fa1d365c6391b70d8cd541a68287e4b9ae848fc5ef061739cd3549"],
  ];
  formulaHashes.forEach(([file, expected]) => {
    assert.strictEqual(crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"), expected, `${file} changed`);
  });

  for (const promiseStyle of [false, true]) {
    const file = promiseStyle ? "extensions/firefox/library.js" : "extensions/chrome/library.js";
    const { library, read } = load(file, promiseStyle);
    const [first] = await call(library.save, { id: "local", title: "Existing", text: "Existing local text." });
    await call(library.queueToggle, first.id);
    const payload = {
      version: 1,
      readings: [
        { id: "remote", title: "Imported", text: "Imported reading text.", updatedAt: Date.now() },
        { id: "duplicate", title: "Duplicate", text: "Existing local text." },
      ],
      queue: ["remote", "duplicate"],
    };
    const [result, error] = await call(library.importData, payload);
    assert.ifError(error);
    assert.strictEqual(result.imported, 2);
    assert.strictEqual(result.added, 1);
    assert.strictEqual(result.dropped, 0);
    assert.deepStrictEqual(result.items.map((item) => item.text).sort(), ["Existing local text.", "Imported reading text."]);
    assert.deepStrictEqual(result.queue.map((item) => item.id), ["local", "remote"]);
    assert.deepStrictEqual(read().nrReadingQueue, ["local", "remote"]);

    const [exported, exportError] = await call(library.exportData);
    assert.ifError(exportError);
    assert.strictEqual(exported.version, 1);
    assert.deepStrictEqual(exported.queue, ["local", "remote"]);
    assert.strictEqual(exported.readings.length, 2);

    const invalidResult = await call(library.importData, { version: 1, readings: [{ text: "" }] });
    const invalidError = invalidResult[1];
    assert.ok(invalidError);
    const [, duplicateError] = await call(library.importData, { version: 1, readings: [{ id: "same", text: "One" }, { id: "same", text: "Two" }], queue: [] });
    assert.ok(duplicateError);
    const [, oversizedError] = await call(library.importData, { version: 1, readings: [{ id: "long", text: "x".repeat(library.MAX_TEXT + 1) }], queue: [] });
    assert.ok(oversizedError);
    const [, malformedQueueError] = await call(library.importData, { version: 1, readings: [], queue: [42] });
    assert.ok(malformedQueueError);
    const [, malformedDateError] = await call(library.importData, { version: 1, readings: [{ id: "date", text: "Bad date", updatedAt: "today" }], queue: [] });
    assert.ok(malformedDateError);
    const [, malformedTitleError] = await call(library.importData, { version: 1, readings: [{ id: "title", title: 42, text: "Bad title" }], queue: [] });
    assert.ok(malformedTitleError);
    const [afterInvalid] = await call(library.list);
    assert.strictEqual(afterInvalid.length, 2);
  }
  const chromePopup = fs.readFileSync("extensions/chrome/popup.html", "utf8");
  const firefoxPopup = fs.readFileSync("extensions/firefox/popup.html", "utf8");
  assert.match(chromePopup, /id="nr-library-import"[^>]*tabindex="-1"/);
  assert.match(firefoxPopup, /id="nr-library-import"[^>]*tabindex="-1"/);
  console.log("Phase 20 extension transfer tests passed.");
})().catch((error) => { console.error(error); process.exit(1); });
