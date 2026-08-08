/* NeuroReader Phase 3 popup helpers. All state is local to the extension. */
(function (root) {
  "use strict";
  var TIMER_KEY = "nrTimer";
  var CLIPBOARD_KEY = "nrClipboardOffer";
  var api = typeof browser !== "undefined" ? browser : chrome;

  function plainFromHtml(html) {
    var holder = document.createElement("div");
    holder.innerHTML = String(html || "");
    return holder.textContent || "";
  }
  function decodeEntities(value) {
    return String(value || "")
      .replace(/&(?:amp|lt|gt|quot|apos|#39);/gi, function (entity) {
        return { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'", "&#39;": "'" }[entity.toLowerCase()] || entity;
      })
      .replace(/&#x([0-9a-f]+);/gi, function (_, hex) { return String.fromCodePoint(parseInt(hex, 16)); })
      .replace(/&#(\d+);/g, function (_, number) { return String.fromCodePoint(parseInt(number, 10)); });
  }
  function markdownFromHtml(html) {
    return decodeEntities(String(html || "")
      .replace(/<b[^>]*>([\s\S]*?)<\/b>/gi, "**$1**")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, ""));
  }
  function download(value, name, type) {
    var blob = new Blob([value], { type: type });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url; link.download = name; link.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  function timerState(value) {
    var input = value || {};
    return { running: input.running === true, endsAt: Number(input.endsAt) || 0, duration: Math.max(1, Number(input.duration) || 25 * 60) };
  }
  function saveTimer(state) {
    var pending = api.storage.local.set({ [TIMER_KEY]: timerState(state) });
    if (pending && typeof pending.catch === "function") pending.catch(function () {});
  }
  function loadTimer(callback) {
    var pending = api.storage.local.get({ [TIMER_KEY]: timerState() });
    if (pending && typeof pending.then === "function") {
      pending.then(function (data) { callback(timerState(data[TIMER_KEY])); }, function () { callback(timerState()); });
    } else {
      api.storage.local.get({ [TIMER_KEY]: timerState() }, function (data) { callback(timerState(data[TIMER_KEY])); });
    }
  }
  function encodeSnippet(text) {
    var value = unescape(encodeURIComponent(String(text || "")));
    return btoa(value);
  }
  function shareSnippet(text) {
    var value = String(text || "").trim();
    if (!value) return Promise.reject(new Error("No text selected"));
    var operation;
    if (navigator.share) operation = navigator.share({ title: "NeuroReader snippet", text: value });
    else if (navigator.clipboard && navigator.clipboard.writeText) operation = navigator.clipboard.writeText(value);
    else return Promise.reject(new Error("Sharing unavailable"));
    return Promise.race([
      Promise.resolve(operation).then(function () {}),
      new Promise(function (_, reject) { setTimeout(function () { reject(new Error("Sharing timed out")); }, 3000); }),
    ]);
  }
  root.NeuroReaderPhase3 = { TIMER_KEY: TIMER_KEY, CLIPBOARD_KEY: CLIPBOARD_KEY, plainFromHtml: plainFromHtml, markdownFromHtml: markdownFromHtml, download: download, timerState: timerState, saveTimer: saveTimer, loadTimer: loadTimer, encodeSnippet: encodeSnippet, shareSnippet: shareSnippet };
})(window);
