"use strict";

const assert = require("assert");
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startFixtureServer } = require("./fixture-server.js");

const ROOT = path.resolve(__dirname, "..");
const URL = "http://127.0.0.1:8111/test/fixtures/hardpage.html";

(async function () {
  const server = await startFixtureServer(8111);
  const extension = path.join(ROOT, "extensions", "chrome");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nr-phase28-"));
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const errors = [];
  try {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.__nrSettings = { ruler: true, rulerSize: 6, rulerDim: 28, rulerStep: 8, rulerLock: false, progress: false, spotlight: false, motion: false };
      window.__nrStorageListeners = [];
      window.chrome = {
        storage: {
          sync: {
            get: (defaults, callback) => callback(Object.assign({}, defaults, { nrSettings: window.__nrSettings, nrAuto: false, nrColor: "#dc2626" })),
            set: (values) => { if (values.nrSettings) window.__nrSettings = values.nrSettings; },
          },
          local: { get: (defaults, callback) => callback(Object.assign({}, defaults, { nrExcludedSites: [], nrSiteColors: {} })), set: () => {} },
          onChanged: { addListener: (listener) => window.__nrStorageListeners.push(listener) },
        },
        runtime: { onMessage: { addListener: () => {} } },
      };
    });
    await page.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "formula.js") });
    await page.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "features.js") });
    await page.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "content.js") });
    await page.waitForSelector("#nr-reading-ruler");

    const height = await page.evaluate(() => window.innerHeight);
    const center = height / 2;
    const stylePosition = () => page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y"));
    assert.strictEqual(await stylePosition(), `${center}px`, "ruler starts centered");

    await page.keyboard.press("Alt+ArrowDown");
    const defaultStep = Math.max(24, Math.round(height * 0.08));
    assert.strictEqual(await stylePosition(), `${center + defaultStep}px`, "default keyboard step is eight percent");

    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, { rulerStep: 16 });
      window.__nrStorageListeners.forEach((listener) => listener({ nrSettings: { oldValue: { rulerStep: 8 }, newValue: window.__nrSettings } }, "sync"));
    });
    await page.keyboard.press("Alt+ArrowUp");
    const largeStep = Math.max(24, Math.round(height * 0.16));
    assert.strictEqual(await stylePosition(), `${center + defaultStep - largeStep}px`, "live setting increases keyboard movement");

    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, { rulerStep: 99 });
      window.__nrStorageListeners.forEach((listener) => listener({ nrSettings: { oldValue: { rulerStep: 16 }, newValue: window.__nrSettings } }, "sync"));
    });
    await page.keyboard.press("Alt+Home");
    await page.keyboard.press("Alt+ArrowDown");
    const cappedStep = Math.max(24, Math.round(height * 0.20));
    assert.strictEqual(await stylePosition(), `${cappedStep}px`, "keyboard movement is capped at twenty percent");

    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, { rulerStep: -4 });
      window.__nrStorageListeners.forEach((listener) => listener({ nrSettings: { oldValue: { rulerStep: 99 }, newValue: window.__nrSettings } }, "sync"));
    });
    await page.keyboard.press("Alt+Home");
    await page.keyboard.press("Alt+ArrowDown");
    const minimumStep = Math.max(24, Math.round(height * 0.02));
    assert.strictEqual(await stylePosition(), `${minimumStep}px`, "keyboard movement is floored at two percent");
    assert.deepStrictEqual(errors, [], errors.join("; "));
  } finally {
    await context.close();
    await server.close();
  }
  console.log("Phase 28 ruler-speed e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
