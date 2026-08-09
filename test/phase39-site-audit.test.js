"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const details = fs.readFileSync(path.join(root, "SEO-STORE-DETAILS.md"), "utf8");
const probe = fs.readFileSync(path.join(__dirname, "probe-youtube.js"), "utf8");
const listing = fs.readFileSync(path.join(root, "STORE-LISTING.md"), "utf8");
const crypto = require("crypto");
const formulaFiles = ["formula.min.js", "extensions/chrome/formula.js", "extensions/firefox/formula.js", "extensions/safari/formula.js"];
const formulaHashes = formulaFiles.map((file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"));
const EXPECTED_READABLE_FORMULA_HASH = "73c92fd092fa1d365c6391b70d8cd541a68287e4b9ae848fc5ef061739cd3549";
const EXPECTED_MINIFIED_FORMULA_HASH = "c0da1814936d1871b69568681e8447276f6f6890997085e59f58caac6916d13d";


for (const phrase of [
  "Chrome Web Store",
  "Firefox Add-ons",
  "SEO metadata",
  "Bionic Reading",
  "OpenDyslexic",
  "adaptive bolding",
  "Nothing leaves your browser",
  "does not collect",
  "does not send webpage text",
  "Reddit",
  "X / Twitter",
  "Instagram",
  "GitHub",
  "npm",
  "BBC News",
]) {
  assert.match(details, new RegExp(phrase.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), "i"), `details must include ${phrase}`);
}

const shortDescription = details.match(/### Short description \(80 characters maximum\)\n\n([^\n]+)/i);
assert(shortDescription, "SEO/store details must include the Chrome short description");
assert(shortDescription[1].length <= 80, "Chrome short description must be 80 characters or fewer");
assert.match(details, /not affiliated with or endorsed by/i);
assert.match(details, /Claims we must not make/i);
assert.match(details, /Prove your humanity/i);
assert.match(details, /code samples and package-name code elements remained skipped/i);
assert.match(details, /accessibility control and footer donation/i);

for (const host of [
  '"www.reddit.com"',
  '"github.com"',
  '"www.npmjs.com"',
  '"www.bbc.com"',
  '"www.theguardian.com"',
  '"apnews.com"',
]) {
  assert.match(probe, new RegExp(host.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")), `probe must retain ${host}`);
}

assert.match(listing, /does not collect/i);
assert.match(listing, /never sent/i);
assert.match(details, /not affiliated/i);
assert.ok(fs.readFileSync(path.join(root, "extensions/chrome/popup.js"), "utf8").includes("issues/new?labels=bug,beta&title=NeuroReader%20beta%20issue"));
assert.strictEqual(formulaHashes[0], EXPECTED_MINIFIED_FORMULA_HASH, "shipped minified formula changed");
assert.strictEqual(formulaHashes[1], EXPECTED_READABLE_FORMULA_HASH, "canonical formula changed");
assert.strictEqual(new Set(formulaHashes).size, 2, "minified and readable shipped formula builds remain distinct");
assert.strictEqual(formulaHashes[1], formulaHashes[2], "Chrome and Firefox formula files remain byte-identical");
assert.strictEqual(formulaHashes[2], formulaHashes[3], "Firefox and Safari formula files remain byte-identical");

console.log("Phase 39 site-audit and store-copy tests passed.");
