/* =====================================================================
 * NeuroReader — popup logic
 *
 * A pocket version of the web app: paste text, transform it (formula.js),
 * copy the result. Plus two page-wide controls:
 *   - "Auto-transform every page" — a stored toggle the content script
 *     watches, so every page you visit is transformed automatically.
 *   - "Transform this page" — transforms the current tab on demand.
 *   - fixation color picker — changes the visible color without changing the formula.
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
  var colorEl = document.getElementById("nr-color");
  var swatches = document.querySelectorAll(".pp-swatch");
  var settingsPanel = document.getElementById("nr-settings");
  var settingsToggle = document.getElementById("nr-settings-toggle");
  var featureInputs = document.querySelectorAll("[data-setting]");
  var featureSettings = { gradient:false, complexity:false, sentence:false, progress:false, spotlight:false, motion:false, contrast:false, rainbowWords:false, ruler:false, color:"#dc2626" };

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
    outputEl.innerHTML = window.NeuroReaderFeatures
      ? window.NeuroReaderFeatures.decorateHtml(lastHtml, featureSettings)
      : lastHtml;
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

  /* ---- Fixation color ---------------------------------------------- */

  function setColor(value) {
    var color = String(value || "").toLowerCase();
    if (!/^#[0-9a-f]{6}$/i.test(color)) return;
    colorEl.value = color;
    featureSettings.color = color;
    storage.sync.set({ nrColor: color, nrSettings: featureSettings });
    setStatus("Fixation color updated.");
  }

  storage.sync.get({ nrColor: "#dc2626" }, function (data) {
    colorEl.value = /^#[0-9a-f]{6}$/i.test(data.nrColor) ? data.nrColor : "#dc2626";
  });
  colorEl.addEventListener("input", function () { setColor(colorEl.value); });
  for (var i = 0; i < swatches.length; i++) {
    swatches[i].addEventListener("click", function () { setColor(this.getAttribute("data-color")); });
  }

  settingsToggle.addEventListener("click", function () {
    settingsPanel.hidden = !settingsPanel.hidden;
    settingsToggle.setAttribute("aria-expanded", settingsPanel.hidden ? "false" : "true");
  });
  storage.sync.get({ nrSettings: featureSettings }, function (data) {
    featureSettings = data.nrSettings || featureSettings;
    if (data.nrColor) featureSettings.color = data.nrColor;
    for (var f = 0; f < featureInputs.length; f++) featureInputs[f].checked = !!featureSettings[featureInputs[f].getAttribute("data-setting")];
  });
  for (var f = 0; f < featureInputs.length; f++) {
    featureInputs[f].addEventListener("change", function () {
      featureSettings[this.getAttribute("data-setting")] = this.checked;
      storage.sync.set({ nrSettings: featureSettings });
      setStatus("Reading setting updated.");
    });
  }

  /* ---- Auto-transform toggle --------------------------------------- */

  // Matches the content script's default: ON for a fresh install. The box is
  // checked until the user turns it off.
  storage.sync.get({ nrAuto: true }, function (data) {
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

  function restrictedPageMessage(url) {
    var value = String(url || "");
    if (/^(?:chrome|devtools|edge|about|view-source|chrome-extension):/i.test(value)) {
      return "Chrome protects its own pages; NeuroReader works on normal web pages.";
    }
    if (/^(?:https?:\/\/)?(?:chromewebstore\.google\.com|chrome\.google\.com\/webstore)(?:\/|$)/i.test(value)) {
      return "Chrome Web Store pages are protected; open a normal web page to transform it.";
    }
    return "";
  }

  function activeTab(cb) {
    var tabsApi = typeof browser !== "undefined" && browser.tabs
      ? browser.tabs
      : chrome.tabs;
    tabsApi.query({ active: true, currentWindow: true }, function (tabs) {
      var tab = tabs && tabs[0];
      if (!tab || tab.id === undefined || tab.id < 0) {
        pageBtn.disabled = true;
        setStatus("No transformable page is open.");
        return;
      }
      var restriction = restrictedPageMessage(tab.url);
      if (restriction) {
        pageBtn.disabled = true;
        setStatus(restriction);
        return;
      }
      pageBtn.disabled = false;
      cb(tab.id);
    });
  }

  function sendToTab(tabId, msg, cb) {
    chrome.tabs.sendMessage(tabId, msg, function (resp) {
      if (chrome.runtime.lastError || !resp) {
        // A normal page may need one refresh before its content script is
        // ready; restricted Chrome pages are handled before this call.
        setStatus("Reload the page once, then try again.");
        return;
      }
      cb(resp);
    });
  }

  // Label the button by the CURRENT page state, so it can never invert:
  // auto-transform (ON by default) may already have transformed the page,
  // in which case the button must offer to undo, not "transform" again.
  function refreshPageButton() {
    activeTab(function (tabId) {
      sendToTab(tabId, { type: "nr-state" }, function (resp) {
        pageBtn.textContent = resp.transformed
          ? "Undo this page"
          : "Transform this page";
      });
    });
  }

  pageBtn.addEventListener("click", function () {
    activeTab(function (tabId) {
      sendToTab(tabId, { type: "nr-toggle" }, function (resp) {
        setStatus(resp.applied ? "Page transformed." : "Transformation removed.");
        pageBtn.textContent = resp.applied
          ? "Undo this page"
          : "Transform this page";
      });
    });
  });

  refreshPageButton();
})();
