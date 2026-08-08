"use strict";
/*
 * NeuroReader — DOM-level e2e checks in real Firefox
 *
 * Playwright's bundled Firefox cannot load extensions (verified empirically:
 * no extension API in the Firefox launcher, pre-installed XPIs never register
 * in extensions.json, about:debugging crashes the Juggler context). The
 * Chromium build runs the extension for real; here we prove the SAME shipped
 * files — formula.js + content.js, byte-identical across chrome/firefox/safari
 * (only the manifests differ) — behave correctly inside Firefox's engine:
 * real SpiderMonkey, real DOM, real MutationObserver, real Shadow DOM.
 *
 * We load the two files into a normal Firefox page with a tiny chrome.* stub
 * (storage + runtime.onMessage — the only extension APIs content.js touches),
 * then run the hardpage failure-mode checks and the extension e2e flow
 * (launcher, popup messaging, auto-toggle round-trip, compound-word
 * segmentation) against that DOM.
 *
 * The stub lives in the page's MAIN world (via addScriptTag), same world the
 * two shipped files are injected into — exactly what makes this work, since
 * both must share window.chrome. A real extension runs content.js in an
 * isolated world, but the DOM behaviors under test (transform, sticky,
 * shadow roots, undo) are identical either way.
 *
 * What this does NOT prove: the MV2 manifest bootstrap (covered separately by
 * test/firefox.e2e.js: web-ext lint + real addon install via web-ext run).
 * Full extension DOM e2e in Firefox needs a real Firefox + geckodriver or
 * about:debugging by hand.
 *
 * Run with:  node test/firefox-dom.e2e.js
 *            (serves the repo on http://127.0.0.1:8111)
 */
const { firefox } = require("playwright");
const path = require("path");
const os = require("os");
const fs = require("fs");

const EXT = path.resolve(__dirname, "..", "extensions", "firefox");
const FORMULA_SRC = fs.readFileSync(path.join(EXT, "formula.js"), "utf8");
const CONTENT_SRC = fs.readFileSync(path.join(EXT, "content.js"), "utf8");
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

/**
 * Install content.js into a page with a chrome.* stub that records the
 * storage.onChanged and runtime.onMessage listeners so the harness can drive
 * them exactly like the real popup does. Auto-transform defaults ON.
 */
async function bootContentScript(page) {
  await page.evaluate(() => {
    const listeners = { changed: null, message: null };
    window.__nrListeners = listeners;
    window.chrome = {
      storage: {
        sync: {
          // Deliberately always reports nrAuto:true (fresh-install default)
          // regardless of the `defaults` arg — content.js reads it on boot.
          get: (defaults, cb) => cb({ nrAuto: true }),
          // Fires onChanged SYNCHRONOUSLY (the real API does it async). This
          // is deliberate: it makes the auto-toggle round-trip deterministic.
          set: (obj) => {
            if (obj && "nrAuto" in obj && listeners.changed) {
              listeners.changed({ nrAuto: { newValue: obj.nrAuto } }, "sync");
            }
          },
        },
        onChanged: { addListener: (fn) => (listeners.changed = fn) },
      },
      runtime: {
        onMessage: { addListener: (fn) => (listeners.message = fn) },
        lastError: null,
      },
    };
  });
  // formula.js defines window.NeuroReader; content.js then transforms on load
  // (nrAuto defaults true in the stub) and injects the launcher.
  await page.addScriptTag({ content: FORMULA_SRC });
  await page.addScriptTag({ content: CONTENT_SRC });
  // NeuroReader is an object ({transform, boldCountFor, escapeHTML}), not a
  // function — just confirm it exposed the formula. The stub's sync get
  // callback runs synchronously, so content.js's setAuto(true) has already
  // applied by the time this resolves; the spans>0 waits below are the real
  // gate either way.
  await page.waitForFunction(() => !!window.NeuroReader, { timeout: 5000 });
}

async function main() {
  console.log("NeuroReader DOM-level e2e in real Firefox\n");

  const context = await firefox.launchPersistentContext(
    fs.mkdtempSync(path.join(os.tmpdir(), "nr-ffdom-")),
    { headless: false, viewport: { width: 1280, height: 900 } },
  );
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console.error: " + m.text());
  });

  await page.goto(URL, { waitUntil: "domcontentloaded", timeout: 20000 });
  await bootContentScript(page);

  // ---- Launcher + auto-transform on load (no click) ---------------------
  await page.waitForFunction(
    () => document.getElementById("nr-launcher") !== null,
    { timeout: 10000 },
  );
  ok("launcher button injected in Firefox", true);
  await page.waitForFunction(
    () => document.querySelectorAll('[data-nr="1"]').length > 0,
    { timeout: 10000 },
  );
  const spanCount = await page.evaluate(
    () => document.querySelectorAll('[data-nr="1"]').length,
  );
  // The fixture's initial static content is 3 blocks (title, description,
  // inplace paragraph) — that IS the full transform of the page at load.
  ok("auto-transform ON by default — page transformed with no click (spans=" + spanCount + ")", spanCount >= 3);

  const mainTitleBolded = await page.evaluate(() =>
    document.querySelector("#main-title")
      ? document.querySelector("#main-title").querySelector('b, [data-nr="1"]') !== null
      : false,
  );
  ok("main title auto-transformed on load", mainTitleBolded);

  // ---- Sticky: late-rendered sidebar items ------------------------------
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

  // ---- Sticky: recycled sidebar content ----------------------------------
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

  // ---- characterData: in-place rewrite ------------------------------------
  await page.waitForFunction(
    () => document.getElementById("inplace").textContent.includes("rewritten in place"),
    { timeout: 8000 },
  );
  await page.waitForFunction(
    () =>
      document.getElementById("inplace").querySelector('b, [data-nr="1"]') !== null,
    { timeout: 8000 },
  );
  ok("in-place rewritten text transformed (characterData)", true);

  // ---- Shadow DOM: text inside an open shadow root ------------------------
  await page.waitForFunction(
    () => {
      const sr = document.getElementById("shadow-host").shadowRoot;
      return sr && sr.querySelector('b, [data-nr="1"]') !== null;
    },
    { timeout: 8000 },
  );
  ok("shadow-root text transformed (shadow walker)", true);

  // ---- Per-shadow-root observer: late content inside shadow root ----------
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

  // ---- Late-attached shadow roots (SPA upgrade + pre-existing host) -------
  await page.waitForFunction(
    () => {
      const el = document.getElementById("shadow-late-host");
      const sr = el && el.shadowRoot;
      return sr && sr.querySelector('[data-nr="1"]') !== null;
    },
    { timeout: 15000 },
  );
  ok("shadow root attached after transform discovered + transformed", true);

  await page.waitForFunction(
    () => {
      const el = document.getElementById("shadow-upgrade-host");
      const sr = el && el.shadowRoot;
      return sr && sr.querySelector('[data-nr="1"]') !== null;
    },
    { timeout: 15000 },
  );
  ok("pre-existing-host shadow root discovered (discovery poll)", true);

  // ---- Adaptive bolding: already-bold text gets the color formula ---------
  const adaptive = await page.evaluate(() => {
    const mode = (id) => {
      const el = document.getElementById(id);
      if (!el) return null;
      const span = el.querySelector('[data-nr="1"]');
      return span ? span.getAttribute("data-nr-mode") : null;
    };
    const colorVar = (id) => {
      const el = document.getElementById(id);
      const span = el && el.querySelector('[data-nr="1"]');
      return span ? span.style.getPropertyValue("--nr-color") : null;
    };
    const bWeight = (id) => {
      const el = document.getElementById(id);
      const b = el && el.querySelector('[data-nr="1"] b');
      return b ? window.getComputedStyle(b).fontWeight : null;
    };
    const parentWeight = (id) => {
      const el = document.getElementById(id);
      return el ? window.getComputedStyle(el).fontWeight : null;
    };
    const lum = (c) => {
      const m = c.match(/rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/);
      if (!m) return null;
      return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
    };
    const shadeOf = (id) => {
      const el = document.getElementById(id);
      const span = el && el.querySelector('[data-nr="1"]');
      const b = span && span.querySelector("b");
      return b ? window.getComputedStyle(b).color : null;
    };
    return {
      strongMode: mode("bold-strong"),
      strongColor: colorVar("bold-strong"),
      inlineMode: mode("bold-inline"),
      rgbaMode: mode("bold-rgba"),
      rgbaColor: colorVar("bold-rgba"),
      h1Mode: mode("main-title"),
      normalMode: mode("normal-weight"),
      bWeightStrong: bWeight("bold-strong"),
      parentWeightStrong: parentWeight("bold-strong"),
      bWeightNormal: bWeight("normal-weight"),
      parentWeightNormal: parentWeight("normal-weight"),
      shadeStrong: lum(shadeOf("bold-strong")),
      parentStrong: lum(getComputedStyle(document.getElementById("bold-strong")).color),
      shadeMid: lum(shadeOf("bold-mid")),
      parentMid: lum(getComputedStyle(document.getElementById("bold-mid")).color),
      shadeRgba: lum(shadeOf("bold-rgba")),
    };
  });
  ok(
    "already-bold text (strong) gets color mode: " + adaptive.strongMode,
    adaptive.strongMode === "color" && !!adaptive.strongColor,
  );
  ok(
    "already-bold text (inline 700) gets color mode: " + adaptive.inlineMode,
    adaptive.inlineMode === "color",
  );
  ok("heading (h1) gets color mode: " + adaptive.h1Mode, adaptive.h1Mode === "color");
  ok(
    "normal-weight text keeps plain bold mode: " + adaptive.normalMode,
    adaptive.normalMode === null || adaptive.normalMode === "bold",
  );
  ok(
    "color mode adds no extra weight (b=" + adaptive.bWeightStrong + " vs parent=" + adaptive.parentWeightStrong + ")",
    adaptive.bWeightStrong === adaptive.parentWeightStrong,
  );
  ok(
    "black text gets a visible shade (shade=" + adaptive.shadeStrong.toFixed(2) + " vs parent=" + adaptive.parentStrong.toFixed(2) + ")",
    Math.abs(adaptive.shadeStrong - adaptive.parentStrong) > 0.05 &&
      adaptive.shadeStrong > 0.05 &&
      adaptive.shadeStrong < 0.95,
  );
  ok(
    "mid-tone bold text shifts DARKER (shade=" + adaptive.shadeMid.toFixed(2) + " vs parent=" + adaptive.parentMid.toFixed(2) + ")",
    adaptive.shadeMid < adaptive.parentMid,
  );
  ok(
    "already-bold rgba() text gets color mode + shade: " + adaptive.rgbaMode,
    adaptive.rgbaMode === "color" && !!adaptive.rgbaColor && adaptive.shadeRgba > 0.05 && adaptive.shadeRgba < 0.95,
  );
  ok(
    "normal mode still bolds (b=" + adaptive.bWeightNormal + " vs parent=" + adaptive.parentWeightNormal + ")",
    parseInt(adaptive.bWeightNormal, 10) > parseInt(adaptive.parentWeightNormal, 10),
  );

  // ---- Title-like bold text uses the red fixation shade ------------------
  const titleShade = await page.evaluate(() => {
    const span = document.querySelector("#title-color [data-nr=\"1\"]");
    const b = span && span.querySelector("b");
    return {
      mode: span && span.getAttribute("data-nr-mode"),
      variable: span && span.style.getPropertyValue("--nr-color"),
      color: b && getComputedStyle(b).color,
    };
  });
  ok(
    "title-like bold text uses red fixation color",
    titleShade.mode === "color" &&
      /rgb\(220,\s*38,\s*38\)/.test(titleShade.variable) &&
      /rgb\(220,\s*38,\s*38\)/.test(titleShade.color),
    JSON.stringify(titleShade),
  );

  // ---- Compound words over 15 letters ------------------------------------
  const compound = await page.evaluate(() => {
    const canonical = document.querySelector("#compound [data-nr=\"1\"]");
    const fallback = document.querySelector("#compound-fallback [data-nr=\"1\"]");
    const cased = document.querySelector("#compound-case [data-nr=\"1\"]");
    return {
      canonicalParts: canonical
        ? Array.from(canonical.querySelectorAll('[data-nr-compound-part=\"1\"]')).map((el) => el.textContent)
        : [],
      canonicalText: document.getElementById("compound").textContent,
      fallbackParts: fallback
        ? Array.from(fallback.querySelectorAll('[data-nr-compound-part=\"1\"]')).map((el) => el.textContent)
        : [],
      fallbackText: document.getElementById("compound-fallback").textContent,
      casedParts: cased
        ? Array.from(cased.querySelectorAll('[data-nr-compound-part=\"1\"]')).map((el) => el.textContent)
        : [],
      casedText: document.getElementById("compound-case").textContent,
    };
  });
  const expectedCompoundParts = ["pneu", "mono", "ultra", "micro", "scopic", "silico", "vol", "cano", "coniosis"];
  ok(
    "canonical compound word uses the required root breakdown",
    JSON.stringify(compound.canonicalParts) === JSON.stringify(expectedCompoundParts),
    JSON.stringify(compound.canonicalParts),
  );
  ok(
    "compound segmentation preserves canonical text exactly",
    compound.canonicalText === "pneumonoultramicroscopicsilicovolcanoconiosis",
  );
  ok(
    "unknown long word uses syllable fallback and preserves punctuation",
    compound.fallbackParts.length > 1 && compound.fallbackText === "antidisestablishmentarianism!",
    JSON.stringify(compound.fallbackParts),
  );
  ok(
    "mixed-case canonical word preserves case and trailing punctuation",
    JSON.stringify(compound.casedParts) === JSON.stringify(["Pneu", "mono", "ultra", "micro", "scopic", "silico", "vol", "cano", "coniosis", "..."]) &&
      compound.casedText === "Pneumonoultramicroscopicsilicovolcanoconiosis...",
    JSON.stringify(compound.casedParts) + " / " + compound.casedText,
  );

  // ---- Undo via the launcher ----------------------------------------------
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

  // ---- Popup messaging: nr-state + nr-toggle round-trips -------------------
  const stateResp = await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.__nrListeners.message({ type: "nr-state" }, null, (resp) =>
          resolve(resp.transformed),
        );
      }),
  );
  ok("popup nr-state reports untransformed after undo", stateResp === false);

  await page.evaluate(
    () =>
      new Promise((resolve) => {
        window.__nrListeners.message({ type: "nr-toggle" }, null, () => resolve());
      }),
  );
  await page.waitForFunction(
    () => document.querySelectorAll('[data-nr="1"]').length > 0,
    { timeout: 10000 },
  );
  ok("popup nr-toggle transforms the page", true);

  // ---- Auto-toggle round-trip via storage.onChanged -------------------------
  // nrAuto is currently true (stub default). Turn it OFF: bolding leaves.
  await page.evaluate(() => window.chrome.storage.sync.set({ nrAuto: false }));
  await page.waitForFunction(
    () => document.querySelectorAll('[data-nr="1"]').length === 0,
    { timeout: 10000 },
  );
  ok("turning auto OFF removes bolding on the open page", true);

  // Turn it back ON: applies live via the stored onChanged listener.
  await page.evaluate(() => window.chrome.storage.sync.set({ nrAuto: true }));
  await page.waitForFunction(
    () => document.querySelectorAll('[data-nr="1"]').length > 0,
    { timeout: 10000 },
  );
  ok("auto-transform applies live via storage.onChanged", true);

  ok("no page errors", errors.length === 0, errors.join("; "));

  await context.close();
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("FIREFOX DOM E2E FAILED:", e.message);
  process.exit(1);
});
