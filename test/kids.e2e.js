"use strict";
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const path = require("path");
(async () => {
  const root = path.resolve(__dirname, "..");
  const server = spawn("python3", ["-m", "http.server", "8124", "--bind", "127.0.0.1"], { cwd: root, stdio: "ignore" });
  try {
    await new Promise((resolve) => setTimeout(resolve, 700));
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto("http://127.0.0.1:8124/kids.html", { waitUntil: "domcontentloaded" });
    await page.fill("#kids-input", "A bright story helps kids read with joy.");
    await page.click("#kids-transform");
    const state = await page.evaluate(() => ({
      output: document.getElementById("kids-output").innerHTML,
      words: document.getElementById("kids-words").textContent,
      mobile: innerWidth === 375,
    }));
    if (!state.output.includes("data-nr-fixation") || !state.output.includes("linear-gradient") || !/words today/.test(state.words) || !state.mobile || errors.length) throw new Error(JSON.stringify({ state, errors }));
    await browser.close();
    console.log("Kids e2e passed.");
  } finally { server.kill(); }
})().catch((error) => { console.error("Kids e2e failed:", error); process.exit(1); });
