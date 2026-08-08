(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("vm"), require("fs"), require("path"));
  else root.NeuroReaderAPI = factory(null, null, null);
})(typeof window !== "undefined" ? window : globalThis, function (vm, fs, path) {
  "use strict";

  function loadEngine() {
    if (typeof window !== "undefined" && window.NeuroReader) return window.NeuroReader;
    if (!vm || !fs || !path) throw new Error("Load formula.min.js before using NeuroReaderAPI in a browser.");
    var source = fs.readFileSync(path.join(__dirname, "..", "formula.min.js"), "utf8");
    var context = { console: console, Math: Math, Map: Map, globalThis: {} };
    context.globalThis = context;
    vm.runInNewContext(source, context, { filename: "formula.min.js" });
    return context.NeuroReader;
  }

  function loadFeatures() {
    if (typeof NeuroReaderFeatures !== "undefined") return NeuroReaderFeatures;
    if (!vm || !fs || !path) return null;
    var source = fs.readFileSync(path.join(__dirname, "..", "features.js"), "utf8");
    var context = { module: { exports: {} }, exports: {}, console: console };
    vm.runInNewContext(source, context, { filename: "features.js" });
    return context.module.exports;
  }

  function transform(text, options) {
    if (typeof text !== "string") throw new TypeError("text must be a string");
    var html = loadEngine().transform(text);
    var featureOptions = options || {};
    var features = loadFeatures();
    if (!features) return html;
    var decorated = features.decorateHtml(html, featureOptions);
    var classes = [];
    if (featureOptions.progress) classes.push("nr-reading-progress");
    if (featureOptions.spotlight) classes.push("nr-reading-spotlight");
    if (featureOptions.motion) classes.push("nr-motion-reduced");
    if (featureOptions.contrast) classes.push("nr-high-contrast");
    if (classes.length) decorated = '<div class="' + classes.join(" ") + '">' + decorated + "</div>";
    return decorated;
  }

  return {
    transform: transform,
    options: {
      gradient: false,
      complexity: false,
      sentence: false,
      progress: false,
      spotlight: false,
      motion: false,
      contrast: false,
      rainbowWords: false,
      color: "#dc2626",
    },
  };
});
