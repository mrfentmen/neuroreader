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
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "nr-phase26-"));
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
      window.__nrSettings = { ruler: true, rulerSize: 6, rulerDim: 28, progress: false, spotlight: false, motion: false };
      window.__nrStorageListeners = [];
      window.chrome = {
        storage: {
          sync: {
            get: (defaults, callback) => callback(Object.assign({}, defaults, { nrSettings: window.__nrSettings, nrAuto: false, nrColor: "#dc2626" })),
            set: (values) => { if (values.nrSettings) window.__nrSettings = values.nrSettings; },
          },
          local: {
            get: (defaults, callback) => callback(Object.assign({}, defaults, { nrExcludedSites: [], nrSiteColors: {} })),
            set: () => {},
          },
          onChanged: { addListener: (listener) => window.__nrStorageListeners.push(listener) },
        },
        runtime: { onMessage: { addListener: () => {} } },
      };
    });
    await page.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "formula.js") });
    await page.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "features.js") });
    await page.addScriptTag({ path: path.join(ROOT, "extensions/chrome", "content.js") });
    await page.waitForSelector("#nr-reading-ruler");

    const initial = await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y"));
    const viewportHeight = await page.evaluate(() => window.innerHeight);
    const center = viewportHeight / 2;
    const step = Math.max(24, Math.round(viewportHeight * 0.08));
    assert.strictEqual(initial, `${center}px`, "keyboard ruler starts at the viewport center");

    await page.keyboard.press("Alt+ArrowDown");
    await page.waitForFunction((expected) => document.getElementById("nr-reading-ruler").style.getPropertyValue("--nr-ruler-y") === expected, `${Math.min(viewportHeight, center + step)}px`);
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), `${Math.min(viewportHeight, center + step)}px`, "Alt+ArrowDown advances the ruler");

    await page.keyboard.press("Alt+ArrowUp");
    await page.waitForFunction((expected) => document.getElementById("nr-reading-ruler").style.getPropertyValue("--nr-ruler-y") === expected, `${center}px`);
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), `${center}px`, "Alt+ArrowUp moves the ruler back");

    await page.keyboard.press("Alt+End");
    await page.waitForFunction((expected) => document.getElementById("nr-reading-ruler").style.getPropertyValue("--nr-ruler-y") === expected, `${viewportHeight}px`);
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), `${viewportHeight}px`, "Alt+End moves to the bottom edge");

    await page.keyboard.press("Alt+Home");
    await page.waitForFunction((expected) => document.getElementById("nr-reading-ruler").style.getPropertyValue("--nr-ruler-y") === expected, "0px");
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), "0px", "Alt+Home moves to the top edge");

    const pageJump = Math.max(step, Math.round(viewportHeight * 0.72));
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "PageDown", altKey: true, bubbles: true, cancelable: true })));
    await page.waitForFunction((expected) => document.getElementById("nr-reading-ruler").style.getPropertyValue("--nr-ruler-y") === expected, `${pageJump}px`);
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), `${pageJump}px`, "Alt+PageDown moves by a page");
    await page.evaluate(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "PageUp", altKey: true, bubbles: true, cancelable: true })));
    await page.waitForFunction((expected) => document.getElementById("nr-reading-ruler").style.getPropertyValue("--nr-ruler-y") === expected, "0px");
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), "0px", "Alt+PageUp moves back by a page");

    await page.keyboard.press("Alt+ArrowUp");
    const beforeRejectedModifier = await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y"));
    await page.keyboard.press("Control+Alt+ArrowDown");
    await page.keyboard.press("Shift+Alt+ArrowDown");
    const afterRejectedModifiers = await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y"));
    assert.strictEqual(afterRejectedModifiers, beforeRejectedModifier, "Ctrl/Shift modifiers do not hijack page shortcuts");

    await page.evaluate(() => {
      const input = document.createElement("input");
      input.id = "nr-keyboard-test-input";
      document.body.appendChild(input);
      input.focus();
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }));
      const editor = document.createElement("div");
      editor.id = "nr-keyboard-test-editor";
      editor.contentEditable = "true";
      document.body.appendChild(editor);
      editor.focus();
      editor.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", altKey: true, bubbles: true, cancelable: true }));
    });
    assert.strictEqual(await page.locator("#nr-reading-ruler").evaluate((node) => node.style.getPropertyValue("--nr-ruler-y")), afterRejectedModifiers, "focused form controls and editors keep their keyboard behavior");

    await page.evaluate(() => {
      window.__nrSettings = Object.assign({}, window.__nrSettings, { ruler: false });
      window.__nrStorageListeners.forEach((listener) => listener({ nrSettings: { oldValue: { ruler: true }, newValue: window.__nrSettings } }, "sync"));
    });
    await page.waitForTimeout(40);
    assert.strictEqual(await page.locator("#nr-reading-ruler").count(), 0, "disabling the ruler removes the keyboard aid");
    assert.deepStrictEqual(errors, [], errors.join("; "));
  } finally {
    await context.close();
    await server.close();
  }

  console.log("Phase 26 keyboard-ruler e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
