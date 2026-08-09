/* NeuroReader Phase 2 page features.
 *
 * Reading Mode keeps the original page intact: it extracts the largest
 * article-like region, sanitizes a detached clone, and renders that clone in
 * a reversible focus surface. All text transformation still delegates to
 * the shipped formula.js. Settings and word totals stay in browser storage;
 * no page text is uploaded or retained.
 */
(function () {
  "use strict";

  var MODE_ID = "nr-reading-overlay";
  var FILTER_ID = "nr-blue-light-filter";
  var modeOpen = false;
  var overlay = null;
  var reminderTimer = null;
  var settings = {
    focus: false,
    blueLight: false,
    eyeRest: false,
    motion: false,
  };
  var hasPromiseApi = typeof browser !== "undefined" && !!browser.storage;
  var storageApi = hasPromiseApi ? browser : chrome;

  function storageGet(area, defaults, callback) {
    try {
      var areaApi = storageApi.storage[area];
      if (hasPromiseApi) {
        var pending = areaApi.get(defaults);
        pending.then(callback, function () { callback(defaults); });
      } else {
        areaApi.get(defaults, callback);
      }
    } catch (error) {
      callback(defaults);
    }
  }

  function storageSet(area, values) {
    try {
      var pending = storageApi.storage[area].set(values);
      if (pending && typeof pending.catch === "function") pending.catch(function () {});
    } catch (error) {
      /* A storage denial must not disable the reading surface. */
    }
  }

  function normalizeSettings(value) {
    var input = value || {};
    return {
      focus: input.focus === true,
      blueLight: input.blueLight === true,
      eyeRest: input.eyeRest === true,
      motion: input.motion === true,
    };
  }

  function clockMinutes(value) {
    var match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    var hour = Math.min(23, Number(match[1]));
    var minute = Math.min(59, Number(match[2]));
    return hour * 60 + minute;
  }

  function isBlueLightTime(start, end) {
    var from = clockMinutes(start);
    var to = clockMinutes(end);
    if (from === null || to === null || from === to) return false;
    var now = new Date();
    var current = now.getHours() * 60 + now.getMinutes();
    return from < to ? current >= from && current < to : current >= from || current < to;
  }

  function ensureStyles() {
    if (document.getElementById("nr-reading-style")) return;
    var style = document.createElement("style");
    style.id = "nr-reading-style";
    style.setAttribute("data-nr", "ui");
    style.textContent = [
      "html.nr-reading-active { overflow: hidden !important; }",
      "html.nr-reading-active > body > *:not(#" + MODE_ID + "):not(#" + FILTER_ID + ") { visibility: hidden !important; }",
      "#" + MODE_ID + " {",
      "  position: fixed; inset: 0; z-index: 2147483646; overflow: auto;",
      "  background: #fff; color: #111; font: 400 18px/1.75 Georgia, 'Times New Roman', serif;",
      "  -webkit-font-smoothing: antialiased;",
      "}",
      "#" + MODE_ID + ".nr-mode-dark { background: #18181b; color: #f4f4f5; }",
      "#" + MODE_ID + " .nr-reading-toolbar {",
      "  position: sticky; top: 0; z-index: 2; display: flex; gap: .6rem; align-items: center;",
      "  padding: .75rem max(1rem, calc((100vw - 52rem) / 2)); background: inherit;",
      "  border-bottom: 1px solid rgba(127,127,127,.28); font: 600 14px/1.3 system-ui, sans-serif;",
      "}",
      "#" + MODE_ID + " .nr-reading-toolbar strong { margin-right: auto; letter-spacing: -.01em; }",
      "#" + MODE_ID + " button { min-width: 44px; min-height: 44px; padding: .55rem .8rem; border: 1px solid currentColor; border-radius: .55rem; background: transparent; color: inherit; font: inherit; cursor: pointer; }",
      "#" + MODE_ID + " button:hover, #" + MODE_ID + " button:focus-visible { background: rgba(127,127,127,.16); }",
      "#" + MODE_ID + " .nr-reading-content { max-width: 46rem; margin: 0 auto; padding: 3rem 1.25rem 7rem; }",
      "#" + MODE_ID + " .nr-reading-content h1 { font: 800 clamp(2rem, 5vw, 3.2rem)/1.1 system-ui, sans-serif; letter-spacing: -.035em; }",
      "#" + MODE_ID + " .nr-reading-content h2, #" + MODE_ID + " .nr-reading-content h3 { font-family: system-ui, sans-serif; line-height: 1.2; }",
      "#" + MODE_ID + " .nr-reading-content img, #" + MODE_ID + " video { max-width: 100%; height: auto; }",
      "#" + MODE_ID + " .nr-reading-content blockquote { margin-inline: 0; padding-inline-start: 1.2rem; border-inline-start: 4px solid currentColor; }",
      "#" + MODE_ID + " .nr-reading-content a { color: inherit; text-decoration-thickness: .12em; }",
      "#" + MODE_ID + ".nr-mode-focus .nr-reading-content p { max-width: 39rem; margin-inline: auto; }",
      "#" + MODE_ID + ".nr-mode-focus .nr-reading-content > * { transition: opacity 180ms ease; }",
      "#" + MODE_ID + " .nr-eye-reminder { position: fixed; right: 1rem; bottom: 1rem; max-width: 22rem; padding: .85rem 1rem; border: 1px solid currentColor; border-radius: .7rem; background: rgba(255,255,255,.96); color: #111; box-shadow: 0 10px 35px rgba(0,0,0,.18); font: 600 14px/1.4 system-ui, sans-serif; }",
      "#" + MODE_ID + ".nr-mode-dark .nr-eye-reminder { background: rgba(24,24,27,.98); color: #f4f4f5; }",
      "#" + MODE_ID + " .nr-eye-reminder button { float: right; min-width: 32px; min-height: 32px; padding: .2rem .45rem; margin-left: .7rem; }",
      "#" + FILTER_ID + " { display: none; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; background: rgba(255, 164, 60, .14); mix-blend-mode: multiply; }",
      "html.nr-blue-light-active #" + FILTER_ID + " { display: block; }",
      "html.nr-motion-reduced #" + MODE_ID + " *, html.nr-motion-reduced #" + MODE_ID + " { transition: none !important; animation: none !important; scroll-behavior: auto !important; }",
      "@media (prefers-color-scheme: dark) { #" + MODE_ID + " { background: #18181b; color: #f4f4f5; } }",
      "@media (max-width: 600px) { #" + MODE_ID + " { font-size: 17px; } #" + MODE_ID + " .nr-reading-toolbar { padding-inline: .7rem; } #" + MODE_ID + " .nr-reading-content { padding-top: 2rem; } }",
      "@media (prefers-reduced-motion: reduce) { #" + MODE_ID + " *, #" + MODE_ID + " { transition: none !important; animation: none !important; } }",
    ].join("\n");
    (document.head || document.documentElement).appendChild(style);
  }

  function updateGlobalAids() {
    ensureStyles();
    storageGet("sync", {
      nrSettings: settings,
      nrBlueStart: "19:00",
      nrBlueEnd: "07:00",
    }, function (data) {
      settings = normalizeSettings(data.nrSettings);
      var blue = settings.blueLight && isBlueLightTime(data.nrBlueStart, data.nrBlueEnd);
      document.documentElement.classList.toggle("nr-blue-light-active", blue);
      document.documentElement.classList.toggle("nr-motion-reduced", settings.motion);
      if (overlay) {
        overlay.classList.toggle("nr-mode-focus", settings.focus);
        overlay.classList.toggle("nr-mode-dark", window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
      }
    });
  }

  function removeUnsafeNodes(root) {
    if (root.nodeType === 1) {
      var rootAttrs = Array.from(root.attributes);
      for (var r = 0; r < rootAttrs.length; r++) {
        if (/^on/i.test(rootAttrs[r].name) || ((rootAttrs[r].name === "href" || rootAttrs[r].name === "src" || rootAttrs[r].name === "action") && /^(?:javascript|data|vbscript):/i.test(rootAttrs[r].value))) root.removeAttribute(rootAttrs[r].name);
      }
    }
    var forbidden = root.querySelectorAll("script,style,noscript,iframe,object,embed,form,button,input,textarea,select,nav,aside,#nr-reading-style,[data-nr='ui']");
    for (var i = 0; i < forbidden.length; i++) forbidden[i].remove();
    var all = root.querySelectorAll("*");
    for (var j = 0; j < all.length; j++) {
      var attrs = Array.from(all[j].attributes);
      for (var k = 0; k < attrs.length; k++) {
        var attr = attrs[k];
        if (/^on/i.test(attr.name) || ((attr.name === "href" || attr.name === "src" || attr.name === "action") && /^(?:javascript|data|vbscript):/i.test(attr.value))) all[j].removeAttribute(attr.name);
      }
    }
    if (root.nodeType === 1 && /^(SCRIPT|STYLE|NOSCRIPT|IFRAME|OBJECT|EMBED|FORM|BUTTON|INPUT|TEXTAREA|SELECT|NAV|ASIDE)$/i.test(root.tagName)) root.remove();
  }

  function candidateScore(element) {
    var text = (element.innerText || element.textContent || "").trim();
    if (text.length < 160) return 0;
    var score = text.length;
    if (/^(ARTICLE|MAIN)$/.test(element.tagName)) score += 10000;
    if (element.matches("[role='main'],[itemprop='articleBody'],.article-body,.article-content,.post-content,.entry-content")) score += 5000;
    return score;
  }

  function findArticle() {
    var candidates = document.querySelectorAll("article,main,[role='main'],[itemprop='articleBody'],.article-body,.article-content,.post-content,.entry-content");
    var best = null;
    var bestScore = 0;
    for (var i = 0; i < candidates.length; i++) {
      var score = candidateScore(candidates[i]);
      if (score > bestScore) {
        best = candidates[i];
        bestScore = score;
      }
    }
    if (best) return best;
    var fallback = document.createElement("div");
    var children = document.body ? document.body.children : [];
    for (var i = 0; i < children.length; i++) {
      if (!/^(SCRIPT|STYLE|NOSCRIPT|NAV|ASIDE|HEADER|FOOTER)$/i.test(children[i].tagName)) fallback.appendChild(children[i].cloneNode(true));
    }
    return fallback;
  }

  function transformClone(root) {
    if (!window.NeuroReader || !root) return;
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var parent = node.parentElement;
        if (!node.nodeValue || !node.nodeValue.trim() || !parent) return NodeFilter.FILTER_REJECT;
        if (parent.closest("script,style,pre,code,[data-nr]")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    for (var i = 0; i < nodes.length; i++) {
      var span = document.createElement("span");
      span.setAttribute("data-nr", "1");
      span.innerHTML = window.NeuroReader.transform(nodes[i].nodeValue);
      nodes[i].parentNode.replaceChild(span, nodes[i]);
    }
  }

  function countWords(text) {
    return (String(text || "").match(/[\p{L}\p{N}]+/gu) || []).length;
  }

  function recordWords(words) {
    if (!words) return;
    storageGet("local", { nrReadingTotals: { date: "", words: 0 } }, function (data) {
      var today = new Date().toISOString().slice(0, 10);
      var totals = data.nrReadingTotals || { date: today, words: 0 };
      if (totals.date !== today) totals = { date: today, words: 0 };
      totals.words = Math.max(0, Number(totals.words) || 0) + words;
      storageSet("local", { nrReadingTotals: totals });
    });
  }

  function showReminder() {
    if (!overlay || !modeOpen) return;
    var existing = overlay.querySelector(".nr-eye-reminder");
    if (existing) return;
    var reminder = document.createElement("div");
    reminder.className = "nr-eye-reminder";
    var close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss eye rest reminder");
    close.textContent = "×";
    close.addEventListener("click", function () { reminder.remove(); });
    reminder.appendChild(close);
    var text = document.createElement("span");
    text.textContent = "Look at something 20 feet away for 20 seconds.";
    reminder.appendChild(text);
    overlay.appendChild(reminder);
  }

  function startReminder() {
    if (reminderTimer) clearInterval(reminderTimer);
    if (!settings.eyeRest) return;
    storageGet("sync", { nrEyeInterval: 20 }, function (data) {
      var minutes = Math.max(0.05, Number(data.nrEyeInterval) || 20);
      reminderTimer = setInterval(showReminder, minutes * 60000);
    });
  }

  function stopReminder() {
    if (reminderTimer) clearInterval(reminderTimer);
    reminderTimer = null;
  }

  function closeMode() {
    stopReminder();
    if (overlay) overlay.remove();
    overlay = null;
    modeOpen = false;
    document.documentElement.classList.remove("nr-reading-active");
    updateGlobalAids();
  }

  function openMode() {
    if (modeOpen) return;
    ensureStyles();
    var source = findArticle();
    var clone = source.cloneNode(true);
    removeUnsafeNodes(clone);
    transformClone(clone);
    var words = countWords(clone.textContent);

    overlay = document.createElement("div");
    overlay.id = MODE_ID;
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", "NeuroReader reading mode");
    var toolbar = document.createElement("div");
    toolbar.className = "nr-reading-toolbar";
    var label = document.createElement("strong");
    label.textContent = "Reading mode";
    toolbar.appendChild(label);
    var count = document.createElement("span");
    count.textContent = words + " words";
    toolbar.appendChild(count);
    var exit = document.createElement("button");
    exit.type = "button";
    exit.id = "nr-reading-exit";
    exit.textContent = "Exit";
    exit.addEventListener("click", closeMode);
    toolbar.appendChild(exit);
    var content = document.createElement("main");
    content.className = "nr-reading-content";
    content.id = "nr-reading-content";
    content.appendChild(clone);
    overlay.appendChild(toolbar);
    overlay.appendChild(content);
    var filter = document.getElementById(FILTER_ID);
    if (!filter) {
      filter = document.createElement("div");
      filter.id = FILTER_ID;
      filter.setAttribute("aria-hidden", "true");
      document.body.appendChild(filter);
    }
    document.body.appendChild(overlay);
    modeOpen = true;
    document.documentElement.classList.add("nr-reading-active");
    updateGlobalAids();
    startReminder();
    if (!window.NeuroReaderStats) recordWords(words);
    if (window.NeuroReaderStats) window.NeuroReaderStats.recordSession(words);
    exit.focus();
  }

  function toggleMode() {
    if (modeOpen) closeMode();
    else openMode();
    return modeOpen;
  }

  function refreshSettings() {
    storageGet("sync", { nrSettings: settings }, function (data) {
      settings = normalizeSettings(data.nrSettings);
      updateGlobalAids();
      if (modeOpen) startReminder();
    });
  }

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && modeOpen) {
      event.preventDefault();
      closeMode();
    }
    if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === "r") {
      event.preventDefault();
      toggleMode();
    }
  }, true);

  window.NeuroReaderReadingMode = {
    open: openMode,
    close: closeMode,
    toggle: toggleMode,
    state: function () { return modeOpen; },
  };

  storageApi.runtime.onMessage.addListener(function (message, sender, respond) {
    if (!message) return;
    if (message.type === "nr-reading-mode-toggle") {
      respond({ active: toggleMode() });
    } else if (message.type === "nr-reading-mode-state") {
      respond({ active: modeOpen });
    }
  });

  if (storageApi.storage.onChanged && storageApi.storage.onChanged.addListener) {
    storageApi.storage.onChanged.addListener(function (changes, area) {
      if (area === "sync" && (changes.nrSettings || changes.nrBlueStart || changes.nrBlueEnd || changes.nrEyeInterval)) refreshSettings();
    });
  }

  ensureStyles();
  refreshSettings();
})();
