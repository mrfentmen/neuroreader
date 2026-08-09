"use strict";

const assert = require("assert");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { startFixtureServer } = require("./fixture-server.js");

const ROOT = path.resolve(__dirname, "..");
const URL = "http://127.0.0.1:8111/test/fixtures/hardpage.html";

(async function () {
  const server = await startFixtureServer(8111);
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  try {
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.__nrSettings = { ruler: true, progress: false, spotlight: false, motion: false };
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
    assert.strictEqual(await page.locator("#nr-reading-ruler").getAttribute("aria-hidden"), "true");
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => getComputedStyle(node).pointerEvents), "none");

    await page.mouse.move(320, 280);
    await page.waitForFunction(() => document.getElementById("nr-reading-ruler").style.getPropertyValue("--nr-ruler-y") === "280px");
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), "280px");

    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, { ruler: false });
      window.__nrStorageListeners.forEach((listener) => listener({
        nrSettings: { oldValue: { ruler: true }, newValue: window.__nrSettings },
      }, "sync"));
    });
    await page.waitForTimeout(40);
    assert.strictEqual(await page.locator("#nr-reading-ruler").count(), 0, "turning the setting off removes the ruler");
    assert.deepStrictEqual(errors, [], errors.join("; "));
  } finally {
    await page.close();
    await browser.close();
    await server.close();
  }

  console.log("Phase 24 reading-ruler e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
