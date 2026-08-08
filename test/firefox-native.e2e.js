"use strict";
/*
 * NeuroReader — Native Firefox (MV2) e2e with a REAL addon install.
 *
 * Closes the last Firefox gap: Playwright's bundled Firefox cannot load
 * extensions, so the DOM-level suites had to stub chrome.storage/runtime.
 * This suite uses WebDriver + geckodriver against a real Firefox, installs
 * the actual MV2 addon (extensions/firefox) as a temporary add-on via the
 * WebDriver Install Extension command, and drives the full hardpage check
 * set — auto-transform on load, sticky late/recycled content, characterData
 * rewrites, shadow roots (per-shadow-root observers, late-attached,
 * pre-existing hosts), adaptive bolding, compound words, launcher undo/redo
 * — end to end.
 *
 * Requires (one time):
 *   brew install --cask firefox geckodriver
 *   npm i -D selenium-webdriver
 *
 * Run with:  npm run test:firefox-native
 * Headed (watch a real window):  NR_HEADED=1 npm run test:firefox-native
 */
const { Builder, By } = require("selenium-webdriver");
const firefox = require("selenium-webdriver/firefox");
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const ROOT = path.resolve(__dirname, "..");
const FF = path.join(ROOT, "extensions", "firefox");
const PORT = 8111;
const FIXTURE = "http://127.0.0.1:" + PORT + "/test/fixtures/hardpage.html";

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hoisted so the failure path can always quit/kill: any mid-suite throw must
// not leave headless Firefox + geckodriver + the fixture server running.
let driver = null;
let server = null;

async function cleanup() {
  try { if (driver) await driver.quit(); } catch (e) {}
  try { if (server) server.kill(); } catch (e) {}
  try { execSync("pkill -f 'http.server " + PORT + "' 2>/dev/null"); } catch (e) {}
}

// Explicit poll loop (mirrors the empirically-working pattern): driver.wait
// with async conditions proved unreliable across page settle here, so poll
// executeScript directly with a generous deadline.
async function waitEval(driver, expr, timeoutMs, msg) {
  const t0 = Date.now();
  let firstErr = null;
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (await driver.executeScript(expr)) return;
    } catch (e) {
      if (!firstErr) firstErr = String(e && e.message || e);
    }
    await sleep(500);
  }
  const diag = await driver
    .executeScript(
      "return { url: location.href, ready: document.readyState, launcher: !!document.getElementById('nr-launcher'), hasNR: typeof window.NeuroReader, spans: document.querySelectorAll('[data-nr=\"1\"]').length };")
    .catch((e) => ({ evalError: String(e.message) }));
  throw new Error(
    "Wait timed out after " + timeoutMs + "ms: " + msg +
    " | first poll error: " + firstErr + " | page: " + JSON.stringify(diag),
  );
}

async function main() {
  console.log("NeuroReader native Firefox (MV2) e2e\n");

  // ---- 0. Prerequisites ----------------------------------------------------
  const FF_BIN = "/Applications/Firefox.app/Contents/MacOS/firefox";
  if (!fs.existsSync(FF_BIN)) {
    console.log("  \u2717 Real Firefox not found at " + FF_BIN + ".\n      Install: brew install --cask firefox");
    process.exit(1);
  }
  try { execSync("geckodriver --version", { stdio: "ignore" }); } catch (e) {
    console.log("  \u2717 geckodriver not found on PATH.\n      Install: brew install geckodriver");
    process.exit(1);
  }
  require.resolve("selenium-webdriver");
  console.log("  Firefox: " + FF_BIN);

  // ---- Fixture server (repo root on :8111) --------------------------------
  try { execSync("pkill -f 'http.server " + PORT + "' 2>/dev/null"); } catch (e) {}
  const PY = fs.existsSync(path.join(ROOT, ".venv", "bin", "python"))
    ? path.join(ROOT, ".venv", "bin", "python")
    : "python3";
  server = spawn(PY, ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
  server.on("error", () => {});
  const serverUp = await new Promise((resolve) => {
    const t0 = Date.now();
    (async function poll() {
      try {
        const r = await fetch("http://127.0.0.1:" + PORT + "/index.html");
        if (r.ok) return resolve(true);
      } catch (e) {}
      if (Date.now() - t0 > 15000) return resolve(false);
      setTimeout(poll, 400);
    })();
  });
  ok("fixture server up on :" + PORT, serverUp);
  if (!serverUp) {
    server.kill();
    report();
    return;
  }

  // ---- Launch real Firefox via geckodriver --------------------------------
  try {
    const opts = new firefox.Options();
    if (!process.env.NR_HEADED) opts.addArguments("-headless");
    driver = await new Builder().forBrowser("firefox").setFirefoxOptions(opts).build();
  } catch (e) {
    ok("WebDriver launched real Firefox", false, e.message);
    server.kill();
    report();
    return;
  }
  ok("WebDriver launched real Firefox (geckodriver)", true);

  // Install the MV2 addon as a temporary add-on — the native equivalent of
  // Firefox's about:debugging "Load Temporary Add-on".
  try {
    const addonId = await driver.installAddon(FF, true);
    ok("MV2 addon installed as a temporary add-on (id=" + addonId + ")", true);
  } catch (e) {
    ok("MV2 addon installed as a temporary add-on", false, e.message);
    await driver.quit();
    server.kill();
    report();
    return;
  }

  // Navigate straight to the fixture. The first cold start of a fresh
  // headless profile can take a while, so the boot waits below are generous.
  await driver.get(FIXTURE);

  // NOTE: geckodriver returns null for expression-only scripts — every
  // executeScript below must use an explicit `return` statement.
  try {
    await driver.executeScript(
      "window.__nrErrors = [];" +
        "window.addEventListener('error', function (e) { window.__nrErrors.push(String(e.message)); });" +
        "return true;",
    );
  } catch (e) {}

  // ---- 1. Auto-transform on load, no clicks -------------------------------
  await waitEval(driver,
    "return document.getElementById('nr-launcher') !== null", 25000,
    "waiting for the NeuroReader launcher button");
  ok("launcher button injected into the page", true);

  await waitEval(driver,
    "return document.querySelectorAll('[data-nr=\"1\"]').length >= 3", 15000,
    "waiting for auto-transform on load");
  ok("page auto-transformed on load (no clicks)", true);

  // ---- 2. Sticky watcher: late sidebar + recycled content -----------------
  await waitEval(driver,
    "return Array.from(document.querySelectorAll('.sidebar-item')).some(function (el) { return el.querySelector('[data-nr=\"1\"]'); })",
    12000, "waiting for late sidebar items to transform");
  ok("late-rendered sidebar items transformed (sticky watcher)", true);

  await waitEval(driver,
    "return Array.from(document.querySelectorAll('.sidebar-item')).some(function (el) { return /Recycled/.test(el.textContent) && el.querySelector('[data-nr=\"1\"]'); })",
    15000, "waiting for recycled sidebar content to transform");
  ok("recycled sidebar content transformed", true);

  // ---- 3. characterData in-place rewrite -----------------------------------
  await waitEval(driver,
    "return document.getElementById('inplace') && document.getElementById('inplace').querySelector('[data-nr=\"1\"]') !== null",
    15000, "waiting for the in-place rewrite to transform");
  ok("characterData in-place rewrite transformed", true);

  // ---- 4. Shadow DOM -------------------------------------------------------
  await waitEval(driver,
    "return (() => { const h = document.getElementById('shadow-host'); return h && h.shadowRoot && h.shadowRoot.querySelector('[data-nr=\"1\"]') !== null; })()",
    10000, "waiting for shadow-root text to transform");
  ok("text inside an open shadow root transformed", true);

  await waitEval(driver,
    "return (() => { const h = document.getElementById('shadow-live'); if (!h || !h.shadowRoot) return false; return h.shadowRoot.querySelectorAll('[data-nr=\"1\"]').length >= 2; })()",
    15000, "waiting for late chat messages inside the shadow root");
  ok("late content inside shadow root transformed (per-shadow-root observer)", true);

  await waitEval(driver,
    "return (() => { const h = document.getElementById('shadow-late-host'); return h && h.shadowRoot && h.shadowRoot.querySelector('[data-nr=\"1\"]') !== null; })()",
    12000, "waiting for the late-attached shadow root");
  ok("shadow root attached after transform discovered", true);

  await waitEval(driver,
    "return (() => { const h = document.getElementById('shadow-upgrade-host'); return h && h.shadowRoot && h.shadowRoot.querySelector('[data-nr=\"1\"]') !== null; })()",
    15000, "waiting for the pre-existing-host shadow root (discovery poll)");
  ok("shadow root on pre-existing host discovered (poll)", true);

  // ---- 5. Adaptive bolding -------------------------------------------------
  const adaptive = await driver.executeScript(`return (() => {
    const mode = function (id) {
      const el = document.getElementById(id);
      if (!el) return null;
      const span = el.querySelector('[data-nr="1"]');
      return span ? span.getAttribute("data-nr-mode") : null;
    };
    const shadeOf = function (id) {
      const el = document.getElementById(id);
      const span = el && el.querySelector('[data-nr="1"]');
      const b = span && span.querySelector("b");
      return b ? window.getComputedStyle(b).color : null;
    };
    const lum = function (c) {
      const m = c && c.match(/rgba?\\((\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/);
      if (!m) return null;
      return (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
    };
    const span = function (id) {
      const el = document.getElementById(id);
      return el ? el.querySelector('[data-nr="1"]') : null;
    };
    return {
      strongMode: mode("bold-strong"),
      strongShade: lum(shadeOf("bold-strong")),
      parentStrong: lum(getComputedStyle(document.getElementById("bold-strong")).color),
      midShade: lum(shadeOf("bold-mid")),
      parentMid: lum(getComputedStyle(document.getElementById("bold-mid")).color),
      rgbaMode: mode("bold-rgba"),
      rgbaShade: lum(shadeOf("bold-rgba")),
      normalMode: mode("normal-weight"),
      bWeight: span("bold-strong") && window.getComputedStyle(span("bold-strong").querySelector("b")).fontWeight,
      parentWeight: getComputedStyle(document.getElementById("bold-strong")).fontWeight,
      noShade: Array.from(document.querySelectorAll('[data-nr="1"][data-nr-mode="color"]'))
        .filter(function (s) { return !s.style.getPropertyValue("--nr-color"); }).length,
    };
  })()`);
  ok("already-bold text gets color mode (strong) " + adaptive.strongMode,
    adaptive.strongMode === "color");
  ok("color mode sets a shade on every span (missing=" + adaptive.noShade + ")",
    adaptive.noShade === 0);
  ok("black text gets a visible shade (shade=" + (adaptive.strongShade || 0).toFixed(2) + ")",
    adaptive.strongShade > 0.05 && adaptive.strongShade < 0.95);
  ok("mid-tone bold text remains visibly shaded (shade=" + (adaptive.midShade || 0).toFixed(2) + ")",
    adaptive.midShade > 0.05 && adaptive.midShade < 0.95);
  ok("rgba() bold text gets color mode + shade: " + adaptive.rgbaMode,
    adaptive.rgbaMode === "color" && adaptive.rgbaShade > 0.05);
  ok("normal-weight text keeps plain bold mode: " + adaptive.normalMode,
    adaptive.normalMode === null || adaptive.normalMode === "bold");
  ok("color mode adds no extra weight (b=" + adaptive.bWeight + " vs parent=" + adaptive.parentWeight + ")",
    adaptive.bWeight === adaptive.parentWeight);

  // ---- 6. Title-like bold text uses the red fixation shade ---------------
  const titleShade = await driver.executeScript(`return (() => {
    const span = document.querySelector('#title-color [data-nr="1"]');
    const b = span && span.querySelector('b');
    return {
      mode: span && span.getAttribute('data-nr-mode'),
      variable: span && span.style.getPropertyValue('--nr-color'),
      color: b && getComputedStyle(b).color,
    };
  })()`);
  ok("title-like bold text uses red fixation color", titleShade.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(titleShade.variable) && /rgb\(220,\s*38,\s*38\)/.test(titleShade.color), JSON.stringify(titleShade));

  // ---- 6b. YouTube-like homepage/search card titles ----------------------
  const cardTitles = await driver.executeScript(`return Array.from(document.querySelectorAll('#youtube-home-cards [data-nr="1"], #youtube-search-cards [data-nr="1"]')).map(function (span) {
    const b = span.querySelector('b');
    return { mode: span.getAttribute('data-nr-mode'), variable: span.style.getPropertyValue('--nr-color'), color: b && getComputedStyle(b).color };
  })`);
  ok("homepage/search card titles all use red fixation color", cardTitles.length === 4 && cardTitles.every(function (card) {
    return card.mode === "color" && String(card.variable).split(" ").join("") === "rgb(220,38,38)" && String(card.color).split(" ").join("") === "rgb(220,38,38)";
  }), JSON.stringify(cardTitles));

  // ---- 6c. Reddit-like bold navigation/posts/comments ---------------------
  const redditBold = await driver.executeScript(`return Array.from(document.querySelectorAll('#reddit-like [data-nr="1"]')).map(function (span) {
    const b = span.querySelector('b');
    return { mode: span.getAttribute('data-nr-mode'), variable: span.style.getPropertyValue('--nr-color'), color: b && getComputedStyle(b).color };
  })`);
  ok("Reddit-like bold navigation/posts/comments use red fixation color", redditBold.length >= 8 && redditBold.every(function (item) {
    return item.mode === "color" && String(item.variable).split(" ").join("") === "rgb(220,38,38)" && String(item.color).split(" ").join("") === "rgb(220,38,38)";
  }), JSON.stringify(redditBold));
  await waitEval(driver, "return document.querySelector('#reddit-late-comments [data-nr=\\\"1\\\"]') !== null", 12000, "waiting for late Reddit comment");
  const lateReddit = await driver.executeScript(`return (function () {
    var span = document.querySelector('#reddit-late-comments [data-nr="1"]');
    var b = span && span.querySelector('b');
    return { mode: span && span.getAttribute('data-nr-mode'), variable: span && span.style.getPropertyValue('--nr-color'), color: b && getComputedStyle(b).color };
  })()`);
  ok("late Reddit-style comment uses red fixation color", lateReddit.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(lateReddit.variable) && /rgb\(220,\s*38,\s*38\)/.test(lateReddit.color), JSON.stringify(lateReddit));

  // ---- 6c. Cross-site representatives: GitHub/news/docs/Twitch ----------
  const crossSite = await driver.executeScript(`return Array.from(document.querySelectorAll('#multi-site-like [data-nr="1"]')).filter(function (span) {
    var parent = span.parentElement;
    return parent && (parent.matches('.Link--primary, article h1, article h2, [data-a-target="stream-title"], [data-a-target="chat-message-username"], strong') || parent.closest('[data-a-target="chat-line-message"]'));
  }).map(function (span) {
    var b = span.querySelector('b');
    return { mode: span.getAttribute('data-nr-mode'), variable: span.style.getPropertyValue('--nr-color'), color: b && getComputedStyle(b).color };
  })`);
  ok("GitHub/news/docs/Twitch content uses red fixation color", crossSite.length >= 5 && crossSite.every(function (item) {
    return item.mode === "color" && String(item.variable).split(" ").join("") === "rgb(220,38,38)" && String(item.color).split(" ").join("") === "rgb(220,38,38)";
  }), JSON.stringify(crossSite));
  await waitEval(driver, "return document.querySelector('#twitch-late-chat [data-nr=\\\"1\\\"]') !== null", 12000, "waiting for late Twitch content");
  const lateTwitch = await driver.executeScript(`return Array.from(document.querySelectorAll('#twitch-late-chat [data-nr="1"]')).map(function (span) {
    var b = span.querySelector('b');
    return { mode: span.getAttribute('data-nr-mode'), variable: span.style.getPropertyValue('--nr-color'), color: b && getComputedStyle(b).color };
  })`);
  ok("late Twitch chat content uses red fixation color", lateTwitch.length >= 2 && lateTwitch.every(function (item) {
    return item.mode === "color" && String(item.variable).split(" ").join("") === "rgb(220,38,38)" && String(item.color).split(" ").join("") === "rgb(220,38,38)";
  }), JSON.stringify(lateTwitch));

  // ---- 6d. GitLab/docs/search/package/chat representatives --------------
  const moreSites = await driver.executeScript(`return Array.from(document.querySelectorAll('#multi-site-like [data-nr="1"]')).filter(function (span) {
    var parent = span.parentElement;
    return parent && (parent.matches('.issuable-title, .arxiv-result > .title, #google-news-like a[aria-label*=" - "][href*="/read/"], main h1, main h2, #search h3, .package-list-item, [data-testid="channel-name"]') || parent.closest('[data-testid="message-content"]'));
  }).map(function (span) {
    var b = span.querySelector('b');
    return { mode: span.getAttribute('data-nr-mode'), variable: span.style.getPropertyValue('--nr-color'), color: b && getComputedStyle(b).color };
  })`);
  ok("GitLab/docs/search/package/chat UI uses red fixation color",    moreSites.length >= 8 && moreSites.every(function (item) {
    return item.mode === "color" && String(item.variable).split(" ").join("") === "rgb(220,38,38)" && String(item.color).split(" ").join("") === "rgb(220,38,38)";
  }), JSON.stringify(moreSites));
  const googleNewsMetadata = await driver.executeScript(`return (function () {
    var source = document.querySelector('#google-news-like a[aria-label="Example News source"] [data-nr="1"]');
    var time = document.querySelector('#google-news-like time [data-nr="1"]');
    return {
      sourceMode: source && source.getAttribute('data-nr-mode'),
      timeMode: time && time.getAttribute('data-nr-mode'),
      timeColor: time && time.style.getPropertyValue('--nr-color').split(' ').join(''),
    };
  })()`);
  ok("Google News source stays ordinary while time keeps metadata color", googleNewsMetadata.sourceMode !== "color" && googleNewsMetadata.timeMode === "color" && googleNewsMetadata.timeColor === "rgb(220,38,38)", JSON.stringify(googleNewsMetadata));
  const nprControls = await driver.executeScript(`return Array.from(document.querySelectorAll('#npr-like [data-nr="1"]')).map(function (span) {
    var b = span.querySelector('b');
    return { mode: span.getAttribute('data-nr-mode'), variable: span.style.getPropertyValue('--nr-color'), color: b && getComputedStyle(b).color };
  })`);
  ok("NPR audio/navigation controls use red fixation color", nprControls.length === 6 && nprControls.every(function (item) { return item.mode === "color" && String(item.variable).split(" ").join("") === "rgb(220,38,38)" && String(item.color).split(" ").join("") === "rgb(220,38,38)"; }), JSON.stringify(nprControls));

  const publisherCards = await driver.executeScript(`return Array.from(document.querySelectorAll('#publisher-like [data-nr="1"]')).map(function (span) {
    var b = span.querySelector('b');
    return { mode: span.getAttribute('data-nr-mode'), variable: span.style.getPropertyValue('--nr-color'), color: b && getComputedStyle(b).color };
  })`);
  ok("publisher/research card hooks use red fixation color", publisherCards.length === 7 && publisherCards.every(function (item) {
    return item.mode === "color" && String(item.variable).split(" ").join("") === "rgb(220,38,38)" && String(item.color).split(" ").join("") === "rgb(220,38,38)";
  }), JSON.stringify(publisherCards));

  // ---- 6d. Creator, ad, and top-navigation metadata ----------------------
  const supportingTitles = await driver.executeScript(`return Array.from(document.querySelectorAll('#youtube-video-meta [data-nr="1"], #youtube-ad-meta [data-nr="1"], #youtube-topbar [data-nr="1"]')).map(function (span) {
    const b = span.querySelector('b');
    return { mode: span.getAttribute('data-nr-mode'), variable: span.style.getPropertyValue('--nr-color'), color: b && getComputedStyle(b).color };
  })`);
  ok("creator names, ad labels, and top navigation use red fixation color", supportingTitles.length === 13 && supportingTitles.every(function (item) {
    return item.mode === "color" && String(item.variable).split(" ").join("") === "rgb(220,38,38)" && String(item.color).split(" ").join("") === "rgb(220,38,38)";
  }), JSON.stringify(supportingTitles));

  // ---- 6d. Nested and late-arriving ad headlines -------------------------
  await waitEval(driver, "return document.querySelector('#dynamic-ad-host [data-nr=\\\"1\\\"]') !== null", 12000, "waiting for dynamic ad text");
  const adColors = await driver.executeScript(`return Array.from(document.querySelectorAll('#youtube-ad-meta [data-nr="1"], #dynamic-ad-host [data-nr="1"]')).map(function (span) {
    const b = span.querySelector('b');
    return { mode: span.getAttribute('data-nr-mode'), variable: span.style.getPropertyValue('--nr-color'), color: b && getComputedStyle(b).color };
  })`);
  ok("nested and dynamic ad headlines use red fixation color", adColors.length === 3 && adColors.every(function (item) {
    return item.mode === "color" && String(item.variable).split(" ").join("") === "rgb(220,38,38)" && String(item.color).split(" ").join("") === "rgb(220,38,38)";
  }), JSON.stringify(adColors));

  // ---- 6e. Friendly about:blank ad frame -------------------------------
  await waitEval(driver, "return (function () { var f = document.getElementById('friendly-ad-frame'); return f && f.contentDocument && f.contentDocument.querySelector('[data-nr=\\\"1\\\"]') !== null; })()", 15000, "waiting for friendly ad frame transform");
  const friendlyAd = await driver.executeScript(`return (function () {
    var frame = document.getElementById('friendly-ad-frame');
    var span = frame.contentDocument.querySelector('[data-nr="1"]');
    var b = span && span.querySelector('b');
    return { mode: span && span.getAttribute('data-nr-mode'), variable: span && span.style.getPropertyValue('--nr-color'), color: b && frame.contentWindow.getComputedStyle(b).color };
  })()`);
  ok("friendly about:blank ad frame transforms with red fixation color", friendlyAd.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(friendlyAd.variable) && /rgb\(220,\s*38,\s*38\)/.test(friendlyAd.color), JSON.stringify(friendlyAd));

  // ---- 6f. View counts and upload metadata -------------------------------
  const viewMeta = await driver.executeScript(`return Array.from(document.querySelectorAll('#youtube-video-meta [data-nr="1"]')).filter(function (span) { return /views|ago/.test(span.textContent); }).map(function (span) {
    const b = span.querySelector('b');
    return { text: span.textContent, mode: span.getAttribute('data-nr-mode'), variable: span.style.getPropertyValue('--nr-color'), color: b && getComputedStyle(b).color };
  })`);
  ok("view counts and upload metadata use red fixation color", viewMeta.length === 5 && viewMeta.every(function (item) {
    return item.mode === "color" && String(item.variable).split(" ").join("") === "rgb(220,38,38)" && String(item.color).split(" ").join("") === "rgb(220,38,38)";
  }), JSON.stringify(viewMeta));

  // ---- 6e. YouTube topic/filter chip bar ---------------------------------
  const chipColors = await driver.executeScript(`return Array.from(document.querySelectorAll('#youtube-chip-bar [data-nr="1"]')).map(function (span) {
    const b = span.querySelector('b');
    return { mode: span.getAttribute('data-nr-mode'), variable: span.style.getPropertyValue('--nr-color'), color: b && getComputedStyle(b).color };
  })`);
  ok("all YouTube topic/filter chips use red fixation color", chipColors.length === 21 && chipColors.every(function (chip) {
    return chip.mode === "color" && /rgb\(220,\s*38,\s*38\)/.test(chip.variable) && /rgb\(220,\s*38,\s*38\)/.test(chip.color);
  }), JSON.stringify(chipColors));

  // ---- 7. Compound words over 15 letters ---------------------------------
  const compound = await driver.executeScript(`return (() => {
    const canonical = document.querySelector('#compound [data-nr="1"]');
    const fallback = document.querySelector('#compound-fallback [data-nr="1"]');
    const cased = document.querySelector('#compound-case [data-nr="1"]');
    return {
      canonicalParts: canonical ? Array.from(canonical.querySelectorAll('[data-nr-compound-part="1"]')).map(function (el) { return el.textContent; }) : [],
      canonicalText: document.getElementById('compound').textContent,
      fallbackParts: fallback ? Array.from(fallback.querySelectorAll('[data-nr-compound-part="1"]')).map(function (el) { return el.textContent; }) : [],
      fallbackText: document.getElementById('compound-fallback').textContent,
      casedParts: cased ? Array.from(cased.querySelectorAll('[data-nr-compound-part="1"]')).map(function (el) { return el.textContent; }) : [],
      casedText: document.getElementById('compound-case').textContent,
    };
  })()`);
  const expectedCompoundParts = ["pneu", "mono", "ultra", "micro", "scopic", "silico", "vol", "cano", "coniosis"];
  ok("canonical compound word uses the required root breakdown", JSON.stringify(compound.canonicalParts) === JSON.stringify(expectedCompoundParts), JSON.stringify(compound.canonicalParts));
  ok("compound segmentation preserves canonical text exactly", compound.canonicalText === "pneumonoultramicroscopicsilicovolcanoconiosis");
  ok("unknown long word uses syllable fallback and preserves punctuation", compound.fallbackParts.length > 1 && compound.fallbackText === "antidisestablishmentarianism!", JSON.stringify(compound.fallbackParts));
  ok("mixed-case canonical word preserves case and trailing punctuation", JSON.stringify(compound.casedParts) === JSON.stringify(["Pneu", "mono", "ultra", "micro", "scopic", "silico", "vol", "cano", "coniosis", "..."]) && compound.casedText === "Pneumonoultramicroscopicsilicovolcanoconiosis...", JSON.stringify(compound.casedParts) + " / " + compound.casedText);

  // ---- 7. Launcher undo / redo ---------------------------------------------
  try {
    await driver.findElement(By.id("nr-launcher")).click();
  } catch (e) {
    ok("launcher click (undo)", false, e.message);
  }
  await waitEval(driver,
    "return document.querySelectorAll('[data-nr=\"1\"]').length === 0", 10000,
    "waiting for undo to clear every span");
  ok("launcher click undoes the transform (all spans removed)", true);

  try {
    await driver.findElement(By.id("nr-launcher")).click();
  } catch (e) {
    ok("launcher click (re-transform)", false, e.message);
  }
  await waitEval(driver,
    "return document.querySelectorAll('[data-nr=\"1\"]').length >= 3", 10000,
    "waiting for re-transform");
  ok("launcher click re-transforms the page", true);

  // ---- 7. No page errors during the run ------------------------------------
  const errs = await driver.executeScript("return window.__nrErrors || []");
  ok("no page errors during the run" + (errs.length ? " — " + errs.slice(0, 3).join(" | ") : ""),
    errs.length === 0);

  await cleanup();
  report();
}

function report() {
  console.log("\n" + passed + " passed, " + failed + " failed.");
  process.exit(failed ? 1 : 0);
}

main().catch(async (e) => {
  console.error("FIREFOX NATIVE E2E FAILED:", e.message);
  await cleanup();
  process.exit(1);
});
