"use strict";
/*
 * NeuroReader — Firefox (MV2) e2e
 *
 * Playwright's bundled Firefox (the "Juggler" build) cannot load extensions
 * through any supported path — verified empirically:
 *   - Playwright has no Firefox extension API (Chromium-only).
 *   - Pre-installing the XPI into the profile's extensions/ dir never
 *     registers the addon (extensions.json only lists Mozilla built-ins),
 *     even with enabledScopes=15 and signatures.required=false applied.
 *   - about:debugging hangs and crashes the Juggler context.
 *   - Neither RDP, CDP, nor Marionette is served by this build.
 *
 * So this suite proves what IS provable on the Firefox build:
 *   1. Shared runtime files are byte-identical to the Chromium build that
 *      passes 22 DOM e2e checks (only manifest.json differs).
 *   2. The MV2 manifest passes Mozilla's own validator (web-ext lint).
 *   3. The addon genuinely installs and launches in this exact Firefox
 *      binary via web-ext run (Mozilla's official tool) with no errors.
 *
 * Requires:  npx playwright install firefox   (one time)
 * Run with:  node test/firefox.e2e.js
 */
const { spawn, execSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const net = require("net");

const ROOT = path.resolve(__dirname, "..");
const FF = path.join(ROOT, "extensions", "firefox");
const CHROME = path.join(ROOT, "extensions", "chrome");
const SAFARI = path.join(ROOT, "extensions", "safari");
const SHARED = ["formula.js", "content.js", "popup.html", "popup.js", "styles.css"];
const FIXTURE = "http://127.0.0.1:8111/test/fixtures/hardpage.html";
const PORT = 8111;

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
const md5 = (p) => crypto.createHash("md5").update(fs.readFileSync(p)).digest("hex");

function spawnCapture(cmd, args, opts) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { ...opts, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("close", (code) => resolve({ code, out, err, child }));
  });
}

async function waitForHttp(port, pathname, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch("http://127.0.0.1:" + port + pathname);
      if (res.ok) return true;
    } catch (e) {}
    await sleep(400);
  }
  return false;
}

function portFree(port) {
  return new Promise((resolve) => {
    const s = net.createConnection({ port, host: "127.0.0.1" });
    s.on("connect", () => { s.destroy(); resolve(false); });
    s.on("error", () => resolve(true));
  });
}

async function main() {
  console.log("NeuroReader Firefox (MV2) e2e\n");

  // ---- 0. Firefox binary available? --------------------------------------
  let ffBin = null;
  try {
    ffBin = require("playwright").firefox.executablePath();
    if (!ffBin || !fs.existsSync(ffBin)) ffBin = null;
  } catch (e) {}
  if (!ffBin) {
    console.log("  \u2717 Playwright Firefox not installed.\n      Run: npx playwright install firefox");
    process.exit(1);
  }
  console.log("  Firefox binary: " + ffBin);

  // ---- 1. Byte-parity of shared runtime code -----------------------------
  for (const f of SHARED) {
    const a = md5(path.join(CHROME, f));
    const b = md5(path.join(FF, f));
    const c = md5(path.join(SAFARI, f));
    ok("shared file identical across chrome/firefox/safari: " + f,
      a === b && a === c,
      "chrome=" + a.slice(0, 8) + " firefox=" + b.slice(0, 8) + " safari=" + c.slice(0, 8));
  }
  const cm = JSON.parse(fs.readFileSync(path.join(CHROME, "manifest.json"), "utf8"));
  const fm = JSON.parse(fs.readFileSync(path.join(FF, "manifest.json"), "utf8"));
  ok("chrome manifest is MV3, firefox manifest is MV2",
    cm.manifest_version === 3 && fm.manifest_version === 2);
  ok("firefox manifest has gecko id", !!(fm.browser_specific_settings && fm.browser_specific_settings.gecko && fm.browser_specific_settings.gecko.id));

  // ---- 2. web-ext lint (Mozilla's MV2 validator) -------------------------
  console.log("\n[web-ext lint]");
  const lint = await spawnCapture("npx", ["--yes", "web-ext", "lint", "--source-dir", FF], { cwd: ROOT, timeout: 120000 });
  const lintSummary = lint.out.match(/errors\s+(\d+)\s*\n\s*notices\s+(\d+)\s*\n\s*warnings\s+(\d+)/);
  if (lintSummary) {
    ok("web-ext lint: 0 errors", lintSummary[1] === "0", "errors=" + lintSummary[1] + " notices=" + lintSummary[2] + " warnings=" + lintSummary[3]);
  } else {
    ok("web-ext lint ran and reported a summary", false, (lint.err || lint.out).slice(0, 200));
  }

  // ---- 3. Real install + launch via web-ext run --------------------------
  console.log("\n[web-ext run — real addon install in Playwright's Firefox]");
  try { execSync("pkill -f 'web-ext run' 2>/dev/null; pkill -f 'start-debugger-server' 2>/dev/null"); } catch (e) {}

  // Self-contained fixture server (repo root on port 8111).
  try { execSync("pkill -f 'http.server " + PORT + "' 2>/dev/null"); } catch (e) {}
  const server = spawn(path.join(ROOT, ".venv", "bin", "python"), ["-m", "http.server", String(PORT)], { cwd: ROOT, stdio: "ignore" });
  const serverUp = await waitForHttp(PORT, "/index.html", 15000);
  ok("fixture server up on :" + PORT, serverUp);
  if (!serverUp) {
    console.log("  (cannot run web-ext install check without the fixture server)");
    server.kill();
    report();
    return;
  }

  const we = spawn("npx", ["--yes", "web-ext", "run",
    "--source-dir", FF,
    "--firefox", ffBin,
    "--start-url", FIXTURE,
    "--no-input"], { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] });
  let weOut = "";
  let weErr = "";
  we.stdout.on("data", (d) => (weOut += d));
  we.stderr.on("data", (d) => (weErr += d));

  // Wait for the addon to be installed by Firefox's AddonManager.
  let installed = false;
  for (let i = 0; i < 90 && !installed; i++) {
    await sleep(1000);
    installed = /Installed .* as a temporary add-on/.test(weOut + weErr);
  }
  ok("addon installed as a temporary add-on by Firefox", installed, "web-ext said: " + (weOut + weErr).replace(/\n/g, " | ").slice(-220));

  let firefoxAlive = false;
  if (installed) {
    // Give Firefox a moment to render the start URL, then confirm it lives.
    await sleep(8000);
    try {
      firefoxAlive = !!execSync("pgrep -f 'start-debugger-server' 2>/dev/null", { encoding: "utf8" }).trim();
    } catch (e) { firefoxAlive = false; }
    ok("Firefox launched and stayed alive with the addon", firefoxAlive);
    const bad = /unable to install|install failed|manifest.*(invalid|error)|FATAL/i.test(weOut + weErr);
    ok("no install/launch errors in web-ext output", !bad, (weOut + weErr).replace(/\n/g, " | ").slice(-220));
  }

  we.kill("SIGTERM");
  server.kill();
  try { execSync("pkill -f 'web-ext run' 2>/dev/null; pkill -f 'start-debugger-server' 2>/dev/null; pkill -f 'http.server " + PORT + "' 2>/dev/null"); } catch (e) {}

  report();
}

function report() {
  console.log(`\n${passed} passed, ${failed} failed.`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error("FIREFOX E2E FAILED:", e.message);
  process.exit(1);
});
