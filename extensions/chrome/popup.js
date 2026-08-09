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
  function storageGetArea(area, defaults, callback) {
    if (isPromiseApi) {
      storage[area].get(defaults).then(callback, function () { callback(defaults); });
    } else {
      storage[area].get(defaults, callback);
    }
  }
  function storageSetArea(area, values) {
    var pending = storage[area].set(values);
    if (pending && typeof pending.catch === "function") pending.catch(function () {});
  }
  function storageSet(values) {
    storageSetArea("sync", values);
  }
  function storageRemoveArea(area, keys) {
    var pending = storage[area].remove(keys);
    if (pending && typeof pending.catch === "function") pending.catch(function () {});
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
  var dailyGoal = document.getElementById("nr-daily-goal");
  var goalProgress = document.getElementById("nr-goal-progress");
  var goalSave = document.getElementById("nr-goal-save");
  var presetCode = document.getElementById("nr-preset-code");
  var presetExport = document.getElementById("nr-preset-export");
  var presetImport = document.getElementById("nr-preset-import");
  var exportTextBtn = document.getElementById("nr-export-text");
  var exportHtmlBtn = document.getElementById("nr-export-html");
  var exportMarkdownBtn = document.getElementById("nr-export-md");
  var timerMinutes = document.getElementById("nr-timer-minutes");
  var timerToggle = document.getElementById("nr-timer-toggle");
  var timerDisplay = document.getElementById("nr-timer-display");
  var clipboardSetting = document.getElementById("nr-clipboard-setting");
  var shareSnippetBtn = document.getElementById("nr-share-snippet");
  var statsSummary = document.getElementById("nr-stats-summary");
  var statsExport = document.getElementById("nr-stats-export");
  var statsReset = document.getElementById("nr-stats-reset");
  var profileSelect = document.getElementById("nr-profile");
  var libraryList = document.getElementById("nr-library-list");
  var librarySave = document.getElementById("nr-library-save");
  var libraryClear = document.getElementById("nr-library-clear");
  var featureSettings = { gradient:false, complexity:false, sentence:false, progress:false, spotlight:false, motion:false, contrast:false, rainbowWords:false, color:"#dc2626", profile:"custom", focus:false, blueLight:false, eyeRest:false };

  var lastHtml = "";
  var lastPlain = "";
  var feedbackTimer = null;
  var timerInterval = null;
  var savedItems = [];

  function setStatus(message) {
    statusEl.textContent = message;
  }

  function renderOutput() {
    lastHtml = window.NeuroReader.transform(lastPlain);
    outputEl.hidden = false;
    outputEl.innerHTML = window.NeuroReaderFeatures
      ? window.NeuroReaderFeatures.decorateHtml(lastHtml, featureSettings)
      : lastHtml;
    copyBtn.disabled = false;
    librarySave.disabled = false;
  }

  function doTransform() {
    var text = inputEl.value;
    if (!text.trim()) {
      setStatus("Paste some text first, then press Transform.");
      return;
    }
    lastPlain = text;
    renderOutput();
    setStatus("");
  }

  function renderLibrary(items) {
    savedItems = items || [];
    libraryList.textContent = "";
    if (!savedItems.length) {
      var empty = document.createElement("p");
      empty.className = "pp-color-help";
      empty.textContent = "No saved readings yet.";
      libraryList.appendChild(empty);
      return;
    }
    savedItems.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "pp-library-item";
      row.setAttribute("role", "listitem");
      var open = document.createElement("button");
      open.type = "button";
      open.className = "pp-library-open";
      open.textContent = item.title + " (" + item.wordCount + " words)";
      open.addEventListener("click", function () {
        inputEl.value = item.text;
        lastTextFromLibrary(item);
        setStatus("Saved reading loaded locally.");
      });
      var remove = document.createElement("button");
      remove.type = "button";
      remove.className = "pp-library-remove";
      remove.setAttribute("aria-label", "Delete " + item.title);
      remove.textContent = "Delete";
      remove.addEventListener("click", function () {
        window.NeuroReaderLibrary.remove(item.id, function (remaining, error) {
          if (error) { setStatus("Could not delete this saved reading."); return; }
          renderLibrary(remaining); setStatus("Saved reading deleted locally.");
        });
      });
      row.appendChild(open);
      row.appendChild(remove);
      libraryList.appendChild(row);
    });
  }
  function lastTextFromLibrary(item) {
    lastPlain = item.text;
    // Rebuild from plain text instead of trusting locally stored HTML. This
    // keeps a tampered storage entry from injecting markup into the popup.
    renderOutput();
  }
  function refreshLibrary() { if (window.NeuroReaderLibrary) window.NeuroReaderLibrary.list(renderLibrary); }
  librarySave.addEventListener("click", function () {
    if (!lastPlain.trim() || !window.NeuroReaderLibrary) return;
    var title = lastPlain.trim().split(/\s+/).slice(0, 8).join(" ");
    window.NeuroReaderLibrary.save({ title: title, text: lastPlain, html: lastHtml }, function (saved, items, error) {
      if (error || !saved) { setStatus("Could not save this reading locally."); return; }
      renderLibrary(items); setStatus("Reading saved on this device.");
    });
  });
  libraryClear.addEventListener("click", function () {
    if (!window.NeuroReaderLibrary) return;
    window.NeuroReaderLibrary.clear(function (items, error) {
      if (error) { setStatus("Could not clear saved readings."); return; }
      renderLibrary(items); setStatus("Saved readings cleared from this device.");
    });
  });
  refreshLibrary();

  function exportCurrent(kind) {
    if (!lastHtml) { setStatus("Transform text before exporting."); return; }
    if (kind === "text") window.NeuroReaderPhase3.download(lastPlain, "neuroreader.txt", "text/plain;charset=utf-8");
    if (kind === "html") window.NeuroReaderPhase3.download(lastHtml, "neuroreader.html", "text/html;charset=utf-8");
    if (kind === "markdown") window.NeuroReaderPhase3.download(window.NeuroReaderPhase3.markdownFromHtml(lastHtml), "neuroreader.md", "text/markdown;charset=utf-8");
    setStatus("Export downloaded locally.");
  }
  function renderTimer(state) {
    var remaining = state.running ? Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000)) : state.duration;
    timerDisplay.textContent = Math.floor(remaining / 60).toString().padStart(2, "0") + ":" + (remaining % 60).toString().padStart(2, "0");
    timerToggle.textContent = state.running ? "Stop" : "Start";
    if (state.running && remaining <= 0) { state.running = false; window.NeuroReaderPhase3.saveTimer(state); setStatus("Reading session complete."); }
  }
  function loadAndRenderTimer() { window.NeuroReaderPhase3.loadTimer(function (state) { renderTimer(state); if (timerInterval) clearInterval(timerInterval); if (state.running) timerInterval = setInterval(loadAndRenderTimer, 1000); }); }
  timerToggle.addEventListener("click", function () { window.NeuroReaderPhase3.loadTimer(function (state) { if (state.running) { state.running = false; } else { state.duration = Math.max(60, Math.min(10800, Number(timerMinutes.value) * 60 || 1500)); state.endsAt = Date.now() + state.duration * 1000; state.running = true; } window.NeuroReaderPhase3.saveTimer(state); loadAndRenderTimer(); }); });
  exportTextBtn.addEventListener("click", function () { exportCurrent("text"); });
  exportHtmlBtn.addEventListener("click", function () { exportCurrent("html"); });
  exportMarkdownBtn.addEventListener("click", function () { exportCurrent("markdown"); });
  clipboardSetting.addEventListener("change", function () { storageSetArea("local", { nrClipboardOffer: this.checked }); setStatus(this.checked ? "Copied-text offers enabled locally." : "Copied-text offers disabled."); });
  storageGetArea("local", { nrClipboardOffer: false }, function (data) { clipboardSetting.checked = !!data.nrClipboardOffer; });
  shareSnippetBtn.addEventListener("click", function () {
    if (!lastHtml) { setStatus("Transform text before sharing."); return; }
    setStatus("Opening your system share or clipboard — nothing is sent automatically.");
    window.NeuroReaderPhase3.shareSnippet(window.NeuroReaderPhase3.markdownFromHtml(lastHtml)).then(function () {
      setStatus("Formatted snippet shared or copied.");
    }).catch(function () {
      setStatus("Sharing was unavailable; your text stayed local.");
    });
  });
  function renderStats(state) {
    statsSummary.textContent = state.totalSessions
      ? state.totalWords.toLocaleString() + " words across " + state.totalSessions + " session" + (state.totalSessions === 1 ? "" : "s") + "."
      : "No extension reading sessions yet.";
  }
  function refreshStats() { if (window.NeuroReaderStats) window.NeuroReaderStats.get(renderStats); }
  statsExport.addEventListener("click", function () {
    refreshStats();
    if (!window.NeuroReaderStats) return;
    window.NeuroReaderStats.get(function (state) {
      window.NeuroReaderPhase3.download(JSON.stringify(state, null, 2), "neuroreader-progress.json", "application/json;charset=utf-8");
      setStatus("Progress exported locally.");
    });
  });
  statsReset.addEventListener("click", function () {
    if (!window.NeuroReaderStats) return;
    window.NeuroReaderStats.reset(function (state) { renderStats(state); setStatus("Local progress cleared."); });
  });
  refreshStats();
  if (new URLSearchParams(window.location.search).get("pending") === "1") {
    storageGetArea("local", { nrPendingText: null }, function (data) {
      var pending = data.nrPendingText;
      if (!pending || !pending.text) return;
      inputEl.value = pending.text;
      doTransform();
      storageRemoveArea("local", ["nrPendingText"]);
      setStatus("Selected text is ready to transform.");
    });
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

  function renderProfileControls() {
    if (!profileSelect) return;
    profileSelect.value = featureSettings.profile || "custom";
    for (var p = 0; p < featureInputs.length; p++) featureInputs[p].checked = !!featureSettings[featureInputs[p].getAttribute("data-setting")];
  }
  if (profileSelect) profileSelect.addEventListener("change", function () {
    var defaults = window.NeuroReaderFeatures
      ? window.NeuroReaderFeatures.DEFAULTS
      : featureSettings;
    var next = Object.assign({}, defaults, {
      color: featureSettings.color,
      focus: featureSettings.focus,
      blueLight: featureSettings.blueLight,
      eyeRest: featureSettings.eyeRest,
      profile: this.value,
    });
    featureSettings = window.NeuroReaderFeatures
      ? window.NeuroReaderFeatures.normalize(next)
      : next;
    storageSet({ nrSettings: featureSettings });
    renderProfileControls();
    if (lastPlain.trim()) renderOutput();
    setStatus("Neurotype profile updated locally.");
  });

  settingsToggle.addEventListener("click", function () {
    settingsPanel.hidden = !settingsPanel.hidden;
    settingsToggle.setAttribute("aria-expanded", settingsPanel.hidden ? "false" : "true");
  });
  storageGet({ nrSettings: featureSettings }, function (data) {
    var saved = data.nrSettings || featureSettings;
    if (data.nrColor) saved = Object.assign({}, saved, { color: data.nrColor });
    featureSettings = window.NeuroReaderFeatures
      ? window.NeuroReaderFeatures.normalize(saved)
      : saved;
    renderProfileControls();
  });
  for (var f = 0; f < featureInputs.length; f++) {
    featureInputs[f].addEventListener("change", function () {
      featureSettings.profile = "custom";
      featureSettings[this.getAttribute("data-setting")] = this.checked;
      storageSet({ nrSettings: featureSettings });
      renderProfileControls();
      setStatus("Reading setting updated.");
    });
  }

  function refreshGoal() {
    storageGet({ nrDailyGoal: 5000 }, function (data) {
      storageGetArea("local", { nrReadingTotals: { date: "", words: 0 } }, function (localData) {
        var total = localData.nrReadingTotals || { words: 0 };
      var goal = Math.max(100, Math.min(100000, Number(data.nrDailyGoal) || 5000));
      dailyGoal.value = goal;
        goalProgress.textContent = (Number(total.words) || 0) + " words toward today’s goal of " + goal;
      });
    });
  }
  goalSave.addEventListener("click", function () {
    var goal = Math.max(100, Math.min(100000, Number(dailyGoal.value) || 5000));
    dailyGoal.value = goal;
    storageSet({ nrDailyGoal: goal });
    setStatus("Daily goal saved.");
    refreshGoal();
  });
  function encodePreset(value) {
    var text = JSON.stringify(value);
    return btoa(unescape(encodeURIComponent(text)));
  }
  function decodePreset(value) {
    return JSON.parse(decodeURIComponent(escape(atob(String(value).trim()))));
  }
  presetExport.addEventListener("click", function () {
    presetCode.value = encodePreset(featureSettings);
    presetCode.select();
    setStatus("Preset code ready to copy.");
  });
  presetImport.addEventListener("click", function () {
    try {
      var imported = decodePreset(presetCode.value);
      var importedSettings = Object.assign({}, featureSettings, imported);
      if (imported && imported.profile === "custom") {
        var profileDefaults = window.NeuroReaderFeatures
          ? window.NeuroReaderFeatures.DEFAULTS
          : featureSettings;
        importedSettings = Object.assign({}, profileDefaults, {
          color: featureSettings.color,
          focus: featureSettings.focus,
          blueLight: featureSettings.blueLight,
          eyeRest: featureSettings.eyeRest,
        }, imported);
      }
      featureSettings = window.NeuroReaderFeatures
        ? window.NeuroReaderFeatures.normalize(importedSettings)
        : importedSettings;
      storageSet({ nrSettings: featureSettings, nrColor: featureSettings.color });
      colorEl.value = /^#[0-9a-f]{6}$/i.test(featureSettings.color) ? featureSettings.color : colorEl.value;
      renderProfileControls();
      focusSetting.checked = !!featureSettings.focus;
      blueLightSetting.checked = !!featureSettings.blueLight;
      eyeRestSetting.checked = !!featureSettings.eyeRest;
      setStatus("Preset imported.");
    } catch (error) {
      setStatus("That preset code is not valid.");
    }
  });
  refreshGoal();

  function setReadingSetting(name, value) {
    featureSettings[name] = !!value;
    storageSet({ nrSettings: featureSettings });
    setStatus("Reading setting updated.");
  }

  function sendReadingMode(message, callback) {
    activeTab(function (tabId) {
      sendToTab(tabId, message, callback);
    });
  }

  function refreshReadingModeButton() {
    sendReadingMode({ type: "nr-reading-mode-state" }, function (response) {
      var active = !!response.active;
      readingModeBtn.textContent = active ? "Exit reading mode" : "Enter reading mode";
    });
  }

  storageGet({ nrSettings: featureSettings }, function (data) {
    var saved = data.nrSettings || featureSettings;
    focusSetting.checked = !!saved.focus;
    blueLightSetting.checked = !!saved.blueLight;
    eyeRestSetting.checked = !!saved.eyeRest;
  });
  focusSetting.addEventListener("change", function () { setReadingSetting("focus", this.checked); });
  blueLightSetting.addEventListener("change", function () { setReadingSetting("blueLight", this.checked); });
  eyeRestSetting.addEventListener("change", function () { setReadingSetting("eyeRest", this.checked); });
  readingModeBtn.addEventListener("click", function () {
    sendReadingMode({ type: "nr-reading-mode-toggle" }, function (response) {
      readingModeBtn.textContent = response.active ? "Exit reading mode" : "Enter reading mode";
      setStatus(response.active ? "Reading mode on." : "Reading mode off.");
    });
  });

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
    var query = api.tabs.query({ active: true, currentWindow: true });
    if (isPromiseApi) {
      query.then(function (tabs) { handleActiveTab(tabs, cb); }, function () { setStatus("No transformable page is open."); });
    } else {
      api.tabs.query({ active: true, currentWindow: true }, function (tabs) { handleActiveTab(tabs, cb); });
    }
  }

  function handleActiveTab(tabs, cb) {
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

  function sendToTab(tabId, msg, cb) {
    if (isPromiseApi) {
      api.tabs.sendMessage(tabId, msg).then(function (resp) {
        if (resp) cb(resp); else setStatus("Reload the page once, then try again.");
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
