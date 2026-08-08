"use strict";
/*
 * NeuroReader — Chrome extension end-to-end test (Playwright).
 *
 * Loads the unpacked extension into Playwright's bundled Chromium, verifies
 * that auto-transform (ON by default) transforms a fresh page with no click,
 * that the launcher can still undo/redo, and exercises the popup
 * (transform + copy + auto-toggle).
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
const { startFixtureServer } = require("./fixture-server.js");

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
  const fixtureServer = await startFixtureServer(8111);
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

  // --- Auto-transform is ON by default: no click needed ------------------
  await page.waitForFunction(
    () => document.querySelectorAll('[data-nr="1"]').length > 0,
    { timeout: 10000 },
  );
  const spanCount = await page.evaluate(() => document.querySelectorAll('[data-nr="1"]').length);
  const boldCount = await page.evaluate(
    () => document.querySelectorAll('[data-nr="1"] b').length,
  );
  ok("auto-transform ON by default — page transformed with no click (spans=" + spanCount + ", bold tags=" + boldCount + ")",
    spanCount > 3 && boldCount > 20);

  const h1Html = await page.evaluate(() => document.querySelector("h1").innerHTML);
  ok("h1 contains <b> wrappers", /<b>/.test(h1Html), h1Html.slice(0, 60));

  // Adaptive bolding on a real bold element: the web app's h1 is
  // font-weight 800, so its transformed span must carry data-nr-mode=color
  // (bold-on-bold would be invisible) while a normal <p> stays plain bold.
  const adaptiveState = await page.evaluate(() => {
    const h1Span = document.querySelector("h1 [data-nr=\"1\"]");
    const pSpan = document.querySelector("p [data-nr=\"1\"]");
    return {
      h1Mode: h1Span ? h1Span.getAttribute("data-nr-mode") : null,
      h1Color: h1Span ? h1Span.style.getPropertyValue("--nr-color") : null,
      pMode: pSpan ? pSpan.getAttribute("data-nr-mode") : null,
      h1Weight: window.getComputedStyle(document.querySelector("h1")).fontWeight,
    };
  });
  ok(
    "h1 (weight " + adaptiveState.h1Weight + ") gets color mode: " + adaptiveState.h1Mode,
    adaptiveState.h1Mode === "color" && !!adaptiveState.h1Color,
  );
  ok(
    "body paragraph keeps plain bold mode: " + adaptiveState.pMode,
    adaptiveState.pMode === null || adaptiveState.pMode === "bold",
  );

  ok("launcher label reflects active state",
    (await page.textContent("#nr-launcher")) === "Undo NeuroReader");

  // --- Undo via the launcher (still works while auto is on) ----------------
  await page.click("#nr-launcher");
  await page.waitForFunction(
    () => document.querySelectorAll('[data-nr="1"]').length === 0,
    { timeout: 10000 },
  );
  const h1Plain = await page.evaluate(() => document.querySelector("h1").textContent);
  ok("undo restores original text", h1Plain === "NeuroReader", h1Plain);

  // --- Manual transform via the launcher still works ----------------------
  await page.click("#nr-launcher");
  await page.waitForFunction(
    () => document.querySelectorAll('[data-nr="1"]').length > 0,
    { timeout: 10000 },
  );
  ok("launcher click still transforms manually", true);
  await page.click("#nr-launcher"); // undo again for the popup section
  await page.waitForFunction(
    () => document.querySelectorAll('[data-nr="1"]').length === 0,
    { timeout: 10000 },
  );

  // --- Popup: paste-transform + copy --------------------------------------
  if (popup) {
    // Chrome-owned pages cannot receive content scripts. The popup should
    // explain the boundary and disable page actions instead of presenting a
    // misleading reload error.
    const chromeUi = await context.newPage();
    await chromeUi.goto("chrome://settings/", { waitUntil: "domcontentloaded" }).catch(() => {});
    await chromeUi.bringToFront();
    await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForFunction(
      () => document.getElementById("pp-page").disabled === true && /protects its own pages/i.test(document.getElementById("pp-status").textContent),
      { timeout: 5000 },
    );
    ok("popup explains Chrome-owned pages cannot be transformed", true);
    await chromeUi.close();

    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForSelector("#nr-launcher", { timeout: 10000 });
    await page.click("#nr-launcher");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nr="1"]').length === 0,
      { timeout: 10000 },
    );
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
    // With auto ON the page may already be transformed, so the popup button
    // must be state-aware: it labels itself by the CURRENT page state and can
    // never invert (no "Transform" click that silently removes bolding).
    // Re-open the popup with the page tab active so refreshPageButton()
    // queries the real page state (the page is untransformed here).
    await page.bringToFront(); // make the page tab the active tab
    if (popup) await popup.goto(`chrome-extension://${extId}/popup.html`);
    await popup.waitForFunction(
      () => document.getElementById("pp-page").textContent === "Transform this page",
      { timeout: 5000 },
    );
    ok("popup button labels current (untransformed) state", true);
    await popup.click("#pp-page");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nr="1"]').length > 0,
      { timeout: 10000 },
    );
    ok("popup 'Transform this page' transforms the active tab", true);
    await popup.waitForFunction(
      () => document.getElementById("pp-page").textContent === "Undo this page",
      { timeout: 5000 },
    );
    ok("popup button relabels to 'Undo this page' after transforming", true);

    // --- Fixation color picker: preset updates existing + future spans -----
    await popup.click('.pp-swatch[data-color="#2563eb"]');
    await page.waitForFunction(
      () => {
        const span = document.querySelector('[data-nr="1"]');
        const b = span && span.querySelector("b");
        return span && span.style.getPropertyValue("--nr-color") === "rgb(37,99,235)" && b && getComputedStyle(b).color.replace(/\s/g, "") === "rgb(37,99,235)";
      },
      { timeout: 10000 },
    );
    ok("color picker changes existing fixation letters to blue", true);
    await page.evaluate(() => {
      const node = document.createElement("p");
      node.textContent = "New content uses the selected color.";
      document.body.appendChild(node);
    });
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('[data-nr="1"]')).some((span) => span.style.getPropertyValue("--nr-color") === "rgb(37,99,235)"),
      { timeout: 10000 },
    );
    ok("selected color applies to sticky late content", true);
    await popup.reload();
    await popup.waitForFunction(
      () => document.getElementById("nr-color").value === "#2563eb",
      { timeout: 5000 },
    );
    ok("selected color persists when the popup reopens", true);
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(
      () => {
        const span = document.querySelector('[data-nr="1"]');
        const b = span && span.querySelector("b");
        return span && span.style.getPropertyValue("--nr-color") === "rgb(37,99,235)" && b && getComputedStyle(b).color.replace(/\s/g, "") === "rgb(37,99,235)";
      },
      { timeout: 10000 },
    );
    ok("selected color applies after a fresh page load", true);

    // LEAVE THE PAGE TRANSFORMED — the auto-toggle uncheck below must be the
    // thing that removes bolding, or its assertion proves nothing.

    // --- Auto-transform toggle: default ON, uncheck/check round-trips -----
    await popup.waitForFunction(
      () => document.getElementById("auto-toggle").checked,
      { timeout: 5000 },
    );
    ok("auto-toggle checkbox reflects default ON", true);

    // Turn it OFF first (it starts ON): bolding must leave the open page.
    await popup.uncheck("#auto-toggle");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nr="1"]').length === 0,
      { timeout: 10000 },
    );
    ok("turning auto OFF removes bolding on the open page", true);

    // Turn it back ON: applies live via storage.onChanged.
    await popup.check("#auto-toggle");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nr="1"]').length > 0,
      { timeout: 10000 },
    );
    ok("auto-transform applies live via storage.onChanged", true);

    // Fresh page load while auto is ON: transforms with no click.
    await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nr="1"]').length > 0,
      { timeout: 10000 },
    );
    ok("auto-transform applies on fresh page load (no click)", true);

    // Final uncheck leaves everything clean for the "no errors" check.
    await popup.uncheck("#auto-toggle");
    await page.waitForFunction(
      () => document.querySelectorAll('[data-nr="1"]').length === 0,
      { timeout: 10000 },
    );
  }

  ok("no page errors", errors.length === 0, errors.join("; "));

  await context.close();
  await fixtureServer.close();
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
