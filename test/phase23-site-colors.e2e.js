"use strict";

const assert = require("assert");
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const os = require("os");
const { startFixtureServer } = require("./fixture-server.js");

(async function () {
  const server = await startFixtureServer(8111);
  const extension = path.resolve(__dirname, "..", "extensions", "chrome");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nr-phase23-"));
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  try {
    const extensionsPage = await context.newPage();
    await extensionsPage.goto("chrome://extensions/");
    await extensionsPage.waitForTimeout(700);
    const id = await extensionsPage.evaluate(() => {
      function walk(root) {
        let ids = [];
        for (const item of root.querySelectorAll("extensions-item")) ids.push(item.id);
        for (const element of root.querySelectorAll("*")) if (element.shadowRoot) ids = ids.concat(walk(element.shadowRoot));
        return ids;
      }
      return walk(document).find((value) => /^[a-z]{32}$/.test(value));
    });
    assert.ok(id, "Chrome extension loaded");

    const page = await context.newPage();
    await page.goto("http://127.0.0.1:8111/index.html", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#nr-launcher");
    await page.waitForFunction(() => document.querySelectorAll('[data-nr="1"]').length > 0);

    const popup = await context.newPage();
    await popup.setViewportSize({ width: 1280, height: 2200 });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.waitForSelector("#nr-site-color-save");
    await page.bringToFront();
    await popup.locator("#nr-site-color").fill("#2563eb");
    await popup.click("#nr-site-color-save");
    await popup.waitForFunction(() => /saved for 127\.0\.0\.1/.test(document.getElementById("pp-status").textContent));

    const stored = await popup.evaluate(() => new Promise((resolve) => {
      chrome.storage.local.get({ nrSiteColors: {} }, (data) => resolve(data.nrSiteColors));
    }));
    assert.deepStrictEqual(stored, { "127.0.0.1": "#2563eb" });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelectorAll('[data-nr="1"] b').length > 0);
    const color = await page.locator('[data-nr="1"] b').first().evaluate((element) => getComputedStyle(element).color);
    assert.strictEqual(color, "rgb(37, 99, 235)", "site color reaches transformed fixation letters");
  } finally {
    await context.close();
    await server.close();
  }
  console.log("Phase 23 site-color e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
