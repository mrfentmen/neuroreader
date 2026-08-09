"use strict";

const assert = require("assert");
const fs = require("fs");
const vm = require("vm");

const chromeContent = fs.readFileSync("extensions/chrome/content.js", "utf8");
const firefoxContent = fs.readFileSync("extensions/firefox/content.js", "utf8");
const chromePopup = fs.readFileSync("extensions/chrome/popup.js", "utf8");
const firefoxPopup = fs.readFileSync("extensions/firefox/popup.js", "utf8");
const chromeHtml = fs.readFileSync("extensions/chrome/popup.html", "utf8");
const firefoxHtml = fs.readFileSync("extensions/firefox/popup.html", "utf8");
const chromeStyles = fs.readFileSync("extensions/chrome/styles.css", "utf8");
const firefoxStyles = fs.readFileSync("extensions/firefox/styles.css", "utf8");

assert.strictEqual(
  chromeContent.replace("storage.local.get({ nrExcludedSites: [] }, function (data) {", "storage.local.get({ nrExcludedSites: [] }).then(function (data) {").replace("  });\n  storage.onChanged.addListener", "  });\n  storage.onChanged.addListener"),
  firefoxContent,
  "Chrome and Firefox content scripts stay behaviorally identical",
);
assert.match(chromeContent, /nrExcludedSites/);
assert.match(chromeContent, /storageGet\("local"/);
assert.match(chromeContent, /area === "local"/);
assert.match(chromeContent, /host === site/);
assert.match(chromeContent, /host\.slice\(-\(site\.length \+ 1\)\)/);
assert.match(chromePopup, /storageGetArea\("local", \{ nrExcludedSites: \[\] \}/);
assert.match(chromePopup, /storageSetArea\("local", \{ nrExcludedSites: excludedSites \}\)/);
assert.match(chromePopup, /currentTabSite/);
assert.match(firefoxPopup, /storageGetArea\("local", \{ nrExcludedSites: \[\] \}/);
assert.match(firefoxPopup, /storageSetArea\("local", \{ nrExcludedSites: excludedSites \}\)/);
assert.match(firefoxPopup, /currentTabSite/);
assert.match(chromeHtml, /id="nr-site-input"/);
assert.match(chromeHtml, /id="nr-site-add"/);
assert.match(chromeHtml, /id="nr-site-list"/);
assert.match(chromeHtml, /blank = current site/);
assert.strictEqual(chromeHtml, firefoxHtml, "Chrome and Firefox site-exclusion popup markup stays identical");
assert.strictEqual(chromeStyles, firefoxStyles, "Chrome and Firefox popup styling stays identical");
assert.match(chromePopup, /normalizeSite/);
assert.match(firefoxPopup, /normalizeSite/);
assert.match(chromeStyles, /\.pp-site-list/);
assert.match(chromeStyles, /\.pp-site-item/);

function runContent({ host, excludedSites, auto = true }) {
  const transformed = [];
  let walkerNode = null;
  const textNode = { nodeValue: "A readable page paragraph." };
  const parent = {
    parentElement: null,
    closest() { return null; },
    replaceChild() { transformed.push(true); },
  };
  textNode.parentElement = parent;
  textNode.parentNode = parent;
  const body = {
    querySelectorAll(selector) {
      if (selector === "*") return [];
      if (selector.includes("[data-nr=\"1\"]")) return transformed;
      return [];
    },
  };
  const document = {
    getElementById() { return null; },
    querySelectorAll() { return []; },
    body,
    documentElement: { appendChild() {}, querySelectorAll() { return []; }, classList: { toggle() {} } },
    createElement(tag) {
      return {
        tagName: tag.toUpperCase(),
        style: { setProperty() {} },
        setAttribute() {},
        addEventListener() {},
        innerHTML: "",
        isConnected: true,
      };
    },
    createTreeWalker() {
      return {
        nextNode() {
          if (walkerNode) return false;
          walkerNode = textNode;
          return true;
        },
        currentNode: textNode,
      };
    },
    addEventListener() {},
  };
  const syncListeners = [];
  const localListeners = [];
  const storage = {
    sync: {
      get(_defaults, callback) { callback({ nrAuto: auto, nrColor: "#dc2626", nrSettings: {} }); },
    },
    local: {
      get(_defaults, callback) { callback({ nrExcludedSites: excludedSites }); },
    },
    onChanged: {
      addListener(fn) { syncListeners.push(fn); localListeners.push(fn); },
    },
  };
  const context = {
    window: {
      top: null,
      parent: null,
      addEventListener() {},
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      getComputedStyle() { return { fontWeight: "400", color: "rgb(0,0,0)" }; },
      NeuroReader: { transform(value) { return "<b>" + value + "</b>"; } },
    },
    document,
    location: { hostname: host },
    NodeFilter: { SHOW_TEXT: 4, FILTER_ACCEPT: 1, FILTER_REJECT: 2 },
    MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
    Set,
    Map,
    Array,
    Math,
    Date,
    String,
    Number,
    RegExp,
    setTimeout() { return 0; },
    clearTimeout() {},
    setInterval() { return 0; },
    clearInterval() {},
    Object,
    parseInt,
    isNaN,
    chrome: { storage, runtime: { onMessage: { addListener() {} } } },
  };
  context.window.top = context.window;
  context.window.parent = context.window;
  vm.createContext(context);
  vm.runInContext(chromeContent, context);
  return { transformed: transformed.length };
}

assert.strictEqual(runContent({ host: "example.com", excludedSites: ["example.com"] }).transformed, 0, "exact host exclusion leaves page untouched");
assert.strictEqual(runContent({ host: "www.example.com", excludedSites: ["example.com"] }).transformed, 0, "www host exclusion leaves page untouched");
assert.strictEqual(runContent({ host: "reader.example.com", excludedSites: ["example.com"] }).transformed, 0, "subdomain exclusion leaves page untouched");
assert.strictEqual(runContent({ host: "notexample.com", excludedSites: ["example.com"] }).transformed, 1, "host matching is boundary-aware and unrelated hosts still auto-transform");
assert.strictEqual(runContent({ host: "example..com", excludedSites: ["example..com"] }).transformed, 1, "malformed exclusions are ignored");
assert.strictEqual(runContent({ host: "-example.com", excludedSites: ["-example.com"] }).transformed, 1, "invalid-label exclusions are ignored");

console.log("Phase 22 site-exclusion tests passed.");
