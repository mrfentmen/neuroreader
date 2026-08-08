"use strict";
const assert = require("assert");
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");
const { startFixtureServer } = require("./fixture-server.js");

(async function () {
  const server = await startFixtureServer(8111);
  const ext = path.resolve(__dirname, "..", "extensions", "chrome");
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "nr-phase5-"));
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

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.fill("#pp-input", "A saved reading remains private on this device.");
    await popup.click("#pp-transform");
    await popup.click("#nr-library-save");
    await popup.waitForSelector(".pp-library-open");
    assert.strictEqual(await popup.locator(".pp-library-open").count(), 1);
    assert.match(await popup.locator("#pp-status").textContent(), /saved on this device/);

    await popup.fill("#pp-input", "changed");
    await popup.click(".pp-library-open");
    assert.strictEqual(await popup.locator("#pp-input").inputValue(), "A saved reading remains private on this device.");
    assert.ok(await popup.locator("#pp-output b").count() > 0);

    await popup.click(".pp-library-remove");
    await popup.waitForSelector("#nr-library-list .pp-color-help");
    assert.strictEqual(await popup.locator(".pp-library-open").count(), 0);

    await popup.fill("#pp-input", "Another saved reading.");
    await popup.click("#pp-transform");
    await popup.click("#nr-library-save");
    await popup.waitForSelector(".pp-library-open");
    await popup.click("#nr-library-clear");
    await popup.waitForSelector("#nr-library-list .pp-color-help");
    assert.strictEqual(await popup.locator(".pp-library-open").count(), 0);
  } finally {
    await context.close();
    await server.close();
  }
  console.log("Phase 5 popup tests passed.");
})().catch((error) => { console.error(error); process.exit(1); });
