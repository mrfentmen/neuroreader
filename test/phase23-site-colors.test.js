"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const chromeContent = fs.readFileSync("extensions/chrome/content.js", "utf8");
const firefoxContent = fs.readFileSync("extensions/firefox/content.js", "utf8");
const safariContent = fs.readFileSync("extensions/safari/content.js", "utf8");
const chromePopup = fs.readFileSync("extensions/chrome/popup.js", "utf8");
const firefoxPopup = fs.readFileSync("extensions/firefox/popup.js", "utf8");
const chromeHtml = fs.readFileSync("extensions/chrome/popup.html", "utf8");
const firefoxHtml = fs.readFileSync("extensions/firefox/popup.html", "utf8");
const chromeStyles = fs.readFileSync("extensions/chrome/styles.css", "utf8");
const firefoxStyles = fs.readFileSync("extensions/firefox/styles.css", "utf8");

assert.strictEqual(chromeContent, firefoxContent, "Chrome and Firefox content scripts stay byte-identical");
assert.strictEqual(chromeContent, safariContent, "Safari content script stays behaviorally identical");
assert.strictEqual(chromePopup, firefoxPopup, "Chrome and Firefox popup logic stays byte-identical");
assert.strictEqual(chromeHtml, firefoxHtml, "Chrome and Firefox popup markup stays identical");
assert.strictEqual(chromeStyles, firefoxStyles, "Chrome and Firefox popup styling stays identical");
assert.match(chromeContent, /nrSiteColors/);
assert.match(chromeContent, /activeStoredColor/);
assert.match(chromeContent, /host\.slice\(-\(site\.length \+ 1\)\)/);
assert.match(chromePopup, /localSettingsReady = false/);
assert.match(chromePopup, /if \(!localSettingsReady\)/);
assert.match(chromePopup, /removeExclusion/);
assert.match(chromePopup, /removeColor/);
assert.match(chromePopup, /delete siteColors\[site\]/);
assert.match(chromePopup, /storageSetArea\("local", \{ nrExcludedSites: excludedSites, nrSiteColors: siteColors \}\)/);
assert.match(chromeHtml, /id="nr-site-color"/);
assert.match(chromeHtml, /id="nr-site-color-save"/);
assert.match(chromeStyles, /\.pp-site-color-row/);
assert.match(chromeStyles, /\.pp-site-color-dot/);

function run(source, hostname, siteColors, globalColor) {
  const styles = [];
  const spans = [{ style: { setProperty(_name, value) { styles.push(value); } }, textContent: "", parentNode: { replaceChild() {} } }];
  const document = {
    querySelectorAll(selector) {
      if (selector.includes('[data-nr="1"]')) return spans;
      return [];
    },
    getElementById() { return null; },
    createElement() { return { style: { setProperty() {} }, setAttribute() {}, addEventListener() {} }; },
    createTextNode(value) { return { nodeValue: String(value || "") }; },
    body: { querySelectorAll() { return []; } },
    documentElement: { appendChild() {}, classList: { toggle() {} }, querySelectorAll() { return []; } },
    createTreeWalker() { return { nextNode() { return false; } }; },
    addEventListener() {},
  };
  const storage = {
    sync: { get(_defaults, callback) { callback({ nrAuto: false, nrColor: globalColor, nrSettings: {} }); } },
    local: { get(_defaults, callback) { callback({ nrExcludedSites: [], nrSiteColors: siteColors }); } },
    onChanged: { addListener() {} },
  };
  const context = {
    window: {
      top: null,
      parent: null,
      addEventListener() {},
      getComputedStyle() { return { fontWeight: "400", color: "rgb(0,0,0)" }; },
      NeuroReader: { transform(value) { return "<b>" + value + "</b>"; } },
      innerHeight: 800,
    },
    document,
    location: { hostname },
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
    chrome: { storage, runtime: { onMessage: { addListener() {} } } },
    Set, Map, Array, Math, Date, String, Number, RegExp, Object, parseInt, isNaN,
    setTimeout() { return 0; }, clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
  };
  context.window.top = context.window;
  context.window.parent = context.window;
  vm.createContext(context);
  vm.runInContext(source, context);
  return styles;
}

assert.ok(run(chromeContent, "youtube.com", { "youtube.com": "#2563eb" }, "#dc2626").includes("rgb(37,99,235)"), "exact host uses its private color");
assert.ok(run(chromeContent, "www.youtube.com", { "youtube.com": "#2563eb" }, "#dc2626").includes("rgb(37,99,235)"), "www host uses its private color");
assert.ok(run(chromeContent, "watch.youtube.com", { "youtube.com": "#2563eb" }, "#dc2626").includes("rgb(37,99,235)"), "subdomain uses its private color");
assert.ok(run(chromeContent, "example.com", { "youtube.com": "#2563eb" }, "#dc2626").includes("rgb(220,38,38)"), "unrelated host uses global color");

console.log("Phase 23 site-color tests passed.");
