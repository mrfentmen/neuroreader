"use strict";
const assert = require("assert");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");

(async function () {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.setContent(read("extensions/safari/popup.html"), { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    const sync = {
      get: (defaults) => Promise.resolve(Object.assign({}, defaults)),
      set: () => Promise.resolve(),
    };
    const state = { nrExtensionStats: { totalWords: 0, totalSessions: 0, lastSessionAt: "", days: [] }, nrSavedReadings: [], nrReadingQueue: [], nrReadingTotals: { date: "", words: 0 }, nrExcludedSites: [], nrSiteColors: {} };
    const local = {
      get: (defaults) => Promise.resolve(Object.assign({}, defaults, state)),
      set: (values) => { Object.assign(state, values); return Promise.resolve(); },
      remove: (keys) => { (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete state[key]); return Promise.resolve(); },
    };
    window.browser = {
      storage: { sync, local, onChanged: { addListener: () => {} } },
      tabs: { query: () => Promise.resolve([{ id: 1, url: "https://example.com/article" }]), sendMessage: () => Promise.resolve({ transformed: false, active: false }), create: () => Promise.resolve() },
      runtime: { lastError: null, getURL: (value) => value, onInstalled: { addListener: () => {} }, onStartup: { addListener: () => {} }, onMessage: { addListener: () => {} } },
      contextMenus: { removeAll: () => Promise.resolve(), create: () => Promise.resolve(), onClicked: { addListener: () => {} } },
    };
    window.chrome = window.browser;
    window.__nrState = state;
  });
  await page.addScriptTag({ content: read("extensions/safari/formula.js") });
  await page.addScriptTag({ content: read("extensions/safari/features.js") });
  await page.addScriptTag({ content: read("extensions/safari/phase3.js") });
  await page.addScriptTag({ content: read("extensions/safari/stats.js") });
  await page.addScriptTag({ content: read("extensions/safari/library.js") });
  await page.addScriptTag({ content: read("extensions/safari/background.js") });
  await page.addScriptTag({ content: read("extensions/safari/popup.js") });

  await page.click("#nr-settings-toggle");
  await page.fill("#pp-input", "Safari keeps local saved readings private.");
  await page.click("#pp-transform");
  assert.ok(await page.locator("#pp-output b").count() > 0, "Safari popup transforms text");
  await page.click("#nr-library-save");
  await page.waitForSelector("#nr-library-list .pp-library-open");
  assert.strictEqual(await page.locator("#nr-library-list .pp-library-open").count(), 1, "Safari popup saves a reading locally");
  await page.click("#nr-library-clear");
  await page.waitForSelector("#nr-library-list .pp-color-help");
  await page.fill("#nr-daily-goal", "1200");
  await page.click("#nr-goal-save");
  await page.waitForFunction(() => /Daily goal saved/.test(document.getElementById("pp-status").textContent));
  await page.click("#nr-preset-export");
  assert.ok((await page.locator("#nr-preset-code").inputValue()).length > 20, "Safari popup exports a preset");
  await page.click("#nr-timer-toggle");
  await page.waitForFunction(() => document.getElementById("nr-timer-toggle").textContent === "Stop");
  await page.click("#nr-timer-toggle");
  await page.check("#nr-clipboard-setting");
  await page.waitForFunction(() => /enabled locally/.test(document.getElementById("pp-status").textContent));
  assert.deepStrictEqual(errors, [], errors.join("; "));
  await browser.close();
  console.log("Phase 32 Safari parity e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
