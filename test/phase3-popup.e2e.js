"use strict";
const assert = require("assert");
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const { startFixtureServer } = require("./fixture-server.js");

(async function () {
  const server = await startFixtureServer(8111);
  const ext = path.resolve(__dirname, "..", "extensions", "chrome");
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "nr-phase3-"));
  const context = await chromium.launchPersistentContext(dir, { headless: false, args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`] });
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
  const popup = await context.newPage();
  await popup.goto(`chrome-extension://${id}/popup.html`);
  await popup.fill("#pp-input", "NeuroReader makes local reading easier.");
  await popup.click("#pp-transform");
  assert.ok(await popup.locator("#pp-output b").count() > 5);
  await popup.click("#nr-export-md");
  assert.match(await popup.locator("#pp-status").textContent(), /downloaded locally/);
  await popup.fill("#nr-timer-minutes", "1");
  await popup.click("#nr-timer-toggle");
  assert.strictEqual(await popup.locator("#nr-timer-toggle").textContent(), "Stop");
  await popup.click("#nr-timer-toggle");
  assert.strictEqual(await popup.locator("#nr-timer-toggle").textContent(), "Start");
  await popup.check("#nr-clipboard-setting");
  assert.match(await popup.locator("#pp-status").textContent(), /enabled locally/);
  await popup.click("#nr-share-snippet");
  await popup.waitForFunction(() => /Formatted snippet shared or copied|Sharing was unavailable/.test(document.getElementById("pp-status").textContent));

  await popup.evaluate(() => new Promise((resolve) => chrome.storage.local.set({
    nrPendingText: { kind: "selection", text: "A selected sentence is ready.", at: Date.now() },
  }, resolve)));
  await popup.goto(`chrome-extension://${id}/popup.html?pending=1`);
  await popup.waitForFunction(() => document.getElementById("pp-input").value === "A selected sentence is ready.");
  assert.ok(await popup.locator("#pp-output b").count() > 0, "pending selection transforms in popup");
  const pendingStorage = await popup.evaluate(() => new Promise((resolve) => chrome.storage.local.get({ nrPendingText: null }, (data) => resolve(data.nrPendingText))));
  assert.strictEqual(pendingStorage, null, "pending selection is consumed locally");

  await context.close();
  await server.close();
  console.log("Phase 3 popup e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
