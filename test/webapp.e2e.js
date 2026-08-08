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
      if (response.ok) return true;
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
    const paragraphOutput = await page.$eval("#output", (element) => element.innerHTML);
    ok("multiple paragraphs preserve line breaks", paragraphOutput.includes("\n") && paragraphOutput.includes("<b>"));

    const sections = await page.evaluate(() => ({
      font: !!document.getElementById("font-heading"),
      extension: !!document.getElementById("extension-heading"),
      downloadEnabled: !document.getElementById("download-btn").disabled,
    }));
    ok("Get the Font section is visible", sections.font);
    ok("Browser Extension section is visible", sections.extension);
    ok("Download button is always enabled", sections.downloadEnabled);

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
