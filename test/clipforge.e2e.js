"use strict";

const assert = require("assert");
const { chromium } = require("playwright");
const { spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const repositoryExtension = path.join(ROOT, "extensions", "video-compressor");
const SOURCE_EXT = path.resolve(process.env.CLIPFORGE_EXTENSION_DIR || repositoryExtension);
let passed = 0;
function ok(name, condition) { assert(condition, name); passed++; console.log("  ✓ " + name); }

async function main() {
  let context = null;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-e2e-"));
  const packageRoot = path.join(ROOT, ".clipforge-e2e-package");
  try {
  fs.rmSync(packageRoot, { recursive: true, force: true });
  const packaged = spawnSync(process.execPath, ["tools/package-clipforge.js", "--version", "0.1.0", "--out", packageRoot], { cwd: ROOT, encoding: "utf8" });
  if (packaged.status !== 0) throw new Error(packaged.stderr || packaged.stdout || "ClipForge packaging failed before E2E");
  const extensionDir = path.join(packageRoot, "clipforge-chrome-v0.1.0");
  context = await chromium.launchPersistentContext(profile, {
    headless: false,
    args: [`--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`, "--use-fake-ui-for-media-stream"],
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto("chrome://extensions/");
  await page.waitForTimeout(500);
  const extId = await page.evaluate(() => {
    function walk(root) {
      let ids = [];
      root.querySelectorAll("extensions-item").forEach((item) => ids.push(item.id));
      root.querySelectorAll("*").forEach((element) => { if (element.shadowRoot) ids = ids.concat(walk(element.shadowRoot)); });
      return ids.find((candidate) => candidate && candidate.length === 32) || null;
    }
    return walk(document);
  });
  ok("ClipForge loads in Chromium", !!extId);
  const app = await context.newPage();
  await app.goto(`chrome-extension://${extId}/app.html`);
  await app.waitForSelector("#drop-zone");
  ok("compressor workspace renders", (await app.locator("#page-title").innerText()).includes("Make video files") && (await app.locator("#page-title").innerText()).includes("lighter."));
  ok("top and bottom static ad banners render", await app.locator(".ad-slot").count() === 2 && await app.locator(".top-ad-slot").count() === 1 && await app.locator(".support-area .ad-slot").count() === 1 && await app.locator(".coffee-link").count() === 1);
  ok("no host permissions are exposed", !(await app.evaluate(() => chrome.runtime.getManifest().host_permissions)));
  ok("toolbar action is configured as a popup", await app.evaluate(() => chrome.runtime.getManifest().action.default_popup === "app.html"));
  ok("packaged icon metadata is present", await app.evaluate(() => {
    const manifest = chrome.runtime.getManifest();
    return manifest.icons && manifest.icons["16"] === "icons/clipforge-16.png" && manifest.icons["48"] === "icons/clipforge-48.png" && manifest.icons["128"] === "icons/clipforge-128.png";
  }));

  const fixturePath = path.join(profile, "fixture.webm");
  await app.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 320; canvas.height = 180;
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" });
    const parts = [];
    recorder.ondataavailable = (event) => parts.push(event.data);
    window.__fixtureReady = new Promise((resolve) => {
      recorder.onstop = async () => resolve(Array.from(new Uint8Array(await new Blob(parts, { type: "video/webm" }).arrayBuffer())));
    });
    const ctx = canvas.getContext("2d");
    let frame = 0;
    recorder.start();
    const draw = () => {
      ctx.fillStyle = frame % 2 ? "#f97316" : "#24170f";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      frame++;
      if (frame < 45) requestAnimationFrame(draw); else recorder.stop();
    };
    draw();
  });
  const fixture = await app.evaluate(() => window.__fixtureReady);
  fs.writeFileSync(fixturePath, Buffer.from(fixture));
  ok("generated local WebM fixture", fs.statSync(fixturePath).size > 0);

  await app.locator("#file-input").setInputFiles(fixturePath);
  await app.waitForFunction(() => !document.getElementById("settings-panel").hidden, null, { timeout: 15000 });
  ok("local file selection reveals compression settings", true);
  await app.click('[data-preset="small"]');
  ok("small-file preset updates controls", await app.locator("#resolution").inputValue() === "480" && await app.locator("#quality").inputValue() === "small");
  await app.click("#compress-button");
  await app.waitForFunction(() => !document.getElementById("result-panel").hidden, null, { timeout: 30000 });
  ok("local compression reaches a successful result", true);
  ok("result exposes a WebM download", (await app.locator("#download-button").getAttribute("download")).endsWith("-compressed.webm"));
  ok("result reports output metadata", (await app.locator("#result-meta").textContent()).includes("×"));
  ok("compress another remains available", await app.locator("#compress-another").isVisible() && await app.locator("#compress-button").isEnabled());
  ok("no runtime page errors", errors.length === 0);
  console.log(`\n${passed} passed.`);
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(packageRoot, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error("CLIPFORGE E2E FAILED:", error); process.exit(1); });
