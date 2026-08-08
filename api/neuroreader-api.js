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
    return features.decorateHtml(html, featureOptions);
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
      color: "#dc2626",
    },
  };
});
