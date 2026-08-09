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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nr-phase25-"));
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const errors = [];
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

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.waitForSelector("#nr-ruler-size", { state: "attached" });
    await popup.locator("#nr-settings-toggle").click();
    await popup.locator("#nr-ruler-size").waitFor({ state: "visible" });
    await popup.evaluate(() => new Promise((resolve) => chrome.storage.sync.set({
      nrAuto: false,
      nrSettings: { ruler: true, rulerSize: 6, rulerDim: 28 },
    }, resolve)));
    await popup.locator("#nr-ruler-size").fill("10");
    await popup.locator("#nr-ruler-size").dispatchEvent("change");
    await popup.locator("#nr-ruler-dim").fill("55");
    await popup.locator("#nr-ruler-dim").dispatchEvent("change");
    const popupSettings = await popup.evaluate(() => new Promise((resolve) => {
      chrome.storage.sync.get({ nrSettings: {} }, (data) => resolve(data.nrSettings));
    }));
    assert.strictEqual(Number(popupSettings.rulerSize), 10, "ruler size range writes to sync settings");
    assert.strictEqual(Number(popupSettings.rulerDim), 55, "dimming range writes to sync settings");

    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("#nr-launcher");
    await popup.evaluate(() => new Promise((resolve) => chrome.storage.sync.set({
      nrSettings: { ruler: true, rulerSize: 10, rulerDim: 55 },
    }, resolve)));
    await page.waitForSelector("#nr-reading-ruler", { state: "attached" });
    await page.waitForFunction(() => {
      const node = document.getElementById("nr-reading-ruler");
      return node && node.style.getPropertyValue("--nr-ruler-half") === "5rem" && node.style.getPropertyValue("--nr-ruler-dim") === "0.55";
    });
    assert.deepStrictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => ({
      half: node.style.getPropertyValue("--nr-ruler-half"),
      dim: node.style.getPropertyValue("--nr-ruler-dim"),
    })), { half: "5rem", dim: "0.55" });

    await popup.evaluate(() => new Promise((resolve) => chrome.storage.sync.set({
      nrSettings: { ruler: true, rulerSize: 12, rulerDim: 65 },
    }, resolve)));
    await page.waitForFunction(() => {
      const node = document.getElementById("nr-reading-ruler");
      return node && node.style.getPropertyValue("--nr-ruler-half") === "6rem" && node.style.getPropertyValue("--nr-ruler-dim") === "0.65";
    });
    assert.deepStrictEqual(errors, [], errors.join("; "));
  } finally {
    await context.close();
    await server.close();
  }

  console.log("Phase 25 ruler-controls e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
