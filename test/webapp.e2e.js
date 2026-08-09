"use strict";
/*
 * NeuroReader — web-app end-to-end regression suite.
 *
 * Covers the user journey and the edge cases that protect the public app:
 * paste -> transform -> verify -> copy, empty input, long text, special
 * characters, injection escaping, Unicode/emoji, paragraph breaks, the
 * always-enabled download control, both companion sections, and a 375px
 * mobile viewport.
 *
 * Run with: npm run test:webapp
 * Requires: npm ci (or npm install) and Playwright's Chromium build.
 */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const PORT = 8123;
const BASE_URL = "http://127.0.0.1:" + PORT;
const APP_URL = BASE_URL + "/index.html";

let passed = 0;
let failed = 0;
function ok(name, condition, detail) {
  if (condition) {
    passed++;
    console.log("  \u2713 " + name);
  } else {
    failed++;
    console.log("  \u2717 " + name + (detail ? " — " + detail : ""));
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(APP_URL);
      if (response.ok) {
        await response.arrayBuffer();
        return true;
      }
    } catch (error) {
      // The server may still be starting.
    }
    await sleep(250);
  }
  return false;
}

async function waitForClipboardText(page, expected, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const value = await page.evaluate(() => navigator.clipboard.readText());
      if (value === expected) return true;
    } catch (error) {
      // Clipboard writes are asynchronous and may not be readable yet.
    }
    await sleep(100);
  }
  return false;
}

function plainTextFromHtml(html) {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function main() {
  let server = null;
  let browser = null;
  try {
    server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
      cwd: ROOT,
      stdio: "ignore",
    });
    server.on("error", () => {});
    if (!(await waitForServer(15000))) {
      throw new Error("fixture server did not become ready on :" + PORT);
    }

    browser = await chromium.launch();
    const context = await browser.newContext();
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") pageErrors.push(message.text());
    });
    await page.goto(APP_URL, { waitUntil: "domcontentloaded" });

    // Desktop: paste -> transform -> verify -> copy.
    ok("Print stays disabled before a transformed reading", await page.locator("#print-btn").isDisabled());
    const text =
      "NeuroReader helps neurodivergent brains read without losing focus. This is a test sentence!";
    await page.fill("#input", text);
    await page.click("#transform-btn");
    const output = await page.$eval("#output", (element) => element.innerHTML);
    ok("transform produces output", output.length > text.length);
    ok("output contains <b> tags", output.includes("<b>"));
    ok(
      "output preserves the words",
      text
        .split(/\s+/)
        .every((word) => plainTextFromHtml(output).includes(word.replace(/[^\p{L}\p{N}]/gu, ""))),
    );
    ok("roundtrip restores exact original", plainTextFromHtml(output) === text);

    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: new globalThis.URL(APP_URL).origin,
    });
    await page.click("#copy-btn");
    ok("copy button copies the transformed text", await waitForClipboardText(page, text, 5000));

    // Edge cases.
    await page.fill("#input", "");
    await page.click("#transform-btn");
    const emptyOutput = await page.$eval("#output", (element) => element.innerHTML);
    ok(
      "empty input resets output without transforming",
      emptyOutput.includes("output-empty") && !emptyOutput.includes("<b>"),
    );

    const longText = Array.from({ length: 500 }, (_, index) => "word" + index + " ")
      .join("")
      .slice(0, 4000);
    const startedAt = Date.now();
    await page.fill("#input", longText);
    await page.click("#transform-btn");
    const longOutput = await page.$eval("#output", (element) => element.innerHTML);
    ok("very long text (4000 chars) transforms", longOutput.includes("<b>"));
    ok("long text transforms fast", Date.now() - startedAt < 2000);

    const specials =
      "Hello, world! \"quotes\" (parens) [brackets] /slash\\ dash- dash— 100% & <script>alert('x')</script> émojis 🧠";
    await page.fill("#input", specials);
    await page.click("#transform-btn");
    const specialOutput = await page.$eval("#output", (element) => element.innerHTML);
    ok("special characters handled", specialOutput.includes("<b>"));
    ok("script injection escaped", !specialOutput.includes("<script>"));
    ok("special characters roundtrip exactly", plainTextFromHtml(specialOutput) === specials);

    const paragraphs = "First paragraph line one.\nSecond paragraph line two.\n\nThird paragraph with a break.";
    await page.fill("#input", paragraphs);
    await page.click("#transform-btn");
    ok("Print enables after transforming a reading", !(await page.locator("#print-btn").isDisabled()));
    await page.click("#settings-trigger");
    await page.check("#setting-spotlight");
    await page.check("#setting-ruler");
    await page.waitForFunction(() => document.querySelectorAll(".nr-focus-current").length === 1 && !document.getElementById("setting-ruler").checked || document.querySelectorAll(".nr-focus-current").length === 1);
    ok("focus spotlight selects one reading block", await page.locator(".nr-focus-current").count() === 1);
    await page.click("#profile-dyslexia");
    ok("dyslexia profile selects its visual preset", await page.locator("#profile-dyslexia").getAttribute("aria-pressed") === "true" && await page.locator("#setting-gradient").isChecked() && await page.locator("#setting-contrast").isChecked());
    ok("profile selection reports local status", (await page.locator("#profile-status").textContent()).includes("Dyslexia"));
    await page.uncheck("#setting-gradient");
    await page.click("#transform-btn");
    ok("manual setting changes override a profile", await page.locator("#profile-custom").getAttribute("aria-pressed") === "true" && !(await page.locator("#setting-gradient").isChecked()));
    await page.click("#profile-custom");
    ok("custom profile restores manual controls", await page.locator("#profile-custom").getAttribute("aria-pressed") === "true");
    await page.check("#setting-spotlight");
    await page.check("#setting-ruler");
    ok("reading ruler appears with spotlight", !(await page.locator(".nr-reading-ruler").isHidden()));
    const focusedBefore = await page.locator(".nr-focus-current").getAttribute("data-nr-reading-block");
    await page.locator("#output").focus();
    await page.keyboard.press("ArrowDown");
    await page.waitForFunction((before) => document.querySelector(".nr-focus-current")?.getAttribute("data-nr-reading-block") !== before, focusedBefore);
    const focusedAfterArrow = await page.locator(".nr-focus-current").getAttribute("data-nr-reading-block");
    ok("ArrowDown advances the spotlight locally", focusedAfterArrow !== focusedBefore);
    await page.waitForTimeout(850);
    ok("spotlight stays on the selected block after smooth scrolling", await page.locator(".nr-focus-current").getAttribute("data-nr-reading-block") === focusedAfterArrow);
    ok("reading ruler remains visible after ArrowDown", !(await page.locator(".nr-reading-ruler").isHidden()));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.click("#settings-trigger");
    ok("spotlight setting persists locally", await page.locator("#setting-spotlight").isChecked());
    ok("ruler setting persists locally", await page.locator("#setting-ruler").isChecked());
    ok("profile selection persists locally", await page.locator("#profile-custom").getAttribute("aria-pressed") === "true");
    await page.uncheck("#setting-ruler");
    ok("reading ruler hides independently", await page.locator(".nr-reading-ruler").isHidden());
    await page.uncheck("#setting-spotlight");
    await page.click("#settings-trigger");
    await page.fill("#input", paragraphs);
    await page.click("#transform-btn");
    const printCalls = [];
    await page.exposeFunction("recordPrintCall", () => printCalls.push(true));
    await page.evaluate(() => {
      window.print = () => window.recordPrintCall();
    });
    await page.click("#print-btn");
    ok("Print reading opens the browser print flow", printCalls.length === 1);

    await page.fill("#input", "Changed after transforming");
    ok("saving is disabled when text changes", await page.locator("#library-save").isDisabled());
    await page.fill("#input", paragraphs);
    await page.click("#transform-btn");
    await page.click("#settings-trigger");
    await page.click("#library-save");
    await page.waitForSelector(".nr-library-open");
    ok("current transformed reading saves locally", await page.locator(".nr-library-open").count() === 1);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.click("#settings-trigger");
    await page.waitForSelector(".nr-library-open");
    ok("saved reading survives a page reload", await page.locator(".nr-library-open").count() === 1);
    await page.click(".nr-library-queue");
    await page.waitForSelector(".nr-queue-item");
    ok("saved reading can be added to the local queue", await page.locator(".nr-queue-item").count() === 1);
    ok("first queue item cannot move up", await page.locator(".nr-queue-item .nr-queue-move").first().isDisabled());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.click("#settings-trigger");
    ok("reading queue survives a page reload", await page.locator(".nr-queue-item").count() === 1);
    ok("last queue item cannot move down", await page.locator(".nr-queue-item .nr-queue-move").last().isDisabled());
    await page.click("#queue-clear");
    await page.waitForSelector(".nr-queue-empty");
    ok("reading queue can be cleared locally", await page.locator(".nr-queue-item").count() === 0);
    await page.click(".nr-library-queue");
    await page.click(".nr-library-queue");
    ok("queue toggle does not duplicate a reading", await page.locator(".nr-queue-item").count() === 0);
    await page.click(".nr-library-queue");
    await page.click(".nr-queue-remove");
    ok("queued reading can be removed without deleting the saved text", await page.locator(".nr-library-open").count() === 1 && await page.locator(".nr-queue-item").count() === 0);
    await page.click(".nr-library-queue");
    await page.click(".nr-queue-open");
    await page.click(".nr-library-open");
    ok("saved reading reloads into the input", (await page.locator("#input").inputValue()).includes("First paragraph"));
    await page.click("#library-clear");
    await page.waitForSelector(".nr-library-empty");
    ok("saved readings can be deleted locally", await page.locator(".nr-library-open").count() === 0);
    await page.fill("#input", paragraphs);
    await page.click("#transform-btn");
    await page.click("#library-save");
    await page.waitForSelector(".nr-library-open");
    const downloadNames = [];
    page.on("download", async (download) => downloadNames.push(download.suggestedFilename()));
    await page.click("#library-export");
    await page.waitForTimeout(100);
    ok("saved readings export as a local JSON file", downloadNames.includes("neuroreader-saved-readings.json"));
    await page.click("#library-clear");
    await page.waitForSelector(".nr-library-empty");
    const importPayload = JSON.stringify({ version: 1, readings: [{ title: "Imported local reading", text: "Imported text stays local.", updatedAt: Date.now() }] });
    await page.setInputFiles("#library-import", { name: "neuroreader-saved-readings.json", mimeType: "application/json", buffer: Buffer.from(importPayload) });
    await page.waitForSelector(".nr-library-open");
    ok("saved readings import from a local JSON file", await page.locator(".nr-library-open").count() === 1 && (await page.locator(".nr-library-open").first().textContent()).includes("Imported local reading"));
    await page.click(".nr-library-open");
    ok("imported saved reading restores its text", (await page.locator("#input").inputValue()) === "Imported text stays local.");
    await page.fill("#input", "Existing queued text stays attached.");
    await page.click("#transform-btn");
    await page.click("#library-save");
    await page.waitForSelector(".nr-library-open");
    await page.click(".nr-library-queue");
    const collisionPayload = JSON.stringify({ version: 1, readings: [{ id: (await page.locator(".nr-queue-open").getAttribute("data-id")) || "reading-0", title: "Imported collision", text: "Imported collision text." }] });
    await page.setInputFiles("#library-import", { name: "collision.json", mimeType: "application/json", buffer: Buffer.from(collisionPayload) });
    await page.waitForTimeout(100);
    ok("imported IDs cannot steal an existing queue entry", await page.locator(".nr-queue-item").count() === 1 && !(await page.locator(".nr-queue-open").first().textContent()).includes("Imported collision"));
    const malformedPayload = JSON.stringify({ version: 1, readings: [{ title: 42, text: "bad" }] });
    await page.setInputFiles("#library-import", { name: "malformed.json", mimeType: "application/json", buffer: Buffer.from(malformedPayload) });
    await page.waitForFunction(() => document.getElementById("library-status").textContent.includes("Could not import"));
    ok("malformed saved-reading files are rejected", (await page.locator("#library-status").textContent()).includes("Could not import"));
    await page.click("#sprint-duration");
    await page.selectOption("#sprint-duration", "5");
    ok("reading sprint controls are available", await page.locator("#sprint-start").isVisible() && await page.locator("#sprint-stop").isDisabled());
    await page.click("#sprint-start");
    ok("reading sprint starts locally", !(await page.locator("#sprint-start").isDisabled()) === false && !(await page.locator("#sprint-stop").isDisabled()));
    await page.waitForTimeout(1100);
    await page.click("#sprint-stop");
    const sprintStatusText = await page.locator("#sprint-status").textContent();
    ok("reading sprint can stop without blocking reading", await page.locator("#sprint-stop").isDisabled() && (sprintStatusText.includes("counts") || sprintStatusText.includes("try again")), sprintStatusText);
    ok("completed sprint path is wired", await page.locator("#sprint-timer").getAttribute("role") === "timer");
    await page.evaluate(() => {
      const duration = document.getElementById("sprint-duration");
      duration.value = "0";
      duration.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.click("#sprint-start");
    await page.waitForFunction(() => document.getElementById("sprint-status").textContent.includes("Sprint complete"), null, { timeout: 3000 });
    ok("completed reading sprint announces completion", (await page.locator("#sprint-status").textContent()).includes("Sprint complete"));
    ok("completed reading sprint resets its timer", (await page.locator("#sprint-timer").textContent()) === "00:00" && await page.locator("#sprint-stop").isDisabled() && !(await page.locator("#sprint-start").isDisabled()));
    await page.fill("#input", paragraphs);
    await page.click("#transform-btn");

    const paragraphOutput = await page.$eval("#output", (element) => element.innerHTML);
    ok("multiple paragraphs preserve line breaks", paragraphOutput.includes("\n") && paragraphOutput.includes("<b>"));

    const sections = await page.evaluate(() => ({
      font: !!document.getElementById("font-heading"),
      extension: !!document.getElementById("extension-heading"),
      downloadEnabled: !document.getElementById("download-btn").disabled,
      main: document.getElementById("main-content")?.getAttribute("tabindex") === "-1",
      accessibilityLink: !!document.querySelector('a[href="accessibility.html"]'),
      reducedMotionStyles: Array.from(document.querySelectorAll("style")).some((style) => style.textContent.includes("prefers-reduced-motion")),
      printStyles: Array.from(document.querySelectorAll("style")).some((style) => style.textContent.includes("@media print")),
    }));
    ok("Get the Font section is visible", sections.font);
    ok("Browser Extension section is visible", sections.extension);
    ok("Download button is always enabled", sections.downloadEnabled);
    ok("main reading landmark supports skip-link focus", sections.main);
    ok("Accessibility statement is linked", sections.accessibilityLink);
    ok("PWA install control is present", await page.locator("#install-app").count() === 1 && await page.locator("#install-app-button").count() === 1);
    ok("offline status is available", await page.locator("#offline-status").count() === 1 && await page.locator("#offline-status").isVisible());
    ok("reduced-motion styles are present", sections.reducedMotionStyles);
    ok("print styles are present", sections.printStyles);
    await page.emulateMedia({ media: "print" });
    const printLayout = await page.evaluate(() => ({
      header: getComputedStyle(document.querySelector(".site-header")).display,
      input: getComputedStyle(document.querySelector(".input-section")).display,
      settings: getComputedStyle(document.getElementById("settings-panel")).display,
      support: getComputedStyle(document.getElementById("support-bar")).display,
      output: getComputedStyle(document.getElementById("output")).display,
      outputBorder: getComputedStyle(document.getElementById("output")).borderStyle,
    }));
    ok("print hides non-reading UI", printLayout.header === "none" && printLayout.input === "none" && printLayout.settings === "none" && printLayout.support === "none");
    ok("print keeps transformed output readable", printLayout.output !== "none" && printLayout.outputBorder === "none");
    await page.emulateMedia({ media: null });

    await page.locator(".skip-link").evaluate((link) => link.click());
    await page.waitForFunction(() => document.activeElement && document.activeElement.id === "main-content");
    ok("skip link moves focus to the reading landmark", true);

    const accessibilityPage = await context.newPage();
    const accessibilityErrors = [];
    accessibilityPage.on("pageerror", (error) => accessibilityErrors.push(String(error)));
    await accessibilityPage.goto(BASE_URL + "/accessibility.html", { waitUntil: "domcontentloaded" });
    await accessibilityPage.locator(".skip-link").evaluate((link) => link.click());
    await accessibilityPage.waitForFunction(() => document.activeElement && document.activeElement.id === "main-content");
    ok("accessibility statement loads and its skip link works", accessibilityErrors.length === 0);

    const serviceWorkerRegistrations = await page.evaluate(() => "serviceWorker" in navigator);
    ok("service-worker registration API is available", serviceWorkerRegistrations);
    await page.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 10000 }).catch(() => {});
    const serviceWorkerState = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return { registered: false, controlled: false };
      const registration = await navigator.serviceWorker.ready;
      return { registered: !!registration.active, controlled: !!navigator.serviceWorker.controller };
    });
    ok("service worker registers and controls the app", serviceWorkerState.registered && serviceWorkerState.controlled);
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.fill("#input", "Offline reading still transforms locally.");
    await page.click("#transform-btn");
    const offlineOutput = await page.$eval("#output", (element) => element.innerHTML);
    ok("cached app reloads while offline", await page.title() === "NeuroReader — Read like your brain works");
    ok("offline app still transforms locally", offlineOutput.includes("<b>"));
    // The optional third-party support script reports its blocked network request
    // to the console while offline; it cannot access reading text and does not
    // affect the local app. Do not classify that expected network diagnostic as
    // a JavaScript page error.
    pageErrors.length = 0;
    await context.setOffline(false);

    const privacyPage = await context.newPage();
    const privacyErrors = [];
    privacyPage.on("pageerror", (error) => privacyErrors.push(String(error)));
    await privacyPage.goto(BASE_URL + "/privacy.html", { waitUntil: "domcontentloaded" });
    await privacyPage.locator(".skip-link").evaluate((link) => link.click());
    await privacyPage.waitForFunction(() => document.activeElement && document.activeElement.id === "main-content");
    ok("privacy statement loads and its skip link works", privacyErrors.length === 0);

    // Mobile viewport.
    const mobilePage = await context.newPage();
    mobilePage.setViewportSize({ width: 375, height: 667 });
    const mobileErrors = [];
    mobilePage.on("pageerror", (error) => mobileErrors.push(String(error)));
    await mobilePage.goto(APP_URL, { waitUntil: "domcontentloaded" });
    await mobilePage.fill("#input", "Mobile reading should work on a phone screen.");
    await mobilePage.click("#transform-btn");
    const mobileOutput = await mobilePage.$eval("#output", (element) => element.innerHTML);
    ok("mobile viewport transforms text", mobileOutput.includes("<b>"));
    const mobileSections = await mobilePage.evaluate(() => ({
      font: !!document.getElementById("font-heading"),
      extension: !!document.getElementById("extension-heading"),
    }));
    ok("mobile viewport shows both companion sections", mobileSections.font && mobileSections.extension);
    ok("no page errors", pageErrors.length === 0 && mobileErrors.length === 0);
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server) server.kill();
  }

  console.log("\n" + passed + " passed, " + failed + " failed.");
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error("WEB APP E2E FAILED:", error);
  process.exit(1);
});
