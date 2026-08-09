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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nr-phase30-"));
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
      window.__nrSettings = {
        ruler: false, rulerSize: 6, rulerDim: 28, rulerStep: 8, rulerLock: false,
        spacing: false, lineHeight: 1.5, letterSpacing: 0.03, wordSpacing: 0.2,
        textScale: 1, progress: false, spotlight: false, motion: false,
      };
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
    await page.waitForFunction(() => document.querySelector("#main-title b, #main-title [data-nr='1']"));

    const before = await page.evaluate(() => ({
      active: document.documentElement.classList.contains("nr-text-scale-active"),
      scale: document.documentElement.style.getPropertyValue("--nr-text-scale"),
      titleText: document.getElementById("main-title").textContent,
    }));
    assert.strictEqual(before.active, false, "text scale starts neutral");
    assert.strictEqual(before.scale, "1", "neutral scale is exposed");

    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, { textScale: 1.25 });
      window.__nrStorageListeners.forEach((listener) => listener({ nrSettings: { oldValue: {}, newValue: window.__nrSettings } }, "sync"));
    });
    await page.waitForFunction(() => document.documentElement.classList.contains("nr-text-scale-active"));
    const active = await page.evaluate(() => ({
      scale: document.documentElement.style.getPropertyValue("--nr-text-scale"),
      titleText: document.getElementById("main-title").textContent,
      inputScale: getComputedStyle(document.getElementById("native-select")).fontSize,
      explicitScale: getComputedStyle(document.getElementById("explicit-size")).fontSize,
      nestedScale: getComputedStyle(document.querySelector("#nested-readable")).fontSize,
      shadowScale: getComputedStyle(document.querySelector("#shadow-host").shadowRoot.querySelector("p")).fontSize,
    }));
    assert.strictEqual(active.scale, "1.25", "text scale updates live");
    assert.strictEqual(active.titleText, before.titleText, "text scale does not rewrite transformed text");
    assert.notStrictEqual(active.inputScale, "20px", "native controls are not forcibly scaled");
    assert.strictEqual(active.explicitScale, "25px", "explicitly sized readable text scales exactly once");
    assert.strictEqual(active.nestedScale, "25px", "nested readable text scales exactly once");
    assert.strictEqual(active.shadowScale, "20px", "open shadow-root reading text scales from the root");

    await page.evaluate(() => {
      document.getElementById("explicit-size").style.setProperty("font-size", "24px");
    });
    await page.waitForTimeout(400);
    const pageChangedSize = await page.locator("#explicit-size").evaluate((node) => getComputedStyle(node).fontSize);
    assert.strictEqual(pageChangedSize, "30px", "page-authored size changes become the new scaled base");

    await page.selectOption("#native-select", "focused");
    assert.strictEqual(await page.locator("#native-select").inputValue(), "focused", "native controls remain usable at scaled text");
    await page.click("#custom-trigger");
    await page.click("#custom-options [role='option'][data-value='dyslexia']");
    assert.strictEqual(await page.locator("#custom-value").textContent(), "Dyslexia", "custom listboxes remain usable at scaled text");

    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, { textScale: 99 });
      window.__nrStorageListeners.forEach((listener) => listener({ nrSettings: { oldValue: {}, newValue: window.__nrSettings } }, "sync"));
    });
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--nr-text-scale") === "1.5");
    assert.strictEqual(await page.locator("html").evaluate((node) => node.style.getPropertyValue("--nr-text-scale")), "1.5", "text scale is capped at 150 percent");

    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, { textScale: 0.1 });
      window.__nrStorageListeners.forEach((listener) => listener({ nrSettings: { oldValue: {}, newValue: window.__nrSettings } }, "sync"));
    });
    await page.waitForFunction(() => document.documentElement.style.getPropertyValue("--nr-text-scale") === "0.85");
    assert.strictEqual(await page.locator("html").evaluate((node) => node.style.getPropertyValue("--nr-text-scale")), "0.85", "text scale is floored at 85 percent");
    assert.deepStrictEqual(errors, [], errors.join("; "));
  } finally {
    await context.close();
    await server.close();
  }
  console.log("Phase 30 text-scale e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
