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

  var isPromiseApi = typeof browser !== "undefined" && !!browser.storage;
  var api = isPromiseApi ? browser : chrome;
  var storage = api.storage;

  function storageGet(defaults, callback) {
    if (isPromiseApi) {
      storage.sync.get(defaults).then(callback, function () { callback(defaults); });
    } else {
      storage.sync.get(defaults, callback);
    }
  }

  function storageSet(values) {
    try {
      var pending = storage.sync.set(values);
      if (pending && typeof pending.catch === "function") pending.catch(function () {});
    } catch (error) { /* local settings remain usable if storage is unavailable */ }
  }

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
  var readingModeBtn = document.getElementById("nr-reading-mode");
  var focusSetting = document.getElementById("nr-focus-setting");
  var blueLightSetting = document.getElementById("nr-blue-light-setting");
  var eyeRestSetting = document.getElementById("nr-eye-rest-setting");
  var featureSettings = { gradient:false, complexity:false, sentence:false, progress:false, spotlight:false, motion:false, contrast:false, rainbowWords:false, ruler:false, rulerSize:6, rulerDim:28, rulerStep:8, rulerLock:false, spacing:false, lineHeight:1.5, letterSpacing:0.03, wordSpacing:0.2, textScale:1, color:"#dc2626", focus:false, blueLight:false, eyeRest:false };

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
    storageSet({ nrColor: color, nrSettings: featureSettings });
    setStatus("Fixation color updated.");
  }

  storageGet({ nrColor: "#dc2626" }, function (data) {
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
  function normalizeSettings(value) {
    if (window.NeuroReaderFeatures && window.NeuroReaderFeatures.normalize) {
      return window.NeuroReaderFeatures.normalize(Object.assign({}, featureSettings, value || {}));
    }
    var input = value || {};
    var next = Object.assign({}, featureSettings, input);
    next.rulerSize = Math.max(2, Math.min(14, Number(next.rulerSize) || 6));
    next.rulerDim = Math.max(0, Math.min(70, Number(next.rulerDim) || 0));
    next.rulerStep = Math.max(2, Math.min(20, Number(next.rulerStep) || 8));
    next.rulerLock = next.rulerLock === true;
    next.spacing = next.spacing === true;
    next.lineHeight = Math.max(1, Math.min(2.2, Number(next.lineHeight) || 1.5));
    next.letterSpacing = Math.max(0, Math.min(0.2, Number(next.letterSpacing) || 0));
    next.wordSpacing = Math.max(0, Math.min(0.8, Number(next.wordSpacing) || 0));
    next.textScale = Math.max(0.85, Math.min(1.5, Number(next.textScale) || 1));
    next.focus = next.focus === true;
    next.blueLight = next.blueLight === true;
    next.eyeRest = next.eyeRest === true;
    return next;
  }
  storageGet({ nrSettings: featureSettings }, function (data) {
    featureSettings = normalizeSettings(data.nrSettings);
    if (data.nrColor) featureSettings.color = data.nrColor;
    for (var f = 0; f < featureInputs.length; f++) {
      var savedInput = featureInputs[f];
      var savedKey = savedInput.getAttribute("data-setting");
      if (savedInput.type === "range") savedInput.value = featureSettings[savedKey];
      else savedInput.checked = !!featureSettings[savedKey];
    }
    if (focusSetting) focusSetting.checked = !!featureSettings.focus;
    if (blueLightSetting) blueLightSetting.checked = !!featureSettings.blueLight;
    if (eyeRestSetting) eyeRestSetting.checked = !!featureSettings.eyeRest;
  });
  for (var f = 0; f < featureInputs.length; f++) {
    featureInputs[f].addEventListener("change", function () {
      var settingKey = this.getAttribute("data-setting");
      featureSettings[settingKey] = this.type === "range" ? Number(this.value) : this.checked;
      featureSettings = normalizeSettings(featureSettings);
      storageSet({ nrSettings: featureSettings });
      setStatus("Reading setting updated.");
    });
  }

  /* ---- Auto-transform toggle --------------------------------------- */

  // Matches the content script's default: ON for a fresh install. The box is
  // checked until the user turns it off.
  storageGet({ nrAuto: true }, function (data) {
    autoToggle.checked = !!data.nrAuto;
  });
  autoToggle.addEventListener("change", function () {
    storageSet({ nrAuto: autoToggle.checked });
    setStatus(
      autoToggle.checked
        ? "Auto-transform on — open pages apply it live."
        : "Auto-transform off.",
    );
  });

  function setReadingSetting(name, value) {
    featureSettings[name] = value === true;
    featureSettings = normalizeSettings(featureSettings);
    storageSet({ nrSettings: featureSettings });
    setStatus("Reading setting updated.");
  }

  if (focusSetting) focusSetting.addEventListener("change", function () { setReadingSetting("focus", this.checked); });
  if (blueLightSetting) blueLightSetting.addEventListener("change", function () { setReadingSetting("blueLight", this.checked); });
  if (eyeRestSetting) eyeRestSetting.addEventListener("change", function () { setReadingSetting("eyeRest", this.checked); });

  function sendReadingMode(message, callback) {
    activeTab(function (tabId) {
      sendToTab(tabId, message, callback);
    });
  }

  function refreshReadingModeButton() {
    if (!readingModeBtn) return;
    sendReadingMode({ type: "nr-reading-mode-state" }, function (response) {
      readingModeBtn.textContent = response && response.active ? "Exit reading mode" : "Enter reading mode";
    });
  }

  if (readingModeBtn) readingModeBtn.addEventListener("click", function () {
    sendReadingMode({ type: "nr-reading-mode-toggle" }, function (response) {
      var active = !!(response && response.active);
      readingModeBtn.textContent = active ? "Exit reading mode" : "Enter reading mode";
      setStatus(active ? "Reading mode on." : "Reading mode off.");
    });
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
    function handleTabs(tabs) {
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
    }
    if (isPromiseApi) {
      api.tabs.query({ active: true, currentWindow: true }).then(handleTabs, function () { setStatus("No transformable page is open."); });
    } else {
      api.tabs.query({ active: true, currentWindow: true }, handleTabs);
    }
  }

  function sendToTab(tabId, msg, cb) {
    if (isPromiseApi) {
      api.tabs.sendMessage(tabId, msg).then(function (resp) {
        if (resp) cb(resp);
        else setStatus("Reload the page once, then try again.");
      }, function () { setStatus("Reload the page once, then try again."); });
      return;
    }
    api.tabs.sendMessage(tabId, msg, function (resp) {
      if (api.runtime.lastError || !resp) {
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
  refreshReadingModeButton();
})();
