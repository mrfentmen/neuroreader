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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nr-phase27-"));
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
      window.__nrSettings = { ruler: true, rulerSize: 6, rulerDim: 28, rulerLock: true, progress: false, spotlight: false, motion: false };
      window.__nrStorageListeners = [];
      window.chrome = {
        storage: {
          sync: {
            get: (defaults, callback) => callback(Object.assign({}, defaults, { nrSettings: window.__nrSettings, nrAuto: false, nrColor: "#dc2626" })),
            set: (values) => { if (values.nrSettings) window.__nrSettings = values.nrSettings; },
          },
          local: {
            get: (defaults, callback) => callback(Object.assign({}, defaults, { nrExcludedSites: [], nrSiteColors: {} })),
            set: () => {},
          },
          onChanged: { addListener: (listener) => window.__nrStorageListeners.push(listener) },
        },
        runtime: { onMessage: { addListener: () => {} } },
      };
    });
    await page.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "formula.js") });
    await page.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "features.js") });
    await page.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "content.js") });
    await page.waitForSelector("#nr-reading-ruler");

    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const center = viewportHeight / 2;
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), `${center}px`, "locked ruler starts centered");

    await page.mouse.move(100, 120);
    await page.waitForTimeout(60);
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), `${center}px`, "pointer movement is ignored while locked");

    await page.evaluate(() => {
      const frame = document.createElement("iframe");
      frame.id = "phase27-frame";
      frame.srcdoc = "<p>Frame text</p>";
      frame.style.cssText = "position:absolute;left:0;top:0;width:200px;height:200px";
      document.body.appendChild(frame);
    });
    await page.waitForSelector("#phase27-frame");
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame() && candidate.url() === "about:srcdoc");
    assert.ok(frame, "test iframe loaded");
    await frame.evaluate(() => {
      window.__nrSettings = { ruler: true, rulerSize: 6, rulerDim: 28, rulerLock: true, progress: false, spotlight: false, motion: false };
      window.__nrStorageListeners = [];
      window.chrome = {
        storage: {
          sync: {
            get: (defaults, callback) => callback(Object.assign({}, defaults, { nrSettings: window.__nrSettings, nrAuto: false, nrColor: "#dc2626" })),
            set: (values) => { if (values.nrSettings) window.__nrSettings = values.nrSettings; },
          },
          local: {
            get: (defaults, callback) => callback(Object.assign({}, defaults, { nrExcludedSites: [], nrSiteColors: {} })),
            set: () => {},
          },
          onChanged: { addListener: (listener) => window.__nrStorageListeners.push(listener) },
        },
        runtime: { onMessage: { addListener: () => {} } },
      };
    });
    await frame.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "formula.js") });
    await frame.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "features.js") });
    await frame.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "content.js") });
    await frame.waitForTimeout(80);
    await frame.evaluate(() => document.dispatchEvent(new MouseEvent("mousemove", { clientY: 120, bubbles: true })));
    await page.waitForTimeout(80);
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), `${center}px`, "child-frame pointer movement is ignored while locked");
    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, { rulerLock: true });
      window.__nrStorageListeners.forEach((listener) => listener({ nrSettings: { oldValue: { ruler: true, rulerLock: true }, newValue: window.__nrSettings } }, "sync"));
      window.postMessage({ source: "neuroreader", type: "nr-ruler-pointer", nonce: "stale", y: 40 }, "*");
    });
    await page.waitForTimeout(60);
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), `${center}px`, "stale frame messages cannot move a locked ruler");

    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true })));
    const step = Math.max(24, Math.round(viewportHeight * 0.08));
    await page.waitForFunction((expected) => document.getElementById("nr-reading-ruler").style.getPropertyValue("--nr-ruler-y") === expected, `${center + step}px`);
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), `${center + step}px`, "keyboard movement remains active while locked");

    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, { rulerLock: false });
      window.__nrStorageListeners.forEach((listener) => listener({ nrSettings: { oldValue: { ruler: true, rulerLock: true }, newValue: window.__nrSettings } }, "sync"));
    });
    await page.waitForTimeout(40);
    await page.evaluate(() => document.dispatchEvent(new MouseEvent("mousemove", { clientY: 120, bubbles: true })));
    await page.waitForTimeout(100);
    const unlockedPosition = await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y"));
    assert.strictEqual(unlockedPosition, "120px", `pointer movement resumes after unlocking (actual ${unlockedPosition})`);

    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, { rulerLock: true });
      window.__nrStorageListeners.forEach((listener) => listener({ nrSettings: { oldValue: { ruler: true, rulerLock: false }, newValue: window.__nrSettings } }, "sync"));
    });
    await page.waitForTimeout(40);
    await page.evaluate(() => document.dispatchEvent(new MouseEvent("mousemove", { clientY: 200, bubbles: true })));
    await page.waitForTimeout(60);
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), "120px", "relocking freezes the current keyboard position");

    assert.deepStrictEqual(errors, [], errors.join("; "));
  } finally {
    await context.close();
    await server.close();
  }
  console.log("Phase 27 ruler-lock e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
