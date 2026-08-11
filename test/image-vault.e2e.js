"use strict";

const assert = require("assert");
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const repositoryExtension = path.join(ROOT, "extensions", "image-vault");
const EXT = repositoryExtension;
let passed = 0;
function ok(name, condition) { assert(condition, name); passed++; console.log("  ✓ " + name); }

async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "lockbox-e2e-"));
  const context = await chromium.launchPersistentContext(profile, { headless: false, args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`] });
  try {
    const extensions = await context.newPage();
    await extensions.goto("chrome://extensions/");
    await extensions.waitForTimeout(500);
    const id = await extensions.evaluate(() => {
      function walk(root) { let ids = []; root.querySelectorAll("extensions-item").forEach((item) => ids.push(item.id)); root.querySelectorAll("*").forEach((item) => { if (item.shadowRoot) ids = ids.concat(walk(item.shadowRoot)); }); return ids.find((value) => value && value.length === 32) || null; }
      return walk(document);
    });
    ok("Lockbox loads in Chromium", !!id);
    const page = await context.newPage();
    await page.goto(`chrome-extension://${id}/app.html`);
    await page.waitForSelector("#unlock-form");
    ok("transparent vault UI renders", (await page.locator("#lock-title").innerText()).includes("Your images") && (await page.locator("#lock-title").innerText()).includes("Your key."));
    ok("top and bottom static ad banners render", await page.locator(".ad-slot").count() === 2 && await page.locator(".top-ad-slot").count() === 1 && await page.locator(".bottom-ad-slot").count() === 1);
    await page.fill("#vault-password", "correct horse battery staple");
    await page.click("#unlock-button");
    await page.waitForSelector("#vault-view:not([hidden])");
    ok("vault creates and unlocks locally", true);
    ok("toolbar action is configured as a popup", await page.evaluate(() => chrome.runtime.getManifest().action.default_popup === "app.html"));
    ok("vault does not expose host permissions", !(await page.evaluate(() => chrome.runtime.getManifest().host_permissions)));
    await page.click("#lock-button");
    await page.waitForSelector("#locked-view:not([hidden])");
    ok("lock control hides decrypted gallery", true);
    await page.fill("#vault-password", "correct horse battery staple");
    await page.click("#unlock-button");
    await page.waitForSelector("#vault-view:not([hidden])");
    ok("same password unlocks stored vault", true);
    await context.close();
    console.log(`\n${passed} passed.`);
  } finally {
    await context.close().catch(() => {});
  }
}

main().catch((error) => { console.error("IMAGE VAULT E2E FAILED:", error); process.exit(1); });
