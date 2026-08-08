/* =====================================================================
 * NeuroReader — content script
 *
 * Injects a "Transform with NeuroReader" button onto every page. Clicking
 * it (or the popup's "Transform this page" button) transforms all readable
 * text in place using the formula from formula.js. Every transformation is
 * reversible — the original text is restored when toggled off.
 *
 * "Sticky" transforms: after you transform a page, the extension keeps
 * watching it and transforms newly added or rewritten text until you click
 * Undo. This is what makes single-page apps (YouTube, feeds, chats) work —
 * content that lazy-loads after your click — and virtualized lists that
 * recycle their DOM nodes — still gets bolded.
 *
 * Also handles:
 *   - text inside open shadow roots (Twitch, YouTube UI, component libs),
 *     including LATE content inside them: every open shadow root gets its
 *     own MutationObserver, so chat feeds and custom players that append
 *     text after transform still get bolded
 *   - shadow roots attached AFTER transform (SPA component upgrades)
 *   - in-place text rewrites (characterData mutations)
 *   - heavy pages: only newly-changed subtrees are re-scanned, never the
 *     whole document
 *
 * Privacy: nothing here ever sends data anywhere. The DOM is changed
 * locally and can always be restored.
 * ===================================================================== */
(function () {
  "use strict";

  var MARK = "data-nr"; // on every element we inject or create
  var LAUNCHER_ID = "nr-launcher";
  // Subtrees we never touch: scripts, forms, code blocks, and our own markup.
  var SKIP_SELECTOR =
    "script,style,noscript,textarea,input,select,option,code,pre,[data-nr]";
  var OBSERVE_DEBOUNCE_MS = 350;

  var styleEl = null;
  var buttonEl = null;
  var rootObserver = null; // the one on document.body
  var shadowRegistry = []; // { root, observer } per open shadow root
  var discoverTimer = null; // periodic scan for late-attached shadow roots
  var debounceTimer = null;
  var pendingRoots = null; // Set of subtrees dirtied by recent mutations

  // The content script runs in every frame (all_frames) so iframes get
  // transformed too; the floating button only makes sense in the top frame.
  var IS_TOP = window.top === window;

  function isTransformable(node) {
    var t = node.nodeValue;
    if (!t || !t.trim() || t.length < 2) return false; // 1-char text: noise
    var parent = node.parentElement;
    if (!parent) return false;
    if (parent.closest(SKIP_SELECTOR)) return false;
    return true;
  }

  /** Collect every transformed span, descending into open shadow roots. */
  function collectMarked(root, acc) {
    var found = acc || [];
    var spans = root.querySelectorAll("[" + MARK + '="1"]');
    for (var i = 0; i < spans.length; i++) found.push(spans[i]);
    var els = root.querySelectorAll("*");
    for (var k = 0; k < els.length; k++) {
      if (els[k].shadowRoot) collectMarked(els[k].shadowRoot, found);
    }
    return found;
  }

  function allMarkedSpans() {
    return collectMarked(document);
  }

  function hasTransformedSpans() {
    return allMarkedSpans().length > 0;
  }

  /**
   * Transform every still-untouched text node inside `root`, descending into
   * open shadow roots. Idempotent (already-transformed spans are skipped).
   * Returns how many text nodes were transformed.
   */
  function transformSubtree(root, visited) {
    if (!root || visited.has(root)) return 0;
    visited.add(root);

    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        return isTransformable(node)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      },
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    var changed = 0;
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      var html = window.NeuroReader.transform(node.nodeValue);
      if (html === node.nodeValue) continue; // nothing to bold
      var span = document.createElement("span");
      span.setAttribute(MARK, "1");
      span.innerHTML = html;
      node.parentNode.replaceChild(span, node);
      changed++;
    }

    // Descend into open shadow roots — the root element's OWN shadow root
    // first (a queued root can be a shadow host), then child elements' —
    // and watch them all for late-arriving content (per-shadow-root
    // observers).
    if (root.shadowRoot) {
      ensureShadowObserver(root.shadowRoot);
      changed += transformSubtree(root.shadowRoot, visited);
    }
    if (root.querySelectorAll) {
      var els = root.querySelectorAll("*");
      for (var k = 0; k < els.length; k++) {
        if (els[k].shadowRoot) {
          ensureShadowObserver(els[k].shadowRoot);
          changed += transformSubtree(els[k].shadowRoot, visited);
        }
      }
    }
    return changed;
  }

  /** Full sweep of the whole page (used on manual Transform / auto-on). */
  function apply() {
    if (!document.body) return;
    var changed = transformSubtree(document.body, new Set());
    if (changed > 0) updateButton();
  }

  /** Restore the original text of every transformed span (shadow roots too). */
  function undo() {
    var spans = allMarkedSpans();
    for (var i = spans.length - 1; i >= 0; i--) {
      var span = spans[i];
      // textContent strips the <b> wrappers and returns the exact original
      // snapshot. Note: edits made to the page between transform and undo
      // are intentionally reset to the snapshot.
      span.parentNode.replaceChild(document.createTextNode(span.textContent), span);
    }
    updateButton();
  }

  function toggle() {
    if (hasTransformedSpans()) {
      unwatch();
      undo();
    } else {
      apply();
      watch(); // sticky: keep transforming new content until Undo
    }
  }

  function updateButton() {
    if (!buttonEl) return;
    var active = hasTransformedSpans();
    buttonEl.textContent = active
      ? "Undo NeuroReader"
      : "Transform with NeuroReader";
    buttonEl.setAttribute("aria-pressed", active ? "true" : "false");
  }

  function injectStyles() {
    if (styleEl) return;
    styleEl = document.createElement("style");
    styleEl.setAttribute(MARK, "ui");
    styleEl.textContent = [
      "#" + LAUNCHER_ID + " {",
      "  all: initial;",
      "  position: fixed !important;",
      "  right: 16px !important;",
      "  bottom: 16px !important;",
      "  z-index: 2147483647 !important;",
      "  display: inline-block;",
      "  padding: 12px 18px;",
      "  border: 2px solid #000 !important;",
      "  border-radius: 999px !important;",
      "  background: #000 !important;",
      "  color: #fff !important;",
      "  font: 600 14px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif !important;",
      "  cursor: pointer;",
      "  box-shadow: 0 2px 12px rgba(0,0,0,0.25);",
      "  text-decoration: none;",
      "  -webkit-tap-highlight-color: transparent;",
      "}",
      "#" + LAUNCHER_ID + ":hover { background: #1a1a1a !important; }",
      "#" + LAUNCHER_ID + ":focus-visible { outline: 3px solid #000 !important; outline-offset: 3px; }",
      "span[" + MARK + '="1"] b { font-weight: 700; }',
    ].join("\n");
    document.documentElement.appendChild(styleEl);
  }

  function injectButton() {
    if (document.getElementById(LAUNCHER_ID)) return;
    injectStyles();
    buttonEl = document.createElement("button");
    buttonEl.id = LAUNCHER_ID;
    buttonEl.type = "button";
    buttonEl.setAttribute(MARK, "ui");
    buttonEl.setAttribute("aria-pressed", "false");
    buttonEl.title = "Transform this page with NeuroReader";
    buttonEl.addEventListener("click", toggle);
    document.documentElement.appendChild(buttonEl);
    updateButton();
  }

  /* ---- Watching for new/rewritten content (sticky + auto mode) ---- */

  function addRoot(el) {
    if (!el) return;
    if (el.closest && el.closest("[" + MARK + "]")) return; // our own markup
    // Skip if an ancestor is already queued — it will cover this subtree.
    var p = el.parentElement;
    while (p) {
      if (pendingRoots.has(p)) return;
      p = p.parentElement;
    }
    pendingRoots.add(el);
  }

  function queueMutations(mutations) {
    if (!pendingRoots) pendingRoots = new Set();
    for (var i = 0; i < mutations.length; i++) {
      var m = mutations[i];
      if (m.type === "characterData") {
        addRoot(m.target.parentElement);
      } else if (m.type === "childList") {
        for (var j = 0; j < m.addedNodes.length; j++) {
          var n = m.addedNodes[j];
          if (n.nodeType === 1) addRoot(n);
          else if (n.parentElement) addRoot(n.parentElement);
        }
      }
    }
  }

  function flushQueue() {
    debounceTimer = null;
    dropDetachedShadowObservers();
    if (!pendingRoots) return;
    var roots = Array.from(pendingRoots);
    pendingRoots = null;
    var visited = new Set();
    var changed = 0;
    for (var i = 0; i < roots.length; i++) {
      // The queued element may have been detached (SPA churn) — skip it.
      if (!roots[i].isConnected) continue;
      changed += transformSubtree(roots[i], visited);
    }
    if (changed > 0) updateButton();
  }

  /**
   * Attach a MutationObserver to an open shadow root so late content inside
   * it (chat feeds, custom players) is transformed by the sticky watcher.
   * A MutationObserver on document.body can never see shadow-tree mutations,
   * so each shadow root needs its own observer. Idempotent.
   */
  function ensureShadowObserver(shadowRoot) {
    if (!shadowRoot) return;
    for (var i = 0; i < shadowRegistry.length; i++) {
      if (shadowRegistry[i].root === shadowRoot) return;
    }
    var obs = new MutationObserver(function (mutations) {
      if (debounceTimer) clearTimeout(debounceTimer);
      queueMutations(mutations);
      debounceTimer = setTimeout(flushQueue, OBSERVE_DEBOUNCE_MS);
    });
    obs.observe(shadowRoot, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    shadowRegistry.push({ root: shadowRoot, observer: obs });
  }

  /** Find every open shadow root reachable from `root` and watch it. */
  function scanForShadowRoots(root, visited) {
    if (!root || visited.has(root)) return;
    visited.add(root);
    if (root.shadowRoot) {
      ensureShadowObserver(root.shadowRoot);
      scanForShadowRoots(root.shadowRoot, visited);
    }
    var els = root.querySelectorAll ? root.querySelectorAll("*") : [];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.shadowRoot) {
        ensureShadowObserver(el.shadowRoot);
        scanForShadowRoots(el.shadowRoot, visited);
      }
    }
  }

  function isObserved(shadowRoot) {
    for (var i = 0; i < shadowRegistry.length; i++) {
      if (shadowRegistry[i].root === shadowRoot) return true;
    }
    return false;
  }

  /**
   * A shadow root attached to a PRE-EXISTING element (not a newly-inserted
   * host) fires no DOM mutation any observer can see, so late attachShadow
   * calls would be invisible to us. While watching, periodically scan the
   * light DOM for shadow roots we have not seen yet, watch them, and
   * transform their content. (A cheap property check on each element — the
   * full walk is a few ms on heavy pages.)
   */
  function discoverNewShadowRoots() {
    if (!rootObserver) return;
    try {
      var els = document.body.querySelectorAll("*");
      var changed = 0;
      for (var i = 0; i < els.length; i++) {
        var sr = els[i].shadowRoot;
        if (sr && !isObserved(sr)) {
          ensureShadowObserver(sr);
          changed += transformSubtree(sr, new Set());
        }
      }
      if (changed > 0) updateButton();
    } catch (e) {
      /* a discovery hiccup must never break the watcher */
    }
  }

  function startDiscovery() {
    if (!discoverTimer) {
      discoverTimer = setInterval(discoverNewShadowRoots, 2000);
    }
  }

  function stopDiscovery() {
    if (discoverTimer) {
      clearInterval(discoverTimer);
      discoverTimer = null;
    }
  }

  /**
   * Fast-path where the "shadowrootattached" event exists (some newer
   * Chromium builds): queue the host immediately instead of waiting for the
   * next discovery poll.
   */
  function onShadowRootAttached(e) {
    if (!rootObserver) return; // only while the sticky/auto watcher is active
    var host = e.target || (e.composedPath ? e.composedPath()[0] : null);
    if (!host || !host.shadowRoot) return;
    if (!pendingRoots) pendingRoots = new Set();
    pendingRoots.add(host);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(flushQueue, OBSERVE_DEBOUNCE_MS);
  }

  if (typeof document.addEventListener === "function") {
    document.addEventListener("shadowrootattached", onShadowRootAttached, true);
  }

  /** Disconnect observers whose shadow root was detached from the page. */
  function dropDetachedShadowObservers() {
    for (var i = shadowRegistry.length - 1; i >= 0; i--) {
      if (!shadowRegistry[i].root.isConnected) {
        shadowRegistry[i].observer.disconnect();
        shadowRegistry.splice(i, 1);
      }
    }
  }

  function watch() {
    if (rootObserver) return;
    rootObserver = new MutationObserver(function (mutations) {
      if (debounceTimer) clearTimeout(debounceTimer);
      queueMutations(mutations);
      debounceTimer = setTimeout(flushQueue, OBSERVE_DEBOUNCE_MS);
    });
    rootObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true, // catch in-place text rewrites
    });
    // Watch open shadow roots that already exist too, and keep scanning for
    // late-attached shadow roots (attachShadow on pre-existing elements fires
    // no observable mutation).
    scanForShadowRoots(document.body, new Set());
    startDiscovery();
  }

  function unwatch() {
    if (debounceTimer) clearTimeout(debounceTimer);
    stopDiscovery();
    if (rootObserver) {
      rootObserver.disconnect();
      rootObserver = null;
    }
    for (var i = 0; i < shadowRegistry.length; i++) {
      shadowRegistry[i].observer.disconnect();
    }
    shadowRegistry = [];
    pendingRoots = null;
  }

  function setAuto(enabled) {
    if (enabled) {
      apply();
      watch();
    } else {
      unwatch();
      if (hasTransformedSpans()) undo();
    }
  }

  var storage = typeof browser !== "undefined" && browser.storage
    ? browser.storage
    : chrome.storage;

  /* ---- Popup messages ---------------------------------------------- */

  chrome.runtime.onMessage.addListener(function (msg, sender, respond) {
    if (msg && msg.type === "nr-toggle") {
      toggle();
      respond({ applied: hasTransformedSpans() });
    } else if (msg && msg.type === "nr-state") {
      respond({ transformed: hasTransformedSpans() });
    }
  });

  /* ---- Init -------------------------------------------------------- */

  if (IS_TOP) injectButton();
  // Auto-transform is ON by default: the very first page after install is
  // transformed without any click. Toggle it off any time in the popup.
  storage.sync.get({ nrAuto: true }, function (data) {
    if (data.nrAuto) setAuto(true);
  });
  storage.onChanged.addListener(function (changes, area) {
    if (area === "sync" && changes.nrAuto) {
      setAuto(changes.nrAuto.newValue);
    }
  });
})();
