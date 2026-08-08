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
const { startFixtureServer } = require("./fixture-server.js");

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
async function installApiStub(page) {
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
}

async function bootContentScript(page) {
  await installApiStub(page);
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

  const fixtureServer = await startFixtureServer(8111);
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

  // Native and custom dropdown controls must remain interactive while the
  // extension is auto-transforming the rest of the page.
  await page.selectOption("#native-select", "focused");
  const nativeSelection = await page.$eval("#native-select", (el) => el.value);
  ok("native select changes while auto-transform is active", nativeSelection === "focused", nativeSelection);

  await page.click("#custom-trigger");
  await page.click("#custom-options [role='option'][data-value='dyslexia']");
  const customSelection = await page.$eval("#custom-value", (el) => el.textContent);
  const customExpanded = await page.$eval("#custom-trigger", (el) => el.getAttribute("aria-expanded"));
  ok("custom listbox selection changes while transformed", customSelection === "Dyslexia" && customExpanded === "false", JSON.stringify({ customSelection, customExpanded }));
  const controlsUntouched = await page.evaluate(() => ({
    native: document.querySelectorAll("#native-select [data-nr='1']").length === 0,
    trigger: document.querySelectorAll("#custom-trigger [data-nr='1']").length === 0,
    options: document.querySelectorAll("#custom-options [data-nr='1']").length === 0,
  }));
  ok("dropdown control text stays unwrapped", controlsUntouched.native && controlsUntouched.trigger && controlsUntouched.options, JSON.stringify(controlsUntouched));

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
    "mid-tone bold text remains visibly shaded",
    adaptive.shadeMid > 0.05 && adaptive.shadeMid < 0.95,
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

  // ---- YouTube-like homepage/search card titles --------------------------
  const cardTitles = await page.evaluate(() =>
    Array.from(document.querySelectorAll(
      "#youtube-home-cards [data-nr=\"1\"], #youtube-search-cards [data-nr=\"1\"]",
    )).map((span) => {
      const b = span.querySelector("b");
      return {
        mode: span.getAttribute("data-nr-mode"),
        variable: span.style.getPropertyValue("--nr-color"),
        color: b && getComputedStyle(b).color,
      };
    }),
  );
  ok("homepage/search card titles all use red fixation color", cardTitles.length === 4 && cardTitles.every((card) =>
    card.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(card.variable) && /rgb\(220,\s*38,\s*38\)/.test(card.color)), JSON.stringify(cardTitles));

  // ---- Reddit-like bold navigation/posts/comments --------------------------
  const redditBold = await page.evaluate(() => Array.from(document.querySelectorAll("#reddit-like [data-nr=\"1\"]")).map((span) => {
    const b = span.querySelector("b");
    return { mode: span.getAttribute("data-nr-mode"), variable: span.style.getPropertyValue("--nr-color"), color: b && getComputedStyle(b).color };
  }));
  ok("Reddit-like bold navigation/posts/comments use red fixation color", redditBold.length >= 8 && redditBold.every((item) => item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color)), JSON.stringify(redditBold));
  await page.waitForFunction(() => document.querySelector("#reddit-late-comments [data-nr=\"1\"]") !== null, { timeout: 10000 });
  const lateReddit = await page.evaluate(() => {
    const span = document.querySelector("#reddit-late-comments [data-nr=\"1\"]");
    const b = span && span.querySelector("b");
    return { mode: span && span.getAttribute("data-nr-mode"), variable: span && span.style.getPropertyValue("--nr-color"), color: b && getComputedStyle(b).color };
  });
  ok("late Reddit-style comment uses red fixation color", lateReddit.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(lateReddit.variable) && /rgb\(220,\s*38,\s*38\)/.test(lateReddit.color), JSON.stringify(lateReddit));

  // ---- Cross-site representatives: GitHub/news/docs/Twitch -------------
  const crossSite = await page.evaluate(() => Array.from(document.querySelectorAll("#multi-site-like [data-nr=\"1\"]")).filter((span) => {
    const parent = span.parentElement;
    return parent && (parent.matches(".Link--primary, article h1, article h2, [data-a-target='stream-title'], [data-a-target='chat-message-username'], strong") || parent.closest("[data-a-target='chat-line-message']"));
  }).map((span) => {
    const b = span.querySelector("b");
    return { mode: span.getAttribute("data-nr-mode"), variable: span.style.getPropertyValue("--nr-color"), color: b && getComputedStyle(b).color };
  }));
  ok("GitHub/news/docs/Twitch content uses red fixation color", crossSite.length >= 5 && crossSite.every((item) => item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color)), JSON.stringify(crossSite));
  await page.waitForFunction(() => document.querySelector("#twitch-late-chat [data-nr=\"1\"]") !== null, { timeout: 10000 });
  const lateTwitch = await page.evaluate(() => Array.from(document.querySelectorAll("#twitch-late-chat [data-nr=\"1\"]")).map((span) => {
    const b = span.querySelector("b");
    return { mode: span.getAttribute("data-nr-mode"), variable: span.style.getPropertyValue("--nr-color"), color: b && getComputedStyle(b).color };
  }));
  ok("late Twitch chat content uses red fixation color", lateTwitch.length >= 2 && lateTwitch.every((item) => item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color)), JSON.stringify(lateTwitch));

  // ---- GitLab/docs/search/package/chat representatives ------------------
  const moreSites = await page.evaluate(() => Array.from(document.querySelectorAll("#multi-site-like [data-nr=\"1\"]")).filter((span) => {
    const parent = span.parentElement;
    return parent && (parent.matches(".issuable-title, .arxiv-result > .title, #google-news-like a[aria-label*=' - '][href*='/read/'], main h1, main h2, #search h3, .package-list-item, [data-testid='channel-name']") || parent.closest("[data-testid='message-content']"));
  }).map((span) => {
    const b = span.querySelector("b");
    return { mode: span.getAttribute("data-nr-mode"), variable: span.style.getPropertyValue("--nr-color"), color: b && getComputedStyle(b).color };
  }));
  ok("GitLab/docs/search/package/chat UI uses red fixation color",    moreSites.length >= 8 && moreSites.every((item) => item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color)), JSON.stringify(moreSites));
  const googleNewsMetadata = await page.evaluate(() => {
    const source = document.querySelector("#google-news-like a[aria-label='Example News source'] [data-nr=\"1\"]");
    const time = document.querySelector("#google-news-like time [data-nr=\"1\"]");
    return {
      sourceMode: source && source.getAttribute("data-nr-mode"),
      timeMode: time && time.getAttribute("data-nr-mode"),
      timeColor: time && time.style.getPropertyValue("--nr-color").replace(/\\s/g, ""),
    };
  });
  ok("Google News source stays ordinary while time keeps metadata color", googleNewsMetadata.sourceMode !== "color" && googleNewsMetadata.timeMode === "color" && googleNewsMetadata.timeColor === "rgb(220,38,38)", JSON.stringify(googleNewsMetadata));
  const nprControls = await page.evaluate(() => Array.from(document.querySelectorAll("#npr-like [data-nr=\"1\"]")).map((span) => {
    const b = span.querySelector("b");
    return { mode: span.getAttribute("data-nr-mode"), variable: span.style.getPropertyValue("--nr-color"), color: b && getComputedStyle(b).color };
  }));
  ok("NPR audio/navigation controls use red fixation color", nprControls.length === 6 && nprControls.every((item) => item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color)), JSON.stringify(nprControls));

  const publisherCards = await page.evaluate(() => Array.from(document.querySelectorAll("#publisher-like [data-nr=\"1\"]")).map((span) => {
    const b = span.querySelector("b");
    return { mode: span.getAttribute("data-nr-mode"), variable: span.style.getPropertyValue("--nr-color"), color: b && getComputedStyle(b).color };
  }));
  ok("publisher/research card hooks use red fixation color", publisherCards.length === 7 && publisherCards.every((item) => item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color)), JSON.stringify(publisherCards));

  // ---- Creator, ad, and top-navigation metadata --------------------------
  const supportingTitles = await page.evaluate(() =>
    Array.from(document.querySelectorAll(
      "#youtube-video-meta [data-nr=\"1\"], #youtube-ad-meta [data-nr=\"1\"], #youtube-topbar [data-nr=\"1\"]",
    )).map((span) => {
      const b = span.querySelector("b");
      return {
        mode: span.getAttribute("data-nr-mode"),
        variable: span.style.getPropertyValue("--nr-color"),
        color: b && getComputedStyle(b).color,
      };
    }),
  );
  ok("creator names, ad labels, and top navigation use red fixation color", supportingTitles.length === 13 && supportingTitles.every((item) =>
    item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color)), JSON.stringify(supportingTitles));

  // ---- Nested and late-arriving ad headlines -----------------------------
  await page.waitForFunction(() => document.querySelector("#dynamic-ad-host [data-nr=\"1\"]") !== null, { timeout: 8000 });
  const adColors = await page.evaluate(() => Array.from(document.querySelectorAll("#youtube-ad-meta [data-nr=\"1\"], #dynamic-ad-host [data-nr=\"1\"]")).map((span) => {
    const b = span.querySelector("b");
    return { mode: span.getAttribute("data-nr-mode"), variable: span.style.getPropertyValue("--nr-color"), color: b && getComputedStyle(b).color };
  }));
  ok("nested and dynamic ad headlines use red fixation color", adColors.length === 3 && adColors.every((item) => item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color)), JSON.stringify(adColors));

  // ---- Friendly about:blank ad frame --------------------------------------
  await page.waitForFunction(() => {
    const frame = document.getElementById("friendly-ad-frame");
    return frame && frame.contentDocument && frame.contentDocument.readyState === "complete";
  }, { timeout: 10000 });
  // Playwright's Firefox harness cannot load the manifest into child frames,
  // so install the same shipped scripts in the friendly frame. The Chrome
  // hardpage suite proves the actual extension's manifest injection path.
  const friendlyFrame = page.frames().find((frame) => frame !== page.mainFrame() && frame.name() === "friendly-ad-frame");
  if (friendlyFrame) {
    await installApiStub(friendlyFrame);
    await friendlyFrame.addScriptTag({ content: FORMULA_SRC });
    await friendlyFrame.addScriptTag({ content: CONTENT_SRC });
  }
  await page.waitForFunction(() => {
    const frame = document.getElementById("friendly-ad-frame");
    return frame && frame.contentDocument && frame.contentDocument.querySelector('[data-nr="1"]') !== null;
  }, { timeout: 10000 });
  const friendlyAd = await page.evaluate(() => {
    const frame = document.getElementById("friendly-ad-frame");
    const span = frame.contentDocument.querySelector('[data-nr="1"]');
    const b = span && span.querySelector("b");
    return {
      mode: span && span.getAttribute("data-nr-mode"),
      variable: span && span.style.getPropertyValue("--nr-color"),
      color: b && frame.contentWindow.getComputedStyle(b).color,
    };
  });
  ok("friendly about:blank ad frame transforms with red fixation color", friendlyAd.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(friendlyAd.variable) && /rgb\(220,\s*38,\s*38\)/.test(friendlyAd.color), JSON.stringify(friendlyAd));

  // ---- View counts and upload metadata ------------------------------------
  const viewMeta = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#youtube-video-meta [data-nr=\"1\"]"))
      .filter((span) => /views|ago/.test(span.textContent))
      .map((span) => {
        const b = span.querySelector("b");
        return {
          text: span.textContent,
          mode: span.getAttribute("data-nr-mode"),
          variable: span.style.getPropertyValue("--nr-color"),
          color: b && getComputedStyle(b).color,
        };
      }),
  );
  ok("view counts and upload metadata use red fixation color", viewMeta.length === 5 && viewMeta.every((item) =>
    item.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(item.variable) && /rgb\(220,\s*38,\s*38\)/.test(item.color)), JSON.stringify(viewMeta));

  // ---- YouTube topic/filter chip bar --------------------------------------
  const chipColors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("#youtube-chip-bar [data-nr=\"1\"]")).map((span) => {
      const b = span.querySelector("b");
      return {
        mode: span.getAttribute("data-nr-mode"),
        variable: span.style.getPropertyValue("--nr-color"),
        color: b && getComputedStyle(b).color,
      };
    }),
  );
  ok("all YouTube topic/filter chips use red fixation color", chipColors.length === 21 && chipColors.every((chip) =>
    chip.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(chip.variable) && /rgb\(220,\s*38,\s*38\)/.test(chip.color)), JSON.stringify(chipColors));

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
  await page.waitForFunction(() => {
    const frame = document.getElementById("friendly-ad-frame");
    return !(frame && frame.contentDocument && frame.contentDocument.querySelector('[data-nr="1"]'));
  }, { timeout: 5000 });
  const friendlyFrameStillTransformed = await page.evaluate(() => {
    const frame = document.getElementById("friendly-ad-frame");
    return !!(frame && frame.contentDocument && frame.contentDocument.querySelector('[data-nr="1"]'));
  });
  ok("undo clears the friendly ad frame too", !friendlyFrameStillTransformed);
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

  // ---- Fixation color preference updates existing DOM and persists ---------
  await page.evaluate(() => window.__nrListeners.changed({ nrColor: { newValue: "#2563eb" } }, "sync"));
  await page.waitForFunction(
    () => {
      const span = document.querySelector('[data-nr="1"]');
      const b = span && span.querySelector("b");
      return span && span.style.getPropertyValue("--nr-color") === "rgb(37,99,235)" && b && getComputedStyle(b).color.replace(/\s/g, "") === "rgb(37,99,235)";
    },
    { timeout: 10000 },
  );
  ok("stored fixation color updates existing Firefox spans", true);
  await page.evaluate(() => {
    const node = document.createElement("p");
    node.textContent = "Late Firefox content uses the selected color.";
    document.body.appendChild(node);
  });
  await page.waitForFunction(
    () => Array.from(document.querySelectorAll('[data-nr="1"]')).some((span) => span.style.getPropertyValue("--nr-color") === "rgb(37,99,235)"),
    { timeout: 10000 },
  );
  ok("stored fixation color applies to Firefox sticky content", true);

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
  await fixtureServer.close();
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("FIREFOX DOM E2E FAILED:", e.message);
  process.exit(1);
});
