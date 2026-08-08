"use strict";
/*
 * NeuroReader — minify tooling (protects the Variable Fixation Formula).
 *
 * Usage:
 *   node tools/minify.js web        -> regenerate formula.min.js from
 *                                      extensions/chrome/formula.js (the
 *                                      canonical engine the tests verify)
 *   node tools/minify.js ext <dir>  -> minify the JS in a packaged copy of an
 *                                      extension dir (for store submission)
 *
 * Notes:
 * - formula.min.js is what index.html ships: <script src="formula.min.js">.
 * - npm test runs the 22 assertions against formula.min.js, so regenerating
 *   and breaking the formula fails CI. Never hand-edit formula.min.js.
 * - Extensions: minify a COPY, keep the readable source in the repo (the
 *   extension source is what reviewers read; the packaged ZIP ships minified).
 * - Font files are binary — never minified.
 */
const fs = require("fs");
const path = require("path");
const terser = require("terser");

const ROOT = path.join(__dirname, "..");
const CANONICAL = path.join(ROOT, "extensions", "chrome", "formula.js");
const OUT_WEB = path.join(ROOT, "formula.min.js");

// JS files in an extension that can be minified safely (no dynamic import
// strings, no content-security exceptions in the MV3 manifest).
const MINIFYABLE = ["formula.js", "content.js", "popup.js", "background.js"];

const PREAMBLE =
  "/*! NeuroReader Variable Fixation Formula. " +
  "Source: extensions/chrome/formula.js | Regenerate: npm run build:min */";

async function minifyWeb() {
  const src = fs.readFileSync(CANONICAL, "utf8");
  const out = await terser.minify(src, {
    compress: { passes: 2, dead_code: true },
    mangle: true,
    format: { comments: /^!/, preamble: PREAMBLE },
  });
  if (out.error) throw out.error;
  fs.writeFileSync(OUT_WEB, out.code);
  const ratio = ((out.code.length / src.length) * 100).toFixed(1);
  console.log(
    `formula.min.js: ${src.length} -> ${out.code.length} bytes (${ratio}%)`,
  );
  console.log("Verify with: npm test");
}

async function minifyExtension(dir) {
  const abs = path.isAbsolute(dir) ? dir : path.join(ROOT, dir);
  if (!fs.existsSync(abs)) {
    throw new Error(`Extension dir not found: ${abs}`);
  }
  let n = 0;
  for (const file of MINIFYABLE) {
    const p = path.join(abs, file);
    if (!fs.existsSync(p)) continue;
    const src = fs.readFileSync(p, "utf8");
    const out = await terser.minify(src, {
      compress: { passes: 1, dead_code: true },
      mangle: true,
      format: { comments: /^!/ },
    });
    if (out.error) throw new Error(`terser failed on ${file}: ${out.error}`);
    fs.writeFileSync(p, out.code);
    n++;
    console.log(`minified ${file}: ${src.length} -> ${out.code.length} bytes`);
  }
  console.log(`Done: ${n} file(s) minified in ${abs}`);
  console.log(
    "Tip: run this on a COPY (e.g. a zip-staging folder), not the repo source.",
  );
}

async function main() {
  const cmd = process.argv[2];
  if (cmd === "web") {
    await minifyWeb();
  } else if (cmd === "ext") {
    const dir = process.argv[3];
    if (!dir) throw new Error("usage: node tools/minify.js ext <dir>");
    await minifyExtension(dir);
  } else {
    throw new Error(
      "usage: node tools/minify.js web | node tools/minify.js ext <dir>",
    );
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
