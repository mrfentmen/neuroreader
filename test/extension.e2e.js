"use strict";
/*
 * NeuroReader — Chrome extension end-to-end test (Playwright).
 *
 * Loads the unpacked extension into Playwright's bundled Chromium, verifies
 * the injected button transforms a real page and that toggling restores the
 * original text, then exercises the popup (transform + copy + auto-toggle).
 *
 * Why bundled Chromium? Branded Chrome (v137+) disables the
 * --load-extension flag; Playwright's Chromium still honors it.
 *
 * Run with:  npx playwright install chromium   (one time)
 *            node test/extension.e2e.js
 *            (serves a local test page on http://127.0.0.1:8111)
 */
const { chromium } = require("playwright");
const path = require("path");
const os = require("os");
const fs = require("fs");

const EXT = path.resolve(__dirname, "..", "extensions", "chrome");
const URL = "http://127.0.0.1:8111/index.html";

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log("  \u2713 " + name);
  } else {
    failed++;
    console.log("  \u2717 " + name + (detail ? " — " + detail : ""));
  }
}

// Read the extension id from the chrome://extensions shadow DOM.
async function getExtensionId(page) {
  await page.goto("chrome://extensions/");
  await page.waitForTimeout(800);
  return page.evaluate(() => {
    function walk(root) {
      let ids = [];
      for (const el of root.querySelectorAll("extensions-item")) ids.push(el.id);
      for (const el of root.querySelectorAll("*")) {
        if (el.shadowRoot) ids = ids.concat(walk(el.shadowRoot));
      }
      return ids;
    }
    const ids = walk(document);
    return ids.find((i) => i && i.length === 32) || null;
  });
}

async function main() {
  console.log("NeuroReader Chrome extension E2E\n");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nr-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false, // extensions need a real window
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });

  const probe = await context.newPage();
  const extId = await getExtensionId(probe);
  ok("extension loaded in Chromium (id=" + (extId || "?") + ")", !!extId);
  await probe.close();

  // Popup tab first, page tab second — the page tab becomes the active tab,
  // which the popup's "Transform this page" button targets.
  const popup = extId ? await context.newPage() : null;
  if (popup) await popup.goto(`chrome-extension://${extId}/popup.html`);

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForSelector("#nr-launcher", { timeout: 10000 });
  ok("launcher button injected on page", true);
  ok(
    "launcher says 'Transform with NeuroReader'",
    (await page.textContent("#nr-launcher")).includes("Transform with NeuroReader"),
  );

  // --- Transform the page ------------------------------------------------
  await page.click("#nr-launcher");
  await page.waitForFunction(
    () => document.querySelectorAll('[data-nr="1"]').length > 0,
    { timeout: 10000 },
  );
  const spanCount = await page.evaluate(() => document.querySelectorAll('[data-nr="1"]').length);
  const boldCount = await page.evaluate(
    () => document.querySelectorAll('[data-nr="1"] b').length,
  );
  ok("page text transformed (spans=" + spanCount + ", bold tags=" + boldCount + ")",
    spanCount > 3 && boldCount > 20);

  const h1Html = await page.evaluate(() => document.querySelector("h1").innerHTML);
  ok("h1 contains <b> wrappers", /<b>/.test(h1Html), h1Html.slice(0, 60));

  ok("launcher label untouched by transform",
    (await page.textContent("#nr-launcher")) === "Undo NeuroReader");

  // --- Undo ---------------------------------------------------------------
  await page.click("#nr-launcher");
  await page.waitForFunction(
    () => document.querySelectorAll('[data-nr="1"]').length === 0,
    { timeout: 10000 },
  );
  const h1Plain = await page.evaluate(() => document.querySelector("h1").textContent);
  ok("undo restores original text", h1Plain === "NeuroReader", h1Plain);

  // --- Popup: paste-transform + copy --------------------------------------
  if (popup) {
    await popup.fill("#pp-input", "The quick brown fox jumps over the lazy dog.");
    await popup.click("#pp-transform");
    const popupBold = await popup.evaluate(
      () => document.querySelectorAll("#pp-output b").length,
    );
    ok("popup transforms pasted text (bold tags=" + popupBold + ")", popupBold > 10);

    await popup.click("#pp-copy");
    await popup.waitForFunction(
      () => document.getElementById("pp-copy").textContent === "Copied",
      { timeout: 5000 },
    );
    ok("popup copies to clipboard (feedback shown)", true);

    // --- Popup: "Transform this page" messaging path ----------------------
    await page.bringToFront(); // make the page tab the active tab
    await popup.click("#pp-page");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nr="1"]').length > 0,
      { timeout: 10000 },
    );
    ok("popup 'Transform this page' transforms the active tab", true);
    await page.click("#nr-launcher"); // and undo again for the next step
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nr="1"]').length === 0,
      { timeout: 10000 },
    );

    // --- Auto-transform: onChanged applies live, survives reload ----------
    await popup.check("#auto-toggle");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nr="1"]').length > 0,
      { timeout: 10000 },
    );
    ok("auto-transform applies live via storage.onChanged", true);

    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nr="1"]').length > 0,
      { timeout: 10000 },
    );
    ok("auto-transform applies on fresh page load", true);

    await popup.uncheck("#auto-toggle");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nr="1"]').length === 0,
      { timeout: 10000 },
    );
    ok("disabling auto-transform removes bolding on the open page", true);
  }

  ok("no page errors", errors.length === 0, errors.join("; "));

  await context.close();
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
