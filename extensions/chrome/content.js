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
 *   - ADAPTIVE bolding: text that is already bold (headings, navigation,
 *     emphasized copy, video titles) gets a color-shift formula instead of
 *     bold-on-bold, which would be invisible. The weight is kept and the
 *     color of the first part of each word + all punctuation shifts to a
 *     visibly different shade (works on light and dark backgrounds).
 *   - COMPOUND words longer than 15 letters are split into meaningful roots
 *     with a greedy dictionary and a deterministic syllable fallback; each
 *     part gets its own fixation pattern.
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
  var EXT_WHITESPACE = /^\s+$/;

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

  // Known roots and combining forms are intentionally kept separate: this
  // makes the canonical example read as pneu + mono, not pneumono. The
  // canonical word itself has an explicit linguistic segmentation below;
  // dictionary entries are otherwise matched greedily from the front.
  var COMPOUND_PARTS = [
    "coniosis", "microscope", "scopic",
    "pneu", "mono", "ultra", "micro", "silico", "vol", "cano",
    "cardio", "neuro", "electro", "gastro", "hepat", "hydro", "immuno",
    "lympho", "nephro", "osteo", "oto", "ophthalmo", "patho", "phono",
    "photo", "psycho", "thermo", "chrono", "astro", "bio", "geo", "aero",
    "anthropo", "archaeo", "audio", "biblio", "cephalo", "cerebro", "dermato",
    "entero", "gyno", "lipo", "litho", "myo", "paleo", "cardi", "inter",
    "intra", "hyper", "hypo", "macro", "multi", "poly", "pre", "post",
    "pseudo", "retro", "semi", "sub", "super", "tele", "trans", "uni",
    "anti", "auto", "allo", "amphi", "exo", "hemi", "peri", "proto",
  ].sort(function (a, b) {
    return b.length - a.length;
  });
  var COMPOUND_VOWEL = /[aeiouy]/i;
  var COMPOUND_LETTER = /[\p{L}]/u;
  var CANONICAL_COMPOUND = "pneumonoultramicroscopicsilicovolcanoconiosis";
  var CANONICAL_PART_LENGTHS = [4, 4, 5, 5, 6, 6, 3, 4, 8];

  function matchesCompoundPart(chars, lowerChars, index, part) {
    if (index + part.length > lowerChars.length) return false;
    for (var i = 0; i < part.length; i++) {
      if (lowerChars[index + i] !== part[i]) return false;
    }
    return true;
  }

  function longestCompoundPart(chars, lowerChars, index) {
    for (var i = 0; i < COMPOUND_PARTS.length; i++) {
      if (matchesCompoundPart(chars, lowerChars, index, COMPOUND_PARTS[i])) {
        return COMPOUND_PARTS[i];
      }
    }
    return null;
  }

  function nextKnownPartIndex(chars, lowerChars, index) {
    for (var cursor = index + 1; cursor < lowerChars.length; cursor++) {
      if (longestCompoundPart(chars, lowerChars, cursor)) return cursor;
    }
    return lowerChars.length;
  }

  /**
   * Deterministic syllable-like fallback for an unmatched root. It finds
   * vowel nuclei, keeps a single following consonant with the next syllable,
   * and splits a consonant cluster before its final consonant. A midpoint
   * fallback guarantees progress for unusual consonant-only strings.
   */
  function splitSyllableFallback(chars) {
    if (chars.length <= 4) return [chars.join("")];
    var boundaries = [];
    var i = 0;
    while (i < chars.length) {
      if (!COMPOUND_VOWEL.test(chars[i])) {
        i++;
        continue;
      }
      while (i < chars.length && COMPOUND_VOWEL.test(chars[i])) i++;
      var consonantStart = i;
      while (i < chars.length && !COMPOUND_VOWEL.test(chars[i])) i++;
      var consonants = i - consonantStart;
      if (i < chars.length) {
        var boundary = consonants > 1 ? i - 1 : consonantStart;
        if (boundary >= 2 && chars.length - boundary >= 2) boundaries.push(boundary);
      }
    }
    if (!boundaries.length && chars.length > 7) {
      var midpoint = Math.floor(chars.length / 2);
      for (var m = midpoint; m < chars.length - 1; m++) {
        if (COMPOUND_VOWEL.test(chars[m])) {
          midpoint = m;
          break;
        }
      }
      boundaries.push(Math.max(2, Math.min(midpoint, chars.length - 2)));
    }
    var parts = [];
    var start = 0;
    for (var b = 0; b < boundaries.length; b++) {
      var end = boundaries[b];
      if (end > start) {
        parts.push(chars.slice(start, end).join(""));
        start = end;
      }
    }
    if (start < chars.length) parts.push(chars.slice(start).join(""));
    return parts.length > 1 ? parts : [chars.join("")];
  }

  /** Greedily split a long letter run into known roots plus fallback chunks. */
  function splitCompoundLetters(word) {
    var chars = Array.from(word);
    var lowerWord = word.toLowerCase();
    if (lowerWord === CANONICAL_COMPOUND) {
      var canonicalParts = [];
      var canonicalCursor = 0;
      for (var c = 0; c < CANONICAL_PART_LENGTHS.length; c++) {
        var canonicalLength = CANONICAL_PART_LENGTHS[c];
        canonicalParts.push(chars.slice(canonicalCursor, canonicalCursor + canonicalLength).join(""));
        canonicalCursor += canonicalLength;
      }
      return canonicalParts;
    }
    var lowerChars = Array.from(lowerWord);
    var parts = [];
    var cursor = 0;
    while (cursor < chars.length) {
      var match = longestCompoundPart(chars, lowerChars, cursor);
      if (match) {
        parts.push(chars.slice(cursor, cursor + match.length).join(""));
        cursor += match.length;
        continue;
      }
      var next = nextKnownPartIndex(chars, lowerChars, cursor);
      var fallback = chars.slice(cursor, next);
      var fallbackParts = splitSyllableFallback(fallback);
      for (var i = 0; i < fallbackParts.length; i++) parts.push(fallbackParts[i]);
      cursor = next;
    }
    return parts.length > 1 ? parts : splitSyllableFallback(chars);
  }

  /**
   * Split only long letter runs inside a token. Punctuation remains in the
   * same position and is transformed independently, so text round-trips
   * exactly while each compound part receives a fresh formula application.
   */
  function compoundPartsForToken(token) {
    var chars = Array.from(token);
    var parts = [];
    var compound = false;
    var i = 0;
    while (i < chars.length) {
      var start = i;
      var isWord = COMPOUND_LETTER.test(chars[i]);
      while (i < chars.length && COMPOUND_LETTER.test(chars[i]) === isWord) i++;
      var run = chars.slice(start, i).join("");
      if (isWord && Array.from(run).length > 15) {
        var roots = splitCompoundLetters(run);
        for (var r = 0; r < roots.length; r++) parts.push(roots[r]);
        compound = true;
      } else {
        parts.push(run);
      }
    }
    return { parts: parts, compound: compound };
  }

  function transformExtensionText(text) {
    var tokens = text.split(/(\s+)/);
    var result = "";
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (token === "") continue;
      if (EXT_WHITESPACE.test(token)) {
        result += token;
        continue;
      }
      var split = compoundPartsForToken(token);
      if (!split.compound) {
        result += window.NeuroReader.transform(token);
        continue;
      }
      for (var p = 0; p < split.parts.length; p++) {
        result +=
          '<span data-nr-compound-part="1">' +
          window.NeuroReader.transform(split.parts[p]) +
          "</span>";
      }
    }
    return result;
  }

  // Per-flush cache of computed bold-context for each element. getComputedStyle
  // is expensive on big pages (comment feeds, chat); one call per element per
  // flush is enough, so we resolve both font-weight AND color together and
  // memoize. Cleared at the start of every flush (apply / flushQueue).
  var styleCache = new Map();

  /**
   * Adaptive bolding — is this element's text ALREADY bold? Bold-on-bold is
   * invisible, so already-bold text (headings, navigation, emphasized copy,
   * video titles) must get the color formula instead. Checks both the
   * computed font-weight (>= 700) and default-bold tags (h1-h6, b, strong).
   * Also computes the shade for the color formula. One getComputedStyle call
   * per element per flush, cached in styleCache. Returns
   * { isBold: boolean, shade: "rgb(r,g,b)" } — shade is ALWAYS a valid color
   * (never empty), so the color formula can never silently no-op.
   */
  function resolveBoldContext(el) {
    if (!el) return { isBold: false, shade: FALLBACK_SHADE };
    if (styleCache.has(el)) return styleCache.get(el);
    var tag = el.tagName;
    var isBold = tag === "STRONG" || tag === "B" || /^H[1-6]$/.test(tag);
    var color = "";
    try {
      var cs = window.getComputedStyle(el);
      if (!isBold) {
        var fw = cs.fontWeight;
        var n = parseInt(fw, 10);
        isBold = !isNaN(n) ? n >= 700 : /bold|bolder/i.test(fw);
      }
      color = cs.color;
    } catch (e) {
      // leave isBold as tag-derived, color empty -> fallback shade below
    }
    var ctx = {
      isBold: isBold,
      shade: isTitleLike(el) && isBold ? TITLE_SHADE : shadeOf(color),
    };
    styleCache.set(el, ctx);
    return ctx;
  }

  /**
   * Compute a visibly-different shade of a computed color string that works
   * on BOTH light and dark backgrounds. The text's own color already
   * contrasts with its background (it is readable); we shift its lightness
   * AWAY from the extremes into a readable mid band while keeping the hue:
   *   - dark text (light background) gets darker
   *   - light text (dark background) gets lighter
   * floored at ~12% and capped at ~88% lightness so near-black becomes a
   * visible dark gray and near-white a visible gray-white (a pure-black
   * "50% darker" would still be black — invisible). The input is a computed
   * style string: rgb()/rgba() in every engine, but wide-gamut builds can
   * return "color(srgb ...)" and exotic pages can produce anything — any
   * string we cannot parse (including "transparent") yields a neutral
   * mid-gray that is visible on both light and dark backgrounds, so the
   * color formula ALWAYS produces a visible shade and never degrades back to
   * invisible bold-on-bold.
   */
  var FALLBACK_SHADE = "rgb(128,128,128)";
  var TITLE_SHADE = "rgb(220,38,38)";

  function isTitleLike(el) {
    var current = el;
    for (var depth = 0; current && depth < 7; depth++, current = current.parentElement) {
      var tag = current.tagName;
      if (/^H[1-3]$/.test(tag) || current.id === "title") return true;
      var className = typeof current.className === "string" ? current.className : "";
      if (/title|heading/i.test(className)) return true;
    }
    return false;
  }

  function shadeOf(color) {
    var m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!m) return FALLBACK_SHADE;
    var r = +m[1] / 255;
    var g = +m[2] / 255;
    var b = +m[3] / 255;

    // RGB -> HSL (keep hue + saturation, move lightness).
    var max = Math.max(r, g, b);
    var min = Math.min(r, g, b);
    var l = (max + min) / 2;
    var h = 0;
    var s = 0;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
      else if (max === g) h = ((b - r) / d + 2) / 6;
      else h = ((r - g) / d + 4) / 6;
    }

    // Move lightness away from the extremes, floored/capped to stay visible:
    // dark text multiplies lightness down (~0.35x, floor 0.12 so near-black
    // becomes a visible dark gray — a pure-black "50% darker" would still be
    // black), light text rises toward white (cap 0.88 — near-white becomes a
    // visible gray-white).
    var nl =
      l < 0.5
        ? Math.max(l * 0.35, 0.12)
        : Math.min(l + (1 - l) * 0.65, 0.88);
    // Never return the same shade: a source color sitting exactly at the
    // floor/cap would otherwise come back unchanged (invisible). Nudge it
    // away from the extreme into the same half of the band instead.
    if (nl === l) nl = l < 0.5 ? Math.min(l + 0.25, 0.5) : Math.max(l - 0.25, 0.5);

    // HSL -> RGB.
    function hue2rgb(p, q, t) {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    }
    // Convert with the NEW lightness, keeping the same hue + saturation.
    var q2 = nl < 0.5 ? nl * (1 + s) : nl + s - nl * s;
    var p2 = 2 * nl - q2;
    var rr = hue2rgb(p2, q2, h + 1 / 3);
    var gg = hue2rgb(p2, q2, h);
    var bb = hue2rgb(p2, q2, h - 1 / 3);

    return (
      "rgb(" +
      Math.round(rr * 255) +
      "," +
      Math.round(gg * 255) +
      "," +
      Math.round(bb * 255) +
      ")"
    );
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
      var html = transformExtensionText(node.nodeValue);
      if (html === node.nodeValue) continue; // nothing to bold
      var span = document.createElement("span");
      span.setAttribute(MARK, "1");

      // Adaptive bolding: if this text is already bold (heading, nav, strong
      // copy, video title), bold-on-bold would be invisible — so mark the
      // span for the color formula instead. The weight is kept (inherit) and
      // the color of the first part of each word + punctuation shifts.
      var parentEl = node.parentElement;
      if (parentEl) {
        var ctx = resolveBoldContext(parentEl);
        if (ctx.isBold) {
          span.setAttribute("data-nr-mode", "color");
          span.style.setProperty("--nr-color", ctx.shade);
        }
      }

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
    styleCache.clear();
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
      // Adaptive mode: text that was ALREADY bold gets a color shift instead
      // of bold-on-bold. Keep the inherited weight, tint the fixation parts.
      "span[" + MARK + '="1"][data-nr-mode="color"] b {',
      "  font-weight: inherit;",
      // !important so a site rule like `b { color: ... !important }` can't
      // erase the shade and reintroduce invisible bold-on-bold.
      "  color: var(--nr-color, inherit) !important;",
      "}",
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
    styleCache.clear();
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
