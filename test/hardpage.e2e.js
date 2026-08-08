"use strict";
/*
 * NeuroReader — "hard page" e2e (SPA / YouTube-style failure modes)
 *
 * Loads the extension into Playwright's bundled Chromium and drives the
 * test/fixtures/hardpage.html fixture, which reproduces exactly why parts
 * of YouTube didn't transform:
 *
 *   1. sidebar items injected AFTER the user clicks Transform  (sticky fix)
 *   2. the whole sidebar recycled/replaced (virtualized list)  (sticky fix)
 *   3. a text node rewritten in place                            (characterData)
 *   4. text inside an open shadow root                           (shadow fix)
 *
 * Run with:  npx playwright install chromium   (one time)
 *            node test/hardpage.e2e.js
 *            (serves the repo on http://127.0.0.1:8111)
 */
const { chromium } = require("playwright");
const path = require("path");
const os = require("os");
const fs = require("fs");

const EXT = path.resolve(__dirname, "..", "extensions", "chrome");
const URL = "http://127.0.0.1:8111/test/fixtures/hardpage.html";

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
  console.log("NeuroReader hard-page e2e (SPA failure modes)\n");
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "nr-hard-"));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  });

  const probe = await context.newPage();
  const extId = await getExtensionId(probe);
  ok("extension loaded (id=" + (extId || "?") + ")", !!extId);
  await probe.close();

  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 15000 });
  await page.waitForSelector("#nr-launcher", { timeout: 10000 });

  // Auto-transform is ON by default: the page is already transformed on
  // load — BEFORE the sidebar items exist, like on YouTube. No click needed.
  await page.waitForFunction(
    () => document.querySelector("#main-title").querySelector('b, [data-nr="1"]') !== null,
    { timeout: 10000 },
  );
  ok("main title auto-transformed on load (no click)", true);

  const bolded = (sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return false;
      return el.querySelector('b, [data-nr="1"]') !== null;
    }, sel);

  // 1. Late-rendered sidebar items must be caught by the sticky watcher.
  await page.waitForFunction(
    () => document.querySelectorAll("#sidebar .sidebar-item").length === 3,
    { timeout: 8000 },
  );
  await page.waitForFunction(
    () => {
      const items = document.querySelectorAll("#sidebar .sidebar-item");
      return (
        items.length === 3 &&
        Array.from(items).every((el) => el.querySelector('b, [data-nr="1"]') !== null)
      );
    },
    { timeout: 8000 },
  );
  ok("late-rendered sidebar items transformed (sticky)", true);

  // 2. Recycled sidebar content must be re-transformed.
  await page.waitForFunction(
    () => document.querySelectorAll("#sidebar .sidebar-item").length === 2,
    { timeout: 8000 },
  );
  await page.waitForFunction(
    () => {
      const items = document.querySelectorAll("#sidebar .sidebar-item");
      return (
        items.length === 2 &&
        Array.from(items).every((el) => el.querySelector('b, [data-nr="1"]') !== null)
      );
    },
    { timeout: 8000 },
  );
  ok("recycled sidebar content re-transformed", true);

  // 3. In-place text rewrite (characterData) must be transformed.
  await page.waitForFunction(
    () => document.getElementById("inplace").textContent.includes("rewritten in place"),
    { timeout: 8000 },
  );
  await page.waitForFunction(
    () =>
      document
        .getElementById("inplace")
        .querySelector('b, [data-nr="1"]') !== null,
    { timeout: 8000 },
  );
  ok("in-place rewritten text transformed (characterData)", true);

  // 4. Text inside the open shadow root must be transformed.
  await page.waitForFunction(
    () => {
      const sr = document.getElementById("shadow-host").shadowRoot;
      return sr && sr.querySelector('b, [data-nr="1"]') !== null;
    },
    { timeout: 8000 },
  );
  ok("shadow-root text transformed (shadow walker)", true);

  // 5. Late content APPENDED INSIDE an open shadow root after transform
  //    (chat feed) must be caught by the per-shadow-root observer.
  await page.waitForFunction(
    () => {
      const sr = document.getElementById("shadow-live").shadowRoot;
      if (!sr) return false;
      const chat = sr.getElementById("chat");
      return chat && chat.querySelectorAll("p").length === 3;
    },
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () => {
      const sr = document.getElementById("shadow-live").shadowRoot;
      return sr && sr.querySelectorAll('[data-nr="1"]').length === 3;
    },
    { timeout: 15000 },
  );
  ok("late content inside shadow root transformed (per-shadow-root observer)", true);

  // 6. A shadow root attached to a NEW element AFTER transform (SPA upgrade)
  //    must be discovered, watched, and transformed. Note: the element does
  //    not exist until the fixture inserts it — predicates must be null-safe
  //    (Playwright aborts waitForFunction if the predicate throws).
  await page.waitForFunction(
    () => {
      const el = document.getElementById("shadow-late-host");
      return el !== null && el.shadowRoot !== null;
    },
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () => {
      const el = document.getElementById("shadow-late-host");
      const sr = el && el.shadowRoot;
      return sr !== null && sr.querySelector('[data-nr="1"]') !== null;
    },
    { timeout: 15000 },
  );
  ok("shadow root attached after transform discovered + transformed", true);

  // 6b. A shadow root attached to a PRE-EXISTING element fires no light-DOM
  //     mutation — the watcher must discover it via the periodic discovery
  //     poll (this Chromium build has no shadowrootattached event).
  await page.waitForFunction(
    () => {
      const el = document.getElementById("shadow-upgrade-host");
      return el !== null && el.shadowRoot !== null;
    },
    { timeout: 15000 },
  );
  await page.waitForFunction(
    () => {
      const el = document.getElementById("shadow-upgrade-host");
      const sr = el && el.shadowRoot;
      return sr !== null && sr.querySelector('[data-nr="1"]') !== null;
    },
    { timeout: 15000 },
  );
  ok("pre-existing-host shadow root discovered (discovery poll)", true);

  // 7. Undo must remove everything, including all shadow + late content.
  await page.click("#nr-launcher");
  await page.waitForFunction(
    () => document.querySelectorAll('[data-nr="1"]').length === 0,
    { timeout: 10000 },
  );
  const shadowStillTransformed = await page.evaluate(() => {
    const ids = ["shadow-host", "shadow-live", "shadow-late-host", "shadow-upgrade-host"];
    return ids.some((id) => {
      const el = document.getElementById(id);
      const sr = el && el.shadowRoot;
      return sr ? sr.querySelector('[data-nr="1"]') !== null : false;
    });
  });
  ok("undo clears all spans incl. every shadow root", !shadowStillTransformed);

  ok("no page errors", errors.length === 0, errors.join("; "));

  await context.close();
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("E2E FAILED:", e.message);
  process.exit(1);
});
