"use strict";

const assert = require("assert");
const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { startFixtureServer } = require("./fixture-server.js");

const ROOT = path.resolve(__dirname, "..");
const URL = "http://127.0.0.1:8111/test/fixtures/hardpage.html";

(async function () {
  const server = await startFixtureServer(8111);
  const extension = path.join(ROOT, "extensions", "chrome");
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nr-phase29-"));
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  });
  const errors = [];
  try {
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    await page.goto(URL, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      window.__nrSettings = {
        ruler: false, rulerSize: 6, rulerDim: 28, rulerStep: 8, rulerLock: false,
        spacing: false, lineHeight: 1.5, letterSpacing: 0.03, wordSpacing: 0.2,
        progress: false, spotlight: false, motion: false,
      };
      window.__nrStorageListeners = [];
      window.chrome = {
        storage: {
          sync: {
            get: (defaults, callback) => callback(Object.assign({}, defaults, { nrSettings: window.__nrSettings, nrAuto: false, nrColor: "#dc2626" })),
            set: (values) => { if (values.nrSettings) window.__nrSettings = values.nrSettings; },
          },
          local: { get: (defaults, callback) => callback(Object.assign({}, defaults, { nrExcludedSites: [], nrSiteColors: {} })), set: () => {} },
          onChanged: { addListener: (listener) => window.__nrStorageListeners.push(listener) },
        },
        runtime: { onMessage: { addListener: () => {} } },
      };
    });
    await page.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "formula.js") });
    await page.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "features.js") });
    await page.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "content.js") });
    await page.waitForFunction(() => document.querySelector("#main-title b, #main-title [data-nr='1']"));
    await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "phase29-shadow-host";
      host.attachShadow({ mode: "open" }).innerHTML = "<p id='shadow-copy'>Shadow reading copy</p><button id='shadow-button'>Keep control normal</button>";
      document.body.appendChild(host);
      const editor = document.createElement("div");
      editor.id = "phase29-editor";
      editor.contentEditable = "true";
      editor.textContent = "Editable text";
      document.body.appendChild(editor);
    });

    const before = await page.evaluate(() => ({
      className: document.documentElement.className,
      lineHeight: document.documentElement.style.getPropertyValue("--nr-line-height"),
      titleText: document.getElementById("main-title").textContent,
      select: document.getElementById("native-select").value,
      shadowStyle: document.querySelector("#phase29-shadow-host").shadowRoot.querySelector("#nr-spacing-shadow-style"),
    }));
    assert.strictEqual(before.className.includes("nr-spacing-active"), false, "spacing starts disabled");
    assert.strictEqual(before.titleText.length > 0, true, "transformed content remains readable");
    assert.strictEqual(before.shadowStyle, null, "shadow spacing starts disabled");

    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, {
        spacing: true, lineHeight: 1.8, letterSpacing: 0.08, wordSpacing: 0.4,
      });
      window.__nrStorageListeners.forEach((listener) => listener({ nrSettings: { oldValue: {}, newValue: window.__nrSettings } }, "sync"));
    });
    await page.waitForFunction(() => document.documentElement.classList.contains("nr-spacing-active"));
    const active = await page.evaluate(() => ({
      className: document.documentElement.className,
      lineHeight: document.documentElement.style.getPropertyValue("--nr-line-height"),
      letterSpacing: document.documentElement.style.getPropertyValue("--nr-letter-spacing"),
      wordSpacing: document.documentElement.style.getPropertyValue("--nr-word-spacing"),
      titleText: document.getElementById("main-title").textContent,
      shadowStyle: !!document.querySelector("#phase29-shadow-host").shadowRoot.querySelector("#nr-spacing-shadow-style"),
      editorLineHeight: getComputedStyle(document.getElementById("phase29-editor")).lineHeight,
    }));
    assert.strictEqual(active.lineHeight, "1.8", "line-height updates live");
    assert.strictEqual(active.letterSpacing, "0.08em", "letter spacing updates live");
    assert.strictEqual(active.wordSpacing, "0.4em", "word spacing updates live");
    assert.strictEqual(active.titleText, before.titleText, "spacing does not rewrite transformed text");
    assert.strictEqual(active.shadowStyle, true, "spacing reaches open shadow roots");
    assert.notStrictEqual(active.editorLineHeight, "1.8px", "contenteditable is not forcibly assigned the reading line height");
    assert.strictEqual(await page.locator("#phase29-shadow-host").evaluate((host) => getComputedStyle(host.shadowRoot.getElementById("shadow-button")).lineHeight), "normal", "shadow buttons retain normal control spacing");

    await page.selectOption("#native-select", "focused");
    assert.strictEqual(await page.locator("#native-select").inputValue(), "focused", "native controls remain usable with spacing enabled");
    assert.strictEqual(await page.locator("#phase29-shadow-host").evaluate((host) => host.shadowRoot.getElementById("shadow-button").textContent), "Keep control normal", "shadow controls retain their content");

    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, {
        spacing: false, lineHeight: 99, letterSpacing: -1, wordSpacing: 99,
      });
      window.__nrStorageListeners.forEach((listener) => listener({ nrSettings: { oldValue: {}, newValue: window.__nrSettings } }, "sync"));
    });
    await page.waitForFunction(() => !document.documentElement.classList.contains("nr-spacing-active"));
    await page.waitForFunction(() => !document.querySelector("#phase29-shadow-host").shadowRoot.querySelector("#nr-spacing-shadow-style"));
    const disabled = await page.evaluate(() => ({
      lineHeight: document.documentElement.style.getPropertyValue("--nr-line-height"),
      letterSpacing: document.documentElement.style.getPropertyValue("--nr-letter-spacing"),
      wordSpacing: document.documentElement.style.getPropertyValue("--nr-word-spacing"),
    }));
    assert.strictEqual(disabled.lineHeight, "2.2", "line-height is capped safely");
    assert.strictEqual(disabled.letterSpacing, "0em", "letter spacing is floored safely");
    assert.strictEqual(disabled.wordSpacing, "0.8em", "word spacing is capped safely");
    assert.deepStrictEqual(errors, [], errors.join("; "));
  } finally {
    await context.close();
    await server.close();
  }
  console.log("Phase 29 spacing e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
