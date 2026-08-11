"use strict";

const { chromium } = require("playwright");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "store-assets");
const PACKAGE_ROOT = path.join(ROOT, ".store-assets-package");
const VERSION = "0.1.0";

function run(script, output) {
  const result = spawnSync(process.execPath, [script, "--version", VERSION, "--out", output], { cwd: ROOT, encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `${script} failed`);
}
async function findExtensionIds(page) {
  await page.goto("chrome://extensions/");
  await page.waitForTimeout(650);
  return page.evaluate(() => {
    function walk(root) {
      let found = [];
      root.querySelectorAll("extensions-item").forEach((item) => {
        if (item.id) found.push({ id: item.id, text: item.shadowRoot ? item.shadowRoot.textContent : "" });
      });
      root.querySelectorAll("*").forEach((item) => { if (item.shadowRoot) found = found.concat(walk(item.shadowRoot)); });
      return found;
    }
    return walk(document);
  });
}
async function makeVideoFixture(page) {
  return page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 360;
    const stream = canvas.captureStream(30); const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp8" }); const parts = [];
    const done = new Promise((resolve) => { recorder.onstop = async () => resolve(Array.from(new Uint8Array(await new Blob(parts, { type: "video/webm" }).arrayBuffer()))); });
    recorder.ondataavailable = (event) => { if (event.data.size) parts.push(event.data); };
    const context = canvas.getContext("2d"); let frame = 0; recorder.start();
    const draw = () => { context.fillStyle = frame % 2 ? "#f97316" : "#24170f"; context.fillRect(0, 0, canvas.width, canvas.height); context.fillStyle = "#fff"; context.font = "bold 28px sans-serif"; context.fillText("ClipForge local preview", 26, 60); frame++; if (frame < 90) requestAnimationFrame(draw); else recorder.stop(); };
    draw(); return done;
  });
}
async function main() {
  fs.rmSync(PACKAGE_ROOT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
  run("tools/package-clipforge.js", path.join(PACKAGE_ROOT, "compressor")); run("tools/package-image-vault.js", path.join(PACKAGE_ROOT, "lockbox"));
  const compressorDir = path.join(PACKAGE_ROOT, "compressor", `clipforge-chrome-v${VERSION}`); const lockboxDir = path.join(PACKAGE_ROOT, "lockbox", `clipforge-lockbox-chrome-v${VERSION}`);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "clipforge-store-"));
  const context = await chromium.launchPersistentContext(profile, { headless: false, viewport: { width: 1280, height: 800 }, args: [`--disable-extensions-except=${compressorDir},${lockboxDir}`, `--load-extension=${compressorDir},${lockboxDir}`] });
  try {
    const probe = await context.newPage(); const loaded = await findExtensionIds(probe);
    const compressorId = loaded.find((item) => item.text.includes("ClipForge") && item.text.includes("Local Video Compressor"))?.id;
    const lockboxId = loaded.find((item) => item.text.includes("ClipForge Lockbox") && item.text.includes("Private Image Vault"))?.id;
    if (!compressorId || !lockboxId) throw new Error("Could not locate both packaged extension IDs by manifest name");

    const compressor = await context.newPage(); await compressor.goto(`chrome-extension://${compressorId}/app.html`); await compressor.screenshot({ path: path.join(OUT, "clipforge-compressor-01-dropzone-1280x800.png"), type: "png" }); fs.copyFileSync(path.join(compressorDir, "icons", "clipforge-128.png"), path.join(OUT, "clipforge-compressor-icon-128.png"));
    const fixture = await makeVideoFixture(compressor); await compressor.locator("#file-input").setInputFiles({ name: "clipforge-demo.webm", mimeType: "video/webm", buffer: Buffer.from(fixture) }); await compressor.waitForFunction(() => !document.getElementById("settings-panel").hidden, null, { timeout: 15000 }); await compressor.screenshot({ path: path.join(OUT, "clipforge-compressor-02-settings-1280x800.png"), type: "png" }); await compressor.click("#compress-button"); await compressor.waitForFunction(() => !document.getElementById("result-panel").hidden, null, { timeout: 30000 }); await compressor.screenshot({ path: path.join(OUT, "clipforge-compressor-03-result-1280x800.png"), type: "png" }); await compressor.setViewportSize({ width: 640, height: 400 }); await compressor.screenshot({ path: path.join(OUT, "clipforge-compressor-04-mobile-640x400.png"), type: "png" });

    const lockbox = await context.newPage(); await lockbox.goto(`chrome-extension://${lockboxId}/app.html`); await lockbox.waitForSelector(".top-ad-slot"); await lockbox.screenshot({ path: path.join(OUT, "clipforge-lockbox-01-locked-1280x800.png"), type: "png" }); fs.copyFileSync(path.join(lockboxDir, "icons", "clipforge-lockbox-128.png"), path.join(OUT, "clipforge-lockbox-icon-128.png")); await lockbox.fill("#vault-password", "correct horse battery staple"); await lockbox.click("#unlock-button"); await lockbox.waitForSelector("#vault-view:not([hidden])"); await lockbox.screenshot({ path: path.join(OUT, "clipforge-lockbox-02-empty-unlocked-1280x800.png"), type: "png" });
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAASwAAAEsCAIAAAD2HxkiAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH6QgKDAo0cWf2WQAAAB1pVFh0Q29tbWVudAAAAAAAQ3JlYXRlZCB3aXRoIEdJTVAgbWVyZ2VkAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB1JREFUeNrtwTEBAAAAwqD1T20ND6AAAAAAAAAAAAAAAAD4G0yAAAXc7QmAAAAAElFTkSuQmCC", "base64"); await lockbox.locator("#image-input").setInputFiles({ name: "demo-image.png", mimeType: "image/png", buffer: png }); await lockbox.waitForFunction(() => /encrypted and saved/i.test(document.getElementById("upload-status").textContent), null, { timeout: 15000 }); await lockbox.screenshot({ path: path.join(OUT, "clipforge-lockbox-03-image-saved-1280x800.png"), type: "png" }); await lockbox.setViewportSize({ width: 640, height: 400 }); await lockbox.screenshot({ path: path.join(OUT, "clipforge-lockbox-04-mobile-640x400.png"), type: "png" });
  } finally { await context.close(); fs.rmSync(PACKAGE_ROOT, { recursive: true, force: true }); }
  console.log("ClipForge store screenshots and package logos captured.");
}
main().catch((error) => { console.error(error.stack || error); process.exit(1); });
