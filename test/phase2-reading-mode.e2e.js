"use strict";
const assert = require("assert");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { startFixtureServer } = require("./fixture-server.js");

const ROOT = path.resolve(__dirname, "..");
const FORMULA = fs.readFileSync(path.join(ROOT, "extensions/chrome", "formula.js"), "utf8");
const READING_MODE = fs.readFileSync(path.join(ROOT, "extensions/chrome", "reading-mode.js"), "utf8");
const FIREFOX_READING_MODE = fs.readFileSync(path.join(ROOT, "extensions/firefox", "reading-mode.js"), "utf8");
const FEATURES = fs.readFileSync(path.join(ROOT, "extensions/chrome", "features.js"), "utf8");
const URL = "http://127.0.0.1:8111/test/fixtures/hardpage.html";

(async function () {
  const server = await startFixtureServer(8111);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ colorScheme: "light" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    window.__nrStorage = {
      nrSettings: { focus: true, blueLight: true, eyeRest: true, motion: false },
      nrBlueStart: "00:00",
      nrBlueEnd: "23:59",
      nrEyeInterval: 0.0001,
      nrReadingTotals: { date: "", words: 0 },
    };
    window.chrome = {
      storage: {
        sync: {
          get: (defaults, cb) => cb(Object.assign({}, defaults, window.__nrStorage)),
          set: (values) => Object.assign(window.__nrStorage, values),
        },
        local: {
          get: (defaults, cb) => cb(Object.assign({}, defaults, window.__nrStorage)),
          set: (values) => Object.assign(window.__nrStorage, values),
        },
        onChanged: { addListener: () => {} },
      },
      runtime: { onMessage: { addListener: () => {} } },
    };
  });
  await page.addScriptTag({ content: FORMULA });
  await page.addScriptTag({ content: FEATURES });
  await page.addScriptTag({ content: READING_MODE });

  const opened = await page.evaluate(() => ({
    hasArticle: !!document.querySelector("main"),
    hasStyle: !!document.querySelector("#nr-reading-style"),
    hasOverlay: !!document.querySelector("#nr-reading-overlay"),
  }));
  assert.strictEqual(opened.hasStyle, true, "reading mode injects styles");

  // Drive the keyboard shortcut that the extension exposes.
  await page.keyboard.press("Control+Shift+R");
  await page.waitForSelector("#nr-reading-overlay");
  assert.strictEqual(await page.locator("#nr-reading-overlay [data-nr='1']").count() > 0, true, "reading mode transforms the detached article clone");
  assert.strictEqual(await page.locator("#nr-reading-overlay script").count(), 0, "scripts are not copied into reading mode");
  assert.strictEqual(await page.locator("#nr-reading-overlay button").count(), 1, "only the exit control remains in the reading surface");
  assert.deepStrictEqual((await page.locator("html").getAttribute("class")).split(/\s+/).sort(), ["nr-blue-light-active", "nr-reading-active"], "focus and blue-light classes are active");

  await page.waitForSelector(".nr-eye-reminder", { timeout: 5000 });
  assert.match(await page.locator(".nr-eye-reminder").textContent(), /20 feet/);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(50);
  assert.strictEqual(await page.locator("#nr-reading-overlay").count(), 0, "Escape exits reading mode");
  assert.deepStrictEqual((await page.locator("html").getAttribute("class")).split(/\s+/).sort(), ["nr-blue-light-active"], "global blue-light aid remains after exit");
  assert.deepStrictEqual(errors, [], errors.join("; "));

  const firefoxMode = await context.newPage();
  await firefoxMode.goto(URL, { waitUntil: "domcontentloaded" });
  await firefoxMode.evaluate(() => {
    window.chrome = {
      storage: {
        sync: { get: () => Promise.resolve({ nrSettings: { focus: true, blueLight: false, eyeRest: false, motion: false } }), set: () => Promise.resolve() },
        local: { get: () => Promise.resolve({ nrReadingTotals: { date: "", words: 0 } }), set: () => Promise.resolve() },
        onChanged: { addListener: () => {} },
      },
      runtime: { onMessage: { addListener: () => {} } },
    };
    window.browser = {
      storage: {
        sync: { get: () => Promise.resolve({ nrSettings: { focus: true, blueLight: false, eyeRest: false, motion: false } }), set: () => Promise.resolve() },
        local: { get: () => Promise.resolve({ nrReadingTotals: { date: "", words: 0 } }), set: () => Promise.resolve() },
        onChanged: { addListener: () => {} },
      },
    };
  });
  await firefoxMode.addScriptTag({ content: FORMULA });
  await firefoxMode.addScriptTag({ content: FEATURES });
  await firefoxMode.addScriptTag({ content: FIREFOX_READING_MODE });
  await firefoxMode.keyboard.press("Control+Shift+R");
  await firefoxMode.waitForSelector("#nr-reading-overlay");
  assert.strictEqual(await firefoxMode.locator("#nr-reading-overlay [data-nr='1']").count() > 0, true, "Firefox-compatible promise storage path transforms reading mode");
  await firefoxMode.keyboard.press("Escape");
  await firefoxMode.close();

  await context.close();
  await browser.close();
  await server.close();
  console.log("Phase 2 reading-mode e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
