"use strict";
const assert = require("assert");
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { startFixtureServer } = require("./fixture-server.js");

const ROOT = path.resolve(__dirname, "..");
const URL = "http://127.0.0.1:8111/test/fixtures/hardpage.html";
const read = (browserName, file) => fs.readFileSync(path.join(ROOT, "extensions", browserName, file), "utf8");
const FORMULA = read("chrome", "formula.js");
const FEATURES = read("chrome", "features.js");
const STATS = read("chrome", "stats.js");

async function runMode(page, modeSource, storageSetup, label) {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.evaluate(storageSetup);
  await page.addScriptTag({ content: FORMULA });
  await page.addScriptTag({ content: FEATURES });
  await page.addScriptTag({ content: STATS });
  await page.addScriptTag({ content: modeSource });
  await page.keyboard.press("Control+Shift+R");
  await page.waitForSelector("#nr-reading-overlay");
  assert.ok(await page.locator("#nr-reading-overlay [data-nr='1']").count(), `${label} transforms the detached article`);
  assert.strictEqual(await page.locator("#nr-reading-overlay script").count(), 0, `${label} sanitizes scripts`);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(30);
  assert.strictEqual(await page.locator("#nr-reading-overlay").count(), 0, `${label} exits with Escape`);
  assert.deepStrictEqual(errors, [], `${label} has no page errors: ${errors.join("; ")}`);
}

(async function () {
  const server = await startFixtureServer(8111);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ colorScheme: "light" });

  const chromePage = await context.newPage();
  await runMode(chromePage, read("chrome", "reading-mode.js"), () => {
    window.__nrStorage = { nrSettings: { focus: true, blueLight: true, eyeRest: false, motion: false }, nrBlueStart: "00:00", nrBlueEnd: "23:59" };
    window.chrome = { storage: { sync: { get: (defaults, cb) => cb(Object.assign({}, defaults, window.__nrStorage)), set: (values) => Object.assign(window.__nrStorage, values) }, local: { get: (defaults, cb) => cb(defaults), set: () => {} }, onChanged: { addListener: () => {} } }, runtime: { onMessage: { addListener: () => {} } } };
  }, "Chrome");
  assert.ok(await chromePage.locator("html.nr-blue-light-active").count(), "Chrome applies the scheduled blue-light class");
  await chromePage.close();

  const firefoxPage = await context.newPage();
  await runMode(firefoxPage, read("firefox", "reading-mode.js"), () => {
    window.chrome = { storage: { sync: { get: () => Promise.resolve({ nrSettings: { focus: true, blueLight: false, eyeRest: false, motion: false } }), set: () => Promise.resolve() }, local: { get: () => Promise.resolve({}), set: () => Promise.resolve() }, onChanged: { addListener: () => {} } }, runtime: { onMessage: { addListener: () => {} } } };
    window.browser = { storage: { sync: { get: () => Promise.resolve({ nrSettings: { focus: true, blueLight: false, eyeRest: false, motion: false } }), set: () => Promise.resolve() }, local: { get: () => Promise.resolve({}), set: () => Promise.resolve() }, onChanged: { addListener: () => {} } }, runtime: { onMessage: { addListener: () => {} } } };
  }, "Firefox-compatible");
  await firefoxPage.close();

  const safariPage = await context.newPage();
  await runMode(safariPage, read("safari", "reading-mode.js"), () => {
    window.__nrStorage = { nrSettings: { focus: true, blueLight: true, eyeRest: false, motion: false }, nrBlueStart: "00:00", nrBlueEnd: "23:59" };
    window.browser = { storage: { sync: { get: (defaults) => Promise.resolve(Object.assign({}, defaults, window.__nrStorage)), set: (values) => { Object.assign(window.__nrStorage, values); return Promise.resolve(); } }, local: { get: (defaults) => Promise.resolve(defaults), set: () => Promise.resolve() }, onChanged: { addListener: () => {} } }, runtime: { onMessage: { addListener: () => {} } } };
  }, "Safari-compatible");
  assert.ok(await safariPage.locator("html.nr-blue-light-active").count(), "Safari applies the scheduled blue-light class");
  await safariPage.close();

  await context.close();
  await browser.close();
  await server.close();
  console.log("Phase 31 focus-tool e2e passed.");
})().catch((error) => { console.error(error); process.exit(1); });
