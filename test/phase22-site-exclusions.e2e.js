"use strict";

const assert = require("assert");
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { startFixtureServer } = require("./fixture-server.js");

(async function () {
  const server = await startFixtureServer(8111);
  const ext = path.resolve(__dirname, "..", "extensions", "chrome");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nr-phase22-"));
  const context = await chromium.launchPersistentContext(dir, {
    headless: false,
    args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`],
  });
  try {
    const probe = await context.newPage();
    await probe.goto("chrome://extensions/");
    await probe.waitForTimeout(800);
    const id = await probe.evaluate(() => {
      function walk(root) {
        let ids = [];
        for (const item of root.querySelectorAll("extensions-item")) ids.push(item.id);
        for (const element of root.querySelectorAll("*")) {
          if (element.shadowRoot) ids = ids.concat(walk(element.shadowRoot));
        }
        return ids;
      }
      return walk(document).find((value) => /^[a-z]{32}$/.test(value)) || null;
    });
    assert.ok(id, "Chrome extension loaded");

    const page = await context.newPage();
    await page.goto("http://127.0.0.1:8111/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#nr-launcher");
    await page.waitForFunction(() => document.querySelectorAll('[data-nr="1"]').length > 0);

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 1280, height: 2200 });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.waitForFunction(() => document.getElementById("nr-site-list"));
    // A real extension popup is opened while the page tab remains the active
    // target. Keep that target active in this standalone popup-page harness.
    await page.bringToFront();
    await popup.click("#nr-site-add");
    await popup.waitForFunction(() => /127\.0\.0\.1/.test(document.getElementById("pp-status").textContent));

    const stored = await popup.evaluate(() => new Promise((resolve) => {
      chrome.storage.local.get({ nrExcludedSites: [] }, (data) => resolve(data.nrExcludedSites));
    }));
    assert.deepStrictEqual(stored, ["127.0.0.1"], "blank input stores the active tab hostname locally");
    assert.strictEqual(await popup.locator("#nr-site-list .pp-site-item").count(), 1);

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#nr-launcher");
    await page.waitForTimeout(800);
    assert.strictEqual(await page.locator('[data-nr="1"]').count(), 0, "excluded host stays untouched on fresh load");

    await popup.click("#nr-site-list .pp-library-remove");
    await popup.waitForFunction(() => /removed/.test(document.getElementById("pp-status").textContent));
    const afterRemove = await popup.evaluate(() => new Promise((resolve) => {
      chrome.storage.local.get({ nrExcludedSites: [] }, (data) => resolve(data.nrExcludedSites));
    }));
    assert.deepStrictEqual(afterRemove, [], "removing an exclusion clears local storage");

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForSelector("#nr-launcher");
    await page.waitForFunction(() => document.querySelectorAll('[data-nr="1"]').length > 0);
  } finally {
    await context.close();
    await server.close();
  }
  console.log("Phase 22 site-exclusion e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
