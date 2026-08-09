"use strict";
const assert = require("assert");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");

async function runPopupApiMode(mode, popupDirectory, createFailure) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const popupHtml = fs.readFileSync(path.join(root, "extensions", popupDirectory, "popup.html"), "utf8");
  const browserScripts = ["formula.js", "features.js", "phase3.js", "stats.js", "library.js", "popup.js"].map((file) => fs.readFileSync(path.join(root, "extensions", popupDirectory, file), "utf8"));
  const opened = [];
  page.on("pageerror", (error) => { throw error; });
  await page.setContent(popupHtml, { waitUntil: "domcontentloaded" });
  await page.exposeFunction("recordOpened", (url) => opened.push(url));
  await page.evaluate(({ apiMode, shouldFail }) => {
    const values = Object.create(null);
    const callbacks = apiMode === "chrome";
    const runtime = {
      lastError: null,
      getManifest: () => ({ version: "0.1.1" }),
      onMessage: { addListener: () => {} },
    };
    const area = {
      get(defaults, callback) {
        const result = Object.assign({}, defaults, values);
        if (callbacks) {
          if (typeof callback === "function") callback(result);
        } else return Promise.resolve(result);
      },
      set(next, callback) {
        Object.assign(values, next);
        if (callbacks) {
          if (typeof callback === "function") callback();
        } else return Promise.resolve();
      },
      remove(keys, callback) {
        for (const key of keys) delete values[key];
        if (callbacks) {
          if (typeof callback === "function") callback();
        } else return Promise.resolve();
      },
    };
    const tabs = {
      query(_query, callback) {
        const result = [{ id: 7, url: "https://example.com/article" }];
        if (callbacks) {
          if (typeof callback === "function") callback(result);
        } else return Promise.resolve(result);
      },
      sendMessage(_id, _message, callback) {
        const result = { transformed: false, active: false };
        if (callbacks) {
          if (typeof callback === "function") callback(result);
        } else return Promise.resolve(result);
      },
      create({ url }, callback) {
        if (shouldFail) {
          if (callbacks) {
            runtime.lastError = { message: "tabs.create failed" };
            if (typeof callback === "function") callback();
            runtime.lastError = null;
          } else return Promise.reject(new Error("tabs.create failed"));
          return;
        }
        window.recordOpened(url);
        if (callbacks) {
          if (typeof callback === "function") callback();
        } else return Promise.resolve({ id: 8 });
      },
    };
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: (value) => { window.__copiedFeedback = value; return Promise.resolve(); } },
    });
    if (callbacks) {
      window.chrome = { storage: { sync: area, local: area, onChanged: { addListener: () => {} } }, tabs, runtime };
      window.browser = undefined;
    } else {
      window.browser = { storage: { sync: area, local: area, onChanged: { addListener: () => {} } }, tabs, runtime };
      window.chrome = undefined;
    }
    window.NeuroReaderFeatures = { DEFAULTS: {}, normalize: (value) => value, decorateHtml: (value) => value };
    window.NeuroReader = { transform: (value) => value };
    window.NeuroReaderPhase3 = {
      loadTimer: (callback) => callback({ running: false, duration: 1500, endsAt: 0 }),
      saveTimer: () => {},
      markdownFromHtml: (value) => value,
      download: () => {},
      shareSnippet: () => Promise.resolve(),
    };
    window.NeuroReaderStats = { get: (callback) => callback({ totalWords: 0, totalSessions: 0 }), reset: (callback) => callback({ totalWords: 0, totalSessions: 0 }) };
    window.NeuroReaderLibrary = { list: (callback) => callback([]), queueList: (callback) => callback([]) };
  }, { apiMode: mode === "chrome" ? "chrome" : "promise", shouldFail: createFailure });
  for (const script of browserScripts) await page.addScriptTag({ content: script });

  await page.click("#nr-feedback-open");
  assert.match(await page.locator("#pp-status").textContent(), /Describe the problem first/);
  await page.fill("#nr-feedback", `${mode} API popup path works.`);
  await page.click("#nr-feedback-open");
  await page.waitForFunction(() => !!window.__copiedFeedback);
  if (createFailure) {
    await page.waitForFunction(() => document.getElementById("pp-status").textContent.includes("Could not open GitHub"));
    assert.strictEqual(opened.length, 0, `${mode} does not claim a failed GitHub draft opened`);
  } else {
    await page.waitForFunction(() => document.getElementById("pp-status").textContent.includes("Report copied locally"));
    assert.strictEqual(opened.length, 1, `${mode} opened one GitHub draft`);
    const issue = new URL(opened[0]);
    assert.strictEqual(issue.hostname, "github.com");
    assert.strictEqual(issue.searchParams.has("body"), false, `${mode} keeps report out of URL`);
  }
  assert.match(await page.evaluate(() => window.__copiedFeedback), new RegExp(`${mode} API popup path works\\.`));
  await browser.close();
}

(async () => {
  for (const [mode, directory] of [["chrome", "chrome"], ["firefox", "firefox"], ["safari", "safari"]]) {
    await runPopupApiMode(mode, directory, false);
    await runPopupApiMode(mode, directory, true);
  }
  console.log("Phase 37 popup API compatibility e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
