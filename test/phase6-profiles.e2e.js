"use strict";
const assert = require("assert");
const { chromium } = require("playwright");
const path = require("path");
const fs = require("fs");

(async function () {
  const ext = path.resolve(__dirname, "..", "extensions", "chrome");
  const dir = fs.mkdtempSync(path.join(require("os").tmpdir(), "nr-phase6-"));
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
    await popup.setViewportSize({ width: 1280, height: 2200 });
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.click("#nr-settings-toggle");
    await popup.selectOption("#nr-profile", "adhd");
    await popup.waitForFunction(() => document.querySelector("[data-setting='progress']").checked && document.querySelector("[data-setting='spotlight']").checked);
    await popup.selectOption("#nr-profile", "custom");
    await popup.waitForFunction(() => !document.querySelector("[data-setting='progress']").checked && !document.querySelector("[data-setting='spotlight']").checked);
    await popup.fill("#pp-input", "Profile changes refresh transformed text immediately.");
    await popup.click("#pp-transform");
    await popup.selectOption("#nr-profile", "dyslexia");
    await popup.waitForFunction(() => document.querySelector("#pp-output").innerHTML.includes("linear-gradient"));
    assert.match(await popup.locator("#pp-status").textContent(), /profile updated locally/);

    await popup.reload();
    await popup.click("#nr-settings-toggle");
    assert.strictEqual(await popup.locator("#nr-profile").inputValue(), "dyslexia");
    assert.strictEqual(await popup.locator("[data-setting='gradient']").isChecked(), true);
    assert.strictEqual(await popup.locator("[data-setting='sentence']").isChecked(), true);

    await popup.fill("#nr-preset-code", "eyJwcm9maWxlIjoiY3VzdG9tIiwiZ3JhZGllbnQiOmZhbHNlfQ==");
    await popup.click("#nr-preset-import");
    await popup.waitForFunction(() => document.querySelector("#nr-profile").value === "custom");
  } finally {
    await context.close();
  }
  console.log("Phase 6 profile e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
