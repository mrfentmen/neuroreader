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
  // Subtrees we never touch: scripts, form controls, interactive dropdown
  // widgets, code blocks, and our own markup. Replacing text inside a custom
  // listbox/combobox can change event.target and break widgets that use the
  // target to commit a selection, so leave the whole control's DOM intact.
  var SKIP_SELECTOR =
    "script,style,noscript,textarea,input,select,option,optgroup,datalist,code,pre,[data-nr]," +
    "[role='combobox'],[role='listbox'],[role='option'],[role='menu'],[role='menuitem']," +
    "[aria-haspopup='listbox'],[aria-haspopup='menu']";
  var OBSERVE_DEBOUNCE_MS = 350;
  var EXT_WHITESPACE = /^\s+$/;

  var styleEl = null;
  var buttonEl = null;
  var rootObserver = null; // observes the document, including body replacement
  var shadowRegistry = []; // { root, observer } per open shadow root
  var discoverTimer = null; // periodic scan for late-attached shadow roots
  var debounceTimer = null;
  var pendingRoots = null; // Set of subtrees dirtied by recent mutations

  // The content script runs in every frame (all_frames) so iframes get
  // transformed too; the floating button only makes sense in the top frame.
  var IS_TOP = window.top === window;
  // Friendly YouTube ad iframes have no YouTube renderer ancestor of their
  // own. The parent frame identifies them and passes this context across the
  // frame boundary without sending any page text.
  var frameIsAd = false;
  var frameNonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
  var frameTokens = []; // { window, nonce } for child frames that handshook

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

  function decorateFeatureHtml(html) {
    return window.NeuroReaderFeatures
      ? window.NeuroReaderFeatures.decorateHtml(html, featureSettings)
      : html;
  }

  // Per-flush cache of computed bold-context for each element. getComputedStyle
  // is expensive on big pages (comment feeds, chat); one call per element per
  // flush is enough, so we resolve both font-weight AND color together and
  // memoize. Cleared at the start of every flush (apply / flushQueue).
  var styleCache = new Map();

  /**
   * YouTube renders view counts and relative upload dates in several nested
   * wrappers, so their parent element is not a reliable selector boundary.
   * Recognize only the compact metadata formats themselves; ordinary prose
   * containing the word "views" is left on the normal formula path.
   */
  function isViewMetadataText(text) {
    var value = String(text || "").trim();
    return (
      /^(?:\d[\d,.]*\s*[KMBkmb]?\s+views?|\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago)(?:\s*[•·|]\s*(?:\d[\d,.]*\s*[KMBkmb]?\s+views?|\d+\s+(?:second|minute|hour|day|week|month|year)s?\s+ago))*$/i.test(value) ||
      /^(?:Streamed|Premiere[d]?)\s+.+$/i.test(value)
    );
  }

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
  function resolveBoldContext(el, text) {
    if (!el) return { isBold: false, isTitle: false, isAd: false, isMetadata: isViewMetadataText(text), shade: FALLBACK_SHADE };
    if (styleCache.has(el)) {
      var cached = styleCache.get(el);
      return {
        isBold: cached.isBold,
        isTitle: cached.isTitle,
        isAd: cached.isAd,
        isMetadata: isViewMetadataText(text),
        shade: cached.isBold || cached.isTitle || cached.isAd || isViewMetadataText(text) ? selectedFixationColor : cached.shade,
      };
    }
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
    var isTitle = isTitleLike(el);
    var isAd = isAdLike(el);
    var ctx = {
      isBold: isBold,
      isTitle: isTitle,
      isAd: isAd,
      isMetadata: isViewMetadataText(text),
      shade: isBold || isTitle || isAd || isViewMetadataText(text) ? selectedFixationColor : shadeOf(color),
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
  var DEFAULT_FIXATION_COLOR = "#dc2626";
  var selectedFixationColor = TITLE_SHADE;
  var featureSettings = {
    gradient: false,
    complexity: false,
    sentence: false,
    progress: false,
    spotlight: false,
    motion: false,
    contrast: false,
    rainbowWords: false,
    ruler: false,
    rulerSize: 6,
    rulerDim: 28,
    rulerStep: 8,
    rulerLock: false,
    spacing: false,
    lineHeight: 1.5,
    letterSpacing: 0.03,
    wordSpacing: 0.2,
    textScale: 1,
    color: "#dc2626",
  };
  var excludedSites = [];
  var siteColors = {};
  var globalFixationColor = DEFAULT_FIXATION_COLOR;
  var autoPreference = true;
  var rulerEl = null;
  var rulerDocument = null;
  var rulerMoveFrame = null;
  var rulerY = null;
  var frameRulerMoveFrame = null;
  var frameRulerY = null;
  var frameRulerForwarding = false;
  var textScaleNodeRecords = [];
  var textScaleNodeLookup = new WeakMap();

  function normalizeExcludedSites(value) {
    var sites = Array.isArray(value) ? value : [];
    var seen = Object.create(null);
    return sites.map(function (site) {
      return String(site || "").trim().toLowerCase().replace(/^www\./, "");
    }).filter(function (site) {
      if (!site || seen[site] || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(site)) return false;
      seen[site] = true;
      return true;
    }).slice(0, 100);
  }

  function isSiteExcluded() {
    var host = String(location.hostname || "").toLowerCase().replace(/^www\./, "");
    if (!host) return false;
    return excludedSites.some(function (site) {
      return host === site || host.slice(-(site.length + 1)) === "." + site;
    });
  }

  function normalizeStoredColor(value) {
    var raw = String(value || "").trim().toLowerCase();
    if (!/^#[0-9a-f]{6}$/i.test(raw)) return DEFAULT_FIXATION_COLOR;
    return raw;
  }

  function normalizeSiteColors(value) {
    var input = value && typeof value === "object" ? value : {};
    var output = {};
    var seen = Object.create(null);
    Object.keys(input).forEach(function (site) {
      var normalized = String(site || "").trim().toLowerCase().replace(/^www\./, "");
      if (!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(normalized) || seen[normalized]) return;
      seen[normalized] = true;
      output[normalized] = normalizeStoredColor(input[site]);
    });
    return output;
  }

  function activeStoredColor() {
    var host = String(location.hostname || "").toLowerCase().replace(/^www\./, "");
    var best = "";
    Object.keys(siteColors).forEach(function (site) {
      if (host === site || host.slice(-(site.length + 1)) === "." + site) {
        if (!best || site.length > best.length) best = site;
      }
    });
    return best ? siteColors[best] : globalFixationColor;
  }

  function normalizeFixationColor(value) {
    var raw = String(value || "").trim().toLowerCase();
    var match = raw.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/);
    if (!match) return TITLE_SHADE;
    var hex = match[1];
    if (hex.length === 3) {
      hex = hex.split("").map(function (part) { return part + part; }).join("");
    }
    return "rgb(" + parseInt(hex.slice(0, 2), 16) + "," + parseInt(hex.slice(2, 4), 16) + "," + parseInt(hex.slice(4, 6), 16) + ")";
  }

  function setFixationColor(value) {
    selectedFixationColor = normalizeFixationColor(value);
    styleCache.clear();
    var spans = allMarkedSpans();
    for (var i = 0; i < spans.length; i++) {
      spans[i].style.setProperty("--nr-color", selectedFixationColor);
    }
  }
  // YouTube card titles are not consistently bold: homepage and search cards
  // commonly use normal-weight custom elements, while the watch page uses an
  // h1. Detect the title affordance itself so every video-card title gets the
  // red fixation color instead of falling back to ordinary bolding.
  var TITLE_SELECTOR = [
    // Homepage, search results, related videos, and Shorts cards.
    "#video-title",
    "#video-title-link",
    "a[class*='video-title']",
    "[class*='video-title']",
    "[class*='lockup-metadata'][class*='title']",
    "yt-lockup-metadata-view-model h3",
    "ytd-video-renderer h3",
    "ytd-rich-item-renderer h3",
    "ytd-compact-video-renderer h3",
    "ytd-reel-item-renderer h3",
    "ytd-grid-video-renderer h3",
    // Creator/channel names shown below a video or beside a card.
    "#channel-name",
    "#owner #channel-name",
    "#owner-container #channel-name",
    "ytd-channel-name a",
    "ytd-channel-name yt-formatted-string",
    "ytd-channel-name > span",
    "ytd-video-owner-renderer #channel-name",
    "ytd-video-owner-renderer a",
    "ytd-video-owner-renderer > span",
    "ytd-video-meta-block #metadata-line a",
    "ytd-video-meta-block #metadata-line > span",
    "ytd-video-meta-block #metadata-line span.inline-metadata-item",
    "#metadata-line > span",
    "#metadata-line span.inline-metadata-item",
    "yt-content-metadata-view-model a",
    "yt-content-metadata-view-model > span",
    "yt-content-metadata-view-model span.inline-metadata-item",
    // Sponsored cards and ad labels: target their visible title/label nodes,
    // not the entire ad renderer (which also contains unrelated copy).
    "ytd-ad-slot-renderer h3",
    "ytd-ad-slot-renderer [id*='title']",
    "ytd-ad-slot-renderer [class*='title']",
    "ytd-ad-slot-renderer [aria-label='Ad']",
    "ytd-ad-slot-renderer > span",
    "ytd-display-ad-renderer h3",
    "ytd-display-ad-renderer [id*='title']",
    "ytd-display-ad-renderer [class*='title']",
    "ytd-display-ad-renderer > span",
    "ytd-promoted-sparkles-web-renderer h3",
    "ytd-promoted-sparkles-web-renderer [class*='title']",
    "ytd-in-feed-ad-layout-renderer h3",
    "ytd-banner-promo-renderer h3",
    "ytd-player-legacy-desktop-watch-ads-renderer [aria-label='Ad']",
    "[aria-label='Ad'] > span",
    "[aria-label='Ad'] h3",
    "[aria-label='Ad'] [id*='title']",
    "[aria-label='ADVERTISEMENT'] > span",
    "[aria-label='ADVERTISEMENT'] h3",
    "[aria-label*='Sponsored'] > span",
    "[aria-label*='Sponsored'] h3",
    "[aria-label*='sponsored'] > span",
    "[aria-label*='sponsored'] h3",
    // YouTube's top navigation/search labels. Keep the selectors at the
    // visible label/link level rather than tinting the whole masthead.
    "ytd-masthead > span",
    "ytd-guide-entry-renderer #endpoint",
    "ytd-guide-entry-renderer yt-formatted-string",
    "ytd-mini-guide-entry-renderer #endpoint",
    "#search-form [aria-label='Search']",
    "ytd-searchbox yt-formatted-string",
    // The horizontal topic/filter chip bar on Home and Search.
    "#chips yt-chip-cloud-chip-renderer",
    "yt-chip-cloud-chip-renderer",
    "ytd-feed-filter-chip-bar-renderer yt-formatted-string",
    "tp-yt-paper-chip",
    // Reddit-style posts, comments, and navigation use ordinary semantic
    // elements plus site-specific wrappers rather than YouTube tags.
    "#reddit-nav a",
    "article[class*='reddit-post'] h1",
    "article[class*='reddit-post'] h2",
    "article[class*='reddit-post'] strong",
    "article[class*='reddit-post'] b",
    "article[class*='reddit-post'] [class*='reddit-link']",
    "[class*='reddit-comments'] strong",
    "[class*='reddit-comments'] b",
    "[data-testid='post-container'] h1",
    "[data-testid='post-container'] h2",
    "[data-testid='post-container'] strong",
    "[data-testid='post-container'] b",
    "[data-testid*='comment'] strong",
    "[data-testid*='comment'] b",
    "shreddit-post h1",
    "shreddit-post h2",
    "shreddit-post strong",
    "shreddit-post b",
    "shreddit-comment strong",
    "shreddit-comment b",
    // Twitch chat and stream metadata use data-a-target hooks and custom
    // elements. Keep the red treatment on the visible name/title nodes.
    "[data-a-target='chat-message-username']",
    "[data-a-target='chat-line-message'] strong",
    "[data-a-target='stream-title']",
    ".chat-line__username",
    ".stream-title",
    // GitHub repositories/issues and pull requests.
    "[data-testid='issue-title']",
    "[data-testid='issue-title-link']",
    // GitLab issue/MR cards and project navigation.
    "[data-testid='issuable-title']",
    "[data-testid='issue-title']",
    ".issuable-title",
    ".issue-title-text",
    ".merge-request-title",
    "[data-testid='project-name']",
    // arXiv result cards have a stable result wrapper and a dedicated title
    // paragraph. Keep author, abstract, and PDF/action links on the normal
    // formula path rather than tinting the whole result.
    ".arxiv-result > .title",
    // Documentation and article systems (MDN, Medium, generic long-form).
    "main h1",
    "main h2",
    "[data-testid='storyTitle']",
    "[data-testid='post-title']",
    ".graf--title",
    ".graf--h2",
    // Additional public publishers expose semantic class hooks on cards
    // rather than heading tags. Keep these exact hooks narrow so ordinary
    // body copy and author metadata remain on the normal formula path.
    "a[class*='HeadlineLink']",
    ".docsum-title",
    ".PagePromo-title",
    ".PageList-header-title",
    ".PageList-trending-title",
    ".card-headline",
    ".card-sublink-headline",
    // Google News article cards expose a useful accessible-label boundary;
    // target story links only, leaving source/byline/time metadata alone.
    "a[aria-label*=' - '][href*='/read/']:not([aria-label*='source' i])",
    // Search-result and package-directory cards.
    "#search h3",
    "[data-ved] h3",
    ".package-list-item h3",
    ".package-list-item a",
    ".search-result-title",
    // Public chat/help surfaces.
    "[data-testid='message-content'] strong",
    "[data-testid='message-author']",
    "[data-testid='channel-name']",
    "[data-testid='conversation-title']",
    "[data-testid='article-title']",
    "[data-testid='issue-title-link']",
    ".js-issue-title",
    ".Link--primary",
    ".markdown-title",
    // Stack Overflow question lists and answers.
    ".s-post-summary--content-title a",
    ".question-hyperlink",
    ".js-post-title",
    ".answercell strong",
    ".answercell b",
    // Hacker News story rows.
    ".titleline a",
    ".topsel",
    // News/article cards and headlines.
    "article h1",
    "article h2",
    "[data-testid*='headline']",
    "[data-testid*='title']",
    // NPR's public audio/navigation controls expose stable semantic hooks.
    "[aria-label='audio player navigation'] b",
    ".localization__station-name",
    ".navigation__donate",
    ".localization__action--donate",
    ".localization__action--donate-local-box",
  ].join(",");

  var AD_ANCESTOR_SELECTOR = [
    "ytd-ad-slot-renderer",
    "ytd-display-ad-renderer",
    "ytd-promoted-sparkles-web-renderer",
    "ytd-in-feed-ad-layout-renderer",
    "ytd-banner-promo-renderer",
    "ytd-player-legacy-desktop-watch-ads-renderer",
    "ytd-companion-slot-renderer",
    "ytd-action-companion-ad-renderer",
    "ytd-video-masthead-ad-v3-renderer",
    "[aria-label='Ad']",
    "[aria-label='ADVERTISEMENT']",
    "[aria-label*='Sponsored']",
    "[aria-label*='sponsored']",
    "[data-ad-slot]",
    "[data-ad-format]",
  ].join(",");

  function nextTitleAncestor(el) {
    if (el && el.parentElement) return el.parentElement;
    var root = el && el.getRootNode ? el.getRootNode() : null;
    return root && root.host ? root.host : null;
  }

  function isAdLike(el) {
    if (frameIsAd) return true;
    var current = el;
    for (var depth = 0; current && depth < 16; depth++, current = nextTitleAncestor(current)) {
      try {
        if (current.matches(AD_ANCESTOR_SELECTOR)) return true;
      } catch (e) {
        // A site-specific selector must never stop the text walker.
      }
    }
    return false;
  }

  function isAdFrame(frame) {
    if (!frame || frame.tagName !== "IFRAME") return false;
    var identity = [
      frame.id,
      frame.name,
      frame.getAttribute("src") || "",
      frame.getAttribute("title") || "",
      frame.getAttribute("aria-label") || "",
      frame.className || "",
    ].join(" ");
    return /(?:^|[\s_-])ad(?:[\s_-]|$)|(?:google[_-]?ads|googlesyndication|doubleclick|adservice|adsystem|advert|sponsor)/i.test(identity) || isAdLike(frame);
  }

  function allChildFrames() {
    var found = [];
    function collect(root) {
      if (!root || !root.querySelectorAll) return;
      var frames = root.querySelectorAll("iframe,frame");
      for (var i = 0; i < frames.length; i++) found.push(frames[i]);
      var els = root.querySelectorAll("*");
      for (var j = 0; j < els.length; j++) {
        if (els[j].shadowRoot) collect(els[j].shadowRoot);
      }
    }
    collect(document);
    return found;
  }

  function tokenForWindow(targetWindow) {
    for (var i = 0; i < frameTokens.length; i++) {
      if (frameTokens[i].window === targetWindow) return frameTokens[i].nonce;
    }
    return null;
  }

  function rememberFrameWindow(targetWindow, nonce) {
    for (var i = 0; i < frameTokens.length; i++) {
      if (frameTokens[i].window === targetWindow) {
        frameTokens[i].nonce = nonce;
        return;
      }
    }
    frameTokens.push({ window: targetWindow, nonce: nonce });
  }

  function sendFrameContext(frame) {
    if (!frame || !frame.contentWindow) return;
    var nonce = tokenForWindow(frame.contentWindow);
    if (!nonce) return; // wait for the child content script's handshake
    try {
      frame.contentWindow.postMessage(
        { source: "neuroreader", type: "nr-frame-context", isAd: isAdFrame(frame), nonce: nonce },
        "*",
      );
    } catch (e) {
      // A frame can disappear while a YouTube renderer is recycling it.
    }
  }

  function sendFrameAction(frame, action) {
    if (!frame || !frame.contentWindow) return;
    var nonce = tokenForWindow(frame.contentWindow);
    if (!nonce) return;
    try {
      frame.contentWindow.postMessage(
        { source: "neuroreader", type: "nr-frame-action", action: action, nonce: nonce },
        "*",
      );
    } catch (e) {
      // A frame can disappear while a YouTube renderer is recycling it.
    }
  }

  function broadcastFrameContexts() {
    if (!IS_TOP || !document.querySelectorAll) return;
    var frames = allChildFrames();
    for (var i = 0; i < frames.length; i++) sendFrameContext(frames[i]);
  }

  function broadcastFrameAction(action) {
    if (!IS_TOP) return;
    // A friendly frame can be navigating while the parent toggles. Retry the
    // small action handshake briefly so Undo/Transform cannot lose a race
    // with frame startup or document.open(). The action is idempotent.
    function retry(remaining) {
      var frames = allChildFrames();
      for (var i = 0; i < frames.length; i++) sendFrameAction(frames[i], action);
      if (remaining > 0) {
        setTimeout(function () { retry(remaining - 1); }, 250);
      }
    }
    retry(4);
  }

  function setFrameAdContext(enabled) {
    var next = !!enabled;
    if (frameIsAd === next) return;
    frameIsAd = next;
    styleCache.clear();
    // The child may have auto-transformed before the parent identified it.
    // Rebuild its local spans so the already-rendered ad gets the red mode.
    if (hasTransformedSpans()) {
      unwatch();
      undo();
      apply();
      watch();
    }
  }

  function handleFrameMessage(event) {
    var data = event && event.data;
    if (!data || data.source !== "neuroreader") return;
    if (data.type === "nr-ruler-pointer" && event.source) {
      if (featureSettings.rulerLock) return;
      var childFrame = allChildFrames().find(function (frame) { return frame.contentWindow === event.source; });
      var expectedNonce = tokenForWindow(event.source);
      if (!childFrame || !expectedNonce || data.nonce !== expectedNonce) return;
      var childRect = childFrame.getBoundingClientRect();
      var childY = Number(data.y);
      if (!isFinite(childY)) return;
      if (IS_TOP) {
        updateRulerPosition(childRect.top + childY);
      } else if (window.parent && window.parent !== window) {
        try {
          window.parent.postMessage({ source: "neuroreader", type: "nr-ruler-pointer", nonce: frameNonce, y: childRect.top + childY }, "*");
        } catch (e) {
          // A frame can disappear while its page is navigating.
        }
      }
      return;
    }
    if (data.type === "nr-frame-ready" && IS_TOP) {
      if (event.source && data.nonce) rememberFrameWindow(event.source, data.nonce);
      var frames = allChildFrames();
      for (var i = 0; i < frames.length; i++) {
        if (frames[i].contentWindow === event.source) sendFrameContext(frames[i]);
      }
      return;
    }
    if (
      data.type === "nr-frame-context" &&
      !IS_TOP &&
      event.source === window.parent &&
      data.nonce === frameNonce
    ) {
      setFrameAdContext(data.isAd);
      return;
    }
    if (
      data.type === "nr-frame-action" &&
      !IS_TOP &&
      event.source === window.parent &&
      data.nonce === frameNonce
    ) {
      if (data.action === "apply") {
        apply();
        watch();
      } else if (data.action === "undo") {
        unwatch();
        undo();
      }
    }
  }

  window.addEventListener("message", handleFrameMessage, false);
  window.addEventListener("scroll", applyReadingAids, { passive: true });
  window.addEventListener("resize", applyReadingAids);

  function notifyParentFrameReady(attempt) {
    if (IS_TOP || !window.parent || window.parent === window) return;
    var count = attempt || 0;
    try {
      window.parent.postMessage(
        { source: "neuroreader", type: "nr-frame-ready", nonce: frameNonce },
        "*",
      );
    } catch (e) {
      // Parent may be gone while a frame is navigating.
    }
    // The parent content script can start after a fast about:blank child.
    // Retry briefly so the frame never misses the one-time handshake.
    if (count < 5) {
      setTimeout(function () { notifyParentFrameReady(count + 1); }, 250 * (count + 1));
    }
  }

  function isTitleLike(el) {
    var current = el;
    for (var depth = 0; current && depth < 14; depth++, current = nextTitleAncestor(current)) {
      var tag = current.tagName;
      if (tag === "STRONG" || tag === "B" || /^H[1-3]$/.test(tag) || current.id === "title") return true;
      var className = typeof current.className === "string" ? current.className : "";
      if (/title|heading/i.test(className)) return true;
      try {
        if (current.matches(TITLE_SELECTOR)) return true;
      } catch (e) {
        // A page-specific selector or custom element must never stop a scan.
      }
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
      var html = decorateFeatureHtml(transformExtensionText(node.nodeValue));
      if (html === node.nodeValue) continue; // nothing to bold
      var span = document.createElement("span");
      span.setAttribute(MARK, "1");

      // Keep the selected fixation color on every transformed span so the
      // picker visibly controls every bold fixation letter. Already-bold text
      // is additionally marked as color mode to preserve its inherited weight.
      span.style.setProperty("--nr-color", selectedFixationColor);
      var parentEl = node.parentElement;
      if (parentEl) {
        var ctx = resolveBoldContext(parentEl, node.nodeValue);
        if (ctx.isBold || ctx.isTitle || ctx.isAd || ctx.isMetadata) {
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
    injectStyles();
    styleCache.clear();
    var changed = transformSubtree(document.body, new Set());
    if (changed > 0) updateButton();
    broadcastFrameContexts();
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
      broadcastFrameAction("undo");
    } else {
      apply();
      watch(); // sticky: keep transforming new content until Undo
      broadcastFrameAction("apply");
    }
  }

  function readingBlocks() {
    var blocks = document.querySelectorAll("p,article,section,li,[role='article']");
    var result = [];
    for (var i = 0; i < blocks.length; i++) {
      if (blocks[i].closest && blocks[i].closest("#" + LAUNCHER_ID + ",[" + MARK + '=\"ui\"]')) continue;
      if (blocks[i].querySelector && blocks[i].querySelector("[" + MARK + '=\"1\"]')) result.push(blocks[i]);
    }
    return result;
  }

  function sendFrameRulerPosition(y) {
    if (IS_TOP || !window.parent || window.parent === window) return;
    try {
      window.parent.postMessage({ source: "neuroreader", type: "nr-ruler-pointer", nonce: frameNonce, y: y }, "*");
    } catch (e) {
      // A parent can disappear while a frame navigates.
    }
  }

  function scheduleFrameRulerPosition(event) {
    if (featureSettings.rulerLock) return;
    frameRulerY = event.clientY;
    if (frameRulerMoveFrame !== null) return;
    var schedule = window.requestAnimationFrame || function (callback) { return window.setTimeout(callback, 16); };
    frameRulerMoveFrame = schedule(function () {
      frameRulerMoveFrame = null;
      sendFrameRulerPosition(frameRulerY);
    });
  }

  function applyFrameRulerForwarding() {
    var shouldForward = !IS_TOP && !!featureSettings.ruler;
    if (!shouldForward) {
      if (frameRulerForwarding) {
        document.removeEventListener("mousemove", scheduleFrameRulerPosition, true);
        document.removeEventListener("pointermove", scheduleFrameRulerPosition, true);
        frameRulerForwarding = false;
      }
      if (frameRulerMoveFrame !== null) {
        if (window.cancelAnimationFrame) window.cancelAnimationFrame(frameRulerMoveFrame);
        else window.clearTimeout(frameRulerMoveFrame);
        frameRulerMoveFrame = null;
      }
      return;
    }
    if (frameRulerForwarding) return;
    document.addEventListener("mousemove", scheduleFrameRulerPosition, true);
    document.addEventListener("pointermove", scheduleFrameRulerPosition, true);
    frameRulerForwarding = true;
  }

  function updateRulerStyle() {
    if (!rulerEl) return;
    var size = Math.max(2, Math.min(14, Number(featureSettings.rulerSize) || 6));
    var dim = Math.max(0, Math.min(70, Number(featureSettings.rulerDim) || 0));
    rulerEl.style.setProperty("--nr-ruler-half", (size * 0.5) + "rem");
    rulerEl.style.setProperty("--nr-ruler-dim", (dim / 100).toFixed(2));
  }

  function updateRulerPosition(y) {
    if (!rulerEl) return;
    var height = Math.max(0, Number(window.innerHeight) || 0);
    var numericY = Number(y);
    var next = isFinite(numericY)
      ? Math.max(0, Math.min(height, numericY))
      : height / 2;
    rulerEl.style.setProperty("--nr-ruler-y", next + "px");
    updateRulerStyle();
  }

  function scheduleRulerPosition(event) {
    if (featureSettings.rulerLock) return;
    rulerY = event.clientY;
    if (rulerMoveFrame !== null) return;
    var schedule = window.requestAnimationFrame || function (callback) { return window.setTimeout(callback, 16); };
    rulerMoveFrame = schedule(function () {
      rulerMoveFrame = null;
      updateRulerPosition(rulerY);
    });
  }

  function isRulerKeyboardTarget(target) {
    if (!target || target === document.body || target === document.documentElement) return true;
    var element = target.nodeType === 1 ? target : target.parentElement;
    if (!element) return true;
    return !element.closest("input,textarea,select,button,[contenteditable='true'],[role='textbox']");
  }

  function moveRulerByKeyboard(key) {
    if (!rulerEl || !featureSettings.ruler) return false;
    var height = Math.max(0, Number(window.innerHeight) || 0);
    var current = parseFloat(rulerEl.style.getPropertyValue("--nr-ruler-y"));
    if (!isFinite(current)) current = height / 2;
    var rulerStep = Math.max(2, Math.min(20, Number(featureSettings.rulerStep) || 8));
    var step = Math.max(24, Math.round(height * rulerStep / 100));
    var next = current;
    if (key === "ArrowUp") next -= step;
    else if (key === "ArrowDown") next += step;
    else if (key === "PageUp") next -= Math.max(step, Math.round(height * 0.72));
    else if (key === "PageDown") next += Math.max(step, Math.round(height * 0.72));
    else if (key === "Home") next = 0;
    else if (key === "End") next = height;
    else return false;
    updateRulerPosition(next);
    return true;
  }

  function handleRulerKeydown(event) {
    if (!featureSettings.ruler || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (!isRulerKeyboardTarget(event.target)) return;
    if (moveRulerByKeyboard(event.key)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function removeReadingRuler() {
    var owner = rulerDocument || document;
    owner.removeEventListener("mousemove", scheduleRulerPosition, true);
    owner.removeEventListener("pointermove", scheduleRulerPosition, true);
    owner.removeEventListener("keydown", handleRulerKeydown, true);
    if (rulerMoveFrame !== null) {
      if (window.cancelAnimationFrame) window.cancelAnimationFrame(rulerMoveFrame);
      else window.clearTimeout(rulerMoveFrame);
      rulerMoveFrame = null;
    }
    if (rulerEl) rulerEl.remove();
    rulerEl = null;
    rulerDocument = null;
    rulerY = null;
  }

  function applyReadingRuler() {
    applyFrameRulerForwarding();
    if (!IS_TOP || !featureSettings.ruler) {
      if (rulerEl) removeReadingRuler();
      return;
    }
    if (!rulerEl || !rulerEl.isConnected || rulerEl.ownerDocument !== document) {
      if (rulerEl) removeReadingRuler();
      injectStyles();
      rulerEl = document.createElement("div");
      rulerEl.id = "nr-reading-ruler";
      rulerEl.setAttribute(MARK, "ui");
      rulerEl.setAttribute("aria-hidden", "true");
      document.documentElement.appendChild(rulerEl);
      rulerDocument = document;
      rulerDocument.addEventListener("mousemove", scheduleRulerPosition, true);
      rulerDocument.addEventListener("pointermove", scheduleRulerPosition, true);
      rulerDocument.addEventListener("keydown", handleRulerKeydown, true);
      updateRulerPosition(window.innerHeight / 2);
    }
    updateRulerStyle();
  }

  function isTextScaleControl(el) {
    if (!el || !el.matches) return true;
    if (el.id === LAUNCHER_ID || el.getAttribute(MARK) === "ui") return true;
    if (el.getAttribute(MARK) === "1") return false;
    try {
      return el.matches(SKIP_SELECTOR) || !!el.closest(SKIP_SELECTOR);
    } catch (e) {
      return true;
    }
  }

  function hasDirectReadableText(el) {
    for (var i = 0; i < el.childNodes.length; i++) {
      var child = el.childNodes[i];
      if (child.nodeType === 3 && child.nodeValue && child.nodeValue.trim()) return true;
    }
    return false;
  }

  function collectTextScaleNodes(root) {
    if (!root || !root.querySelectorAll) return;
    var elements = [];
    if (root.nodeType === 1) elements.push(root);
    var all = root.querySelectorAll("*");
    for (var i = 0; i < all.length; i++) elements.push(all[i]);
    for (var j = 0; j < elements.length; j++) {
      var el = elements[j];
      var transformed = el.getAttribute(MARK) === "1";
      var hasTransformedText = false;
      try { hasTransformedText = !!el.querySelector("[" + MARK + '=\"1\"]'); } catch (e) { hasTransformedText = false; }
      if (isTextScaleControl(el) || (!transformed && !hasDirectReadableText(el) && !hasTransformedText)) continue;
      if (textScaleNodeLookup.has(el)) continue;
      var baseSize = 0;
      try { baseSize = parseFloat(window.getComputedStyle(el).fontSize); } catch (e) { baseSize = 0; }
      if (!isFinite(baseSize) || baseSize <= 0) continue;
      textScaleNodeLookup.set(el, true);
      textScaleNodeRecords.push({
        el: el,
        baseSize: baseSize,
        inlineValue: el.style.getPropertyValue("font-size"),
        inlinePriority: el.style.getPropertyPriority("font-size"),
        appliedValue: "",
      });
    }
  }

  function restoreTextScaleNodes() {
    for (var i = 0; i < textScaleNodeRecords.length; i++) {
      var record = textScaleNodeRecords[i];
      if (!record.el || !record.el.style) continue;
      // Preserve a page-authored inline change made while scaling was active.
      // Only restore our own last value; a different current value is new
      // page state and becomes the base size for the next pass.
      var currentValue = record.el.style.getPropertyValue("font-size");
      if (record.appliedValue && currentValue !== record.appliedValue) continue;
      if (record.inlineValue) record.el.style.setProperty("font-size", record.inlineValue, record.inlinePriority);
      else record.el.style.removeProperty("font-size");
    }
    textScaleNodeRecords = [];
    textScaleNodeLookup = new WeakMap();
  }

  function applyTextScale() {
    var scale = Number(featureSettings.textScale);
    if (!isFinite(scale) || scale === 1) {
      restoreTextScaleNodes();
      return;
    }
    // Remove the previous pass before measuring. Otherwise a late SPA node
    // inside an already-scaled parent would measure the scaled size and grow
    // again on every mutation flush.
    restoreTextScaleNodes();
    collectTextScaleNodes(document.body);
    for (var i = 0; i < shadowRegistry.length; i++) collectTextScaleNodes(shadowRegistry[i].root);
    var factor = Math.max(0.85, Math.min(1.5, scale));
    for (var j = 0; j < textScaleNodeRecords.length; j++) {
      var record = textScaleNodeRecords[j];
      if (record.el && record.el.style) {
        record.appliedValue = (record.baseSize * factor).toFixed(4) + "px";
        record.el.style.setProperty("font-size", record.appliedValue, "important");
      }
    }
  }

  function applyReadingAids() {
    applyReadingRuler();
    var blocks = readingBlocks();
    var center = window.innerHeight / 2;
    for (var i = 0; i < blocks.length; i++) {
      var rect = blocks[i].getBoundingClientRect();
      var before = rect.bottom < center - 20;
      var current = rect.top <= center && rect.bottom >= center;
      blocks[i].classList.toggle("nr-reading-faded", !!featureSettings.progress && before);
      blocks[i].classList.toggle("nr-focus-dim", !!featureSettings.spotlight && !current);
      blocks[i].classList.toggle("nr-focus-current", !!featureSettings.spotlight && current);
    }
    document.documentElement.classList.toggle("nr-motion-reduced", !!featureSettings.motion);
    document.documentElement.classList.toggle("nr-high-contrast", !!featureSettings.contrast);
    document.documentElement.classList.toggle("nr-spacing-active", !!featureSettings.spacing);
    document.documentElement.classList.toggle("nr-text-scale-active", Number(featureSettings.textScale) !== 1);
    document.documentElement.style.setProperty("--nr-line-height", String(featureSettings.lineHeight));
    document.documentElement.style.setProperty("--nr-letter-spacing", String(featureSettings.letterSpacing) + "em");
    document.documentElement.style.setProperty("--nr-word-spacing", String(featureSettings.wordSpacing) + "em");
    document.documentElement.style.setProperty("--nr-text-scale", String(featureSettings.textScale));
    applyTextScale();
    syncShadowSpacingStyles();
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
    // document.open()/document.write() can replace the document element in a
    // friendly ad frame while the content-script closure survives. Rebuild a
    // detached style node instead of treating the stale reference as valid.
    if (styleEl && styleEl.isConnected && styleEl.ownerDocument === document) return;
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
      "span[" + MARK + '="1"] b { font-weight: 700; color: var(--nr-color, inherit) !important; }',
      "span[" + MARK + '="1"] b[data-nr-gradient="1"] { color: transparent !important; -webkit-text-fill-color: transparent !important; }',
      // Adaptive mode: text that was ALREADY bold gets a color shift instead
      // of bold-on-bold. Keep the inherited weight, tint the fixation parts.
      "span[" + MARK + '="1"][data-nr-mode="color"] b {',
      "  font-weight: inherit;",
      // !important so a site rule like `b { color: ... !important }` can't
      // erase the shade and reintroduce invisible bold-on-bold.
      "  color: var(--nr-color, inherit) !important;",
      "}",
      "#nr-reading-ruler {",
      "  --nr-ruler-y: 50vh; --nr-ruler-half: 3rem; --nr-ruler-dim: .28;",
      "  position: fixed !important; inset: 0 !important; z-index: 2147483645 !important;",
      "  pointer-events: none !important;",
      "  background: linear-gradient(to bottom, rgba(0,0,0,var(--nr-ruler-dim)) 0, rgba(0,0,0,var(--nr-ruler-dim)) calc(var(--nr-ruler-y) - var(--nr-ruler-half)), transparent calc(var(--nr-ruler-y) - var(--nr-ruler-half)), transparent calc(var(--nr-ruler-y) + var(--nr-ruler-half)), rgba(0,0,0,var(--nr-ruler-dim)) calc(var(--nr-ruler-y) + var(--nr-ruler-half)), rgba(0,0,0,var(--nr-ruler-dim)) 100%) !important;",
      "}",
      ".nr-reading-faded { opacity: .52 !important; color: #a0a0a0 !important; transition: opacity 220ms ease, color 220ms ease; }",
      ".nr-focus-dim { opacity: .4 !important; transition: opacity 220ms ease; }",
      ".nr-focus-current { opacity: 1 !important; }",
      ".nr-motion-reduced, .nr-motion-reduced * { transition: none !important; animation: none !important; scroll-behavior: auto !important; }",
      ".nr-high-contrast, .nr-high-contrast * { text-shadow: none !important; }",
      "html.nr-spacing-active body, html.nr-spacing-active body *:not(input):not(textarea):not(select):not(option):not(optgroup):not(datalist):not(button):not([contenteditable]):not([role='textbox']):not([role='combobox']):not([role='listbox']):not([role='option']):not([role='menu']):not([role='menuitem']):not([role='button']):not([role='tab']):not([role='slider']):not([role='spinbutton']) { line-height: var(--nr-line-height) !important; letter-spacing: var(--nr-letter-spacing) !important; word-spacing: var(--nr-word-spacing) !important; }",

      ".nr-high-contrast span[" + MARK + '\"1\"] b { color: #000 !important; font-weight: 800 !important; }',
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
    injectStyles();
    applyReadingAids();
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
    if (changed > 0) {
      applyTextScale();
      updateButton();
    }
  }

  /**
   * Attach a MutationObserver to an open shadow root so late content inside
   * it (chat feeds, custom players) is transformed by the sticky watcher.
   * A MutationObserver on document.body can never see shadow-tree mutations,
   * so each shadow root needs its own observer. Idempotent.
   */
  function ensureShadowSpacingStyle(shadowRoot) {
    if (!shadowRoot || !shadowRoot.querySelector) return;
    var style = shadowRoot.querySelector("#nr-spacing-shadow-style");
    if (!featureSettings.spacing) {
      if (style) style.remove();
      return;
    }
    if (style) return;
    style = document.createElement("style");
    style.id = "nr-spacing-shadow-style";
    style.textContent = ":host { line-height: var(--nr-line-height) !important; letter-spacing: var(--nr-letter-spacing) !important; word-spacing: var(--nr-word-spacing) !important; }";
    shadowRoot.appendChild(style);
  }

  function syncShadowSpacingStyles() {
    for (var i = 0; i < shadowRegistry.length; i++) ensureShadowSpacingStyle(shadowRegistry[i].root);
  }

  function ensureShadowObserver(shadowRoot) {
    if (!shadowRoot) return;
    ensureShadowSpacingStyle(shadowRoot);
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
    // Observe the Document rather than only body: friendly ad frames and
    // SPA navigations can replace the entire document element with
    // document.open()/document.write(), which would detach a body observer.
    rootObserver.observe(document, {
      childList: true,
      subtree: true,
      characterData: true, // catch in-place text rewrites
    });
    // Watch open shadow roots that already exist too, and keep scanning for
    // late-attached shadow roots (attachShadow on pre-existing elements fires
    // no observable mutation).
    scanForShadowRoots(document.body, new Set());
    startDiscovery();
    broadcastFrameContexts();
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

  function setGlobalFixationColor(value) {
    globalFixationColor = normalizeStoredColor(value);
    setFixationColor(activeStoredColor());
  }

  function setAuto(enabled) {
    if (enabled) {
      apply();
      watch();
      broadcastFrameAction("apply");
    } else {
      unwatch();
      if (hasTransformedSpans()) undo();
      broadcastFrameAction("undo");
    }
  }

  var isPromiseStorageApi = typeof browser !== "undefined" && browser.storage && browser.storage.sync;
  var storage = isPromiseStorageApi ? browser.storage : chrome.storage;
  function storageGet(area, defaults, callback) {
    if (isPromiseStorageApi) {
      storage[area].get(defaults).then(callback, function () { callback(defaults); });
    } else {
      storage[area].get(defaults, callback);
    }
  }

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
  notifyParentFrameReady();
  // Auto-transform is ON by default: the very first page after install is
  // transformed without any click. Toggle it off any time in the popup.
  storageGet("sync", { nrAuto: true, nrColor: DEFAULT_FIXATION_COLOR, nrSettings: featureSettings }, function (data) {
    setGlobalFixationColor(data.nrColor);
    autoPreference = data.nrAuto !== false;
    if (window.NeuroReaderFeatures) featureSettings = window.NeuroReaderFeatures.normalize(data.nrSettings);
    applyReadingAids();
    if (excludedSites.length > 0 || data.nrAuto === false) setAuto(autoPreference && !isSiteExcluded());
  });
  storageGet("local", { nrExcludedSites: [], nrSiteColors: {} }, function (data) {
    excludedSites = normalizeExcludedSites(data.nrExcludedSites);
    siteColors = normalizeSiteColors(data.nrSiteColors);
    setFixationColor(activeStoredColor());
    setAuto(autoPreference && !isSiteExcluded());
  });
  storage.onChanged.addListener(function (changes, area) {
    if (area === "sync" && changes.nrAuto) {
      autoPreference = changes.nrAuto.newValue !== false;
      setAuto(autoPreference && !isSiteExcluded());
    }
    if (area === "local" && changes.nrExcludedSites) {
      excludedSites = normalizeExcludedSites(changes.nrExcludedSites.newValue);
      setAuto(autoPreference && !isSiteExcluded());
    }
    if (area === "local" && changes.nrSiteColors) {
      siteColors = normalizeSiteColors(changes.nrSiteColors.newValue);
      setFixationColor(activeStoredColor());
    }
    if (area === "sync" && changes.nrColor) {
      setGlobalFixationColor(changes.nrColor.newValue);
    }
    if (area === "sync" && changes.nrSettings) {
      featureSettings = window.NeuroReaderFeatures
        ? window.NeuroReaderFeatures.normalize(changes.nrSettings.newValue)
        : changes.nrSettings.newValue;
      if (hasTransformedSpans()) {
        unwatch();
        undo();
        apply();
        watch();
      }
      applyReadingAids();
    }
  });
})();
