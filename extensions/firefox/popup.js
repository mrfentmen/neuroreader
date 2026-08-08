/* =====================================================================
 * NeuroReader — popup logic
 *
 * A pocket version of the web app: paste text, transform it (formula.js),
 * copy the result. Plus two page-wide controls:
 *   - "Auto-transform every page" — a stored toggle the content script
 *     watches, so every page you visit is transformed automatically.
 *   - "Transform this page" — transforms the current tab on demand.
 * ===================================================================== */
(function () {
  "use strict";

  var storage = typeof browser !== "undefined" && browser.storage
    ? browser.storage
    : chrome.storage;

  var inputEl = document.getElementById("pp-input");
  var transformBtn = document.getElementById("pp-transform");
  var outputEl = document.getElementById("pp-output");
  var copyBtn = document.getElementById("pp-copy");
  var pageBtn = document.getElementById("pp-page");
  var autoToggle = document.getElementById("auto-toggle");
  var statusEl = document.getElementById("pp-status");

  var lastHtml = "";
  var lastPlain = "";
  var feedbackTimer = null;

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function doTransform() {
    var text = inputEl.value;
    if (!text.trim()) {
      setStatus("Paste some text first, then press Transform.");
      return;
    }
    lastHtml = window.NeuroReader.transform(text);
    lastPlain = text;
    outputEl.hidden = false;
    outputEl.innerHTML = lastHtml;
    copyBtn.disabled = false;
    setStatus("");
  }

  function showCopyFeedback(message) {
    copyBtn.textContent = message;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(function () {
      copyBtn.textContent = "Copy";
    }, 1500);
  }

  transformBtn.addEventListener("click", doTransform);
  inputEl.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      doTransform();
    }
  });

  copyBtn.addEventListener("click", function () {
    if (!lastHtml) return;
    if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
      navigator.clipboard
        .write([
          new ClipboardItem({
            "text/html": new Blob([lastHtml], { type: "text/html" }),
            "text/plain": new Blob([lastPlain], { type: "text/plain" }),
          }),
        ])
        .then(function () {
          showCopyFeedback("Copied");
        })
        .catch(function () {
          showCopyFeedback("Copy blocked");
        });
    } else {
      showCopyFeedback("Copy blocked");
    }
  });

  /* ---- Auto-transform toggle --------------------------------------- */

  storage.sync.get({ nrAuto: false }, function (data) {
    autoToggle.checked = !!data.nrAuto;
  });
  autoToggle.addEventListener("change", function () {
    storage.sync.set({ nrAuto: autoToggle.checked });
    setStatus(
      autoToggle.checked
        ? "Auto-transform on — open pages apply it live."
        : "Auto-transform off.",
    );
  });

  /* ---- Transform the current page ---------------------------------- */

  pageBtn.addEventListener("click", function () {
    var tabsApi = typeof browser !== "undefined" && browser.tabs
      ? browser.tabs
      : chrome.tabs;
    tabsApi.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || tab.id === undefined || tab.id < 0) {
        setStatus("No transformable page open (this is a browser page).");
        return;
      }
      chrome.tabs.sendMessage(tab.id, { type: "nr-toggle" }, function (resp) {
        if (chrome.runtime.lastError || !resp) {
          // Content script not loaded yet (chrome://, store, fresh tab...).
          setStatus("Reload the page first, then try again.");
          return;
        }
        setStatus(
          resp.applied ? "Page transformed." : "Transformation removed.",
        );
      });
    });
  });
})();
