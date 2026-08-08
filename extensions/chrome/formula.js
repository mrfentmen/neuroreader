/* =====================================================================
 * NeuroReader — Variable Fixation Formula (shared engine)
 *
 * This is the exact formula engine from the web app (index.html), factored
 * out so the extension's popup and content script run the SAME code as the
 * site. If you change one, change both.
 *
 * Pure function: text in, HTML out. No side effects, no network, no state
 * beyond the occurrence counters required by the alternating rules.
 *
 * Rules (per the constitution):
 *   1 letter  -> 0 or 1 bold, alternating on a GLOBAL counter across all
 *                single-letter words (1st bold, 2nd normal, 3rd bold, ...)
 *   2 letters -> always exactly 1 bold
 *   3 letters -> always exactly 2 bold
 *   4 letters -> 2 or 3 bold (50-50, random each occurrence)
 *   5 letters -> 2, 3, or 4 bold (random)
 *   6+ letters-> 3, 4, or 5 bold (random)
 *   ALL punctuation is always bolded.
 * Spacing and line breaks are preserved exactly.
 * ===================================================================== */
(function (root) {
  "use strict";

  // A countable letter or digit (Unicode-aware, so accents work: é, ü, ñ).
  var WORD_CHAR = /[\p{L}\p{N}]/u;
  // A run of spacing (spaces, tabs, newlines) — kept untouched.
  var WHITESPACE = /^\s+$/;

  // Escape user text so it can never break out of the HTML we build.
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      switch (c) {
        case "&":
          return "&amp;";
        case "<":
          return "&lt;";
        case ">":
          return "&gt;";
        case '"':
          return "&quot;";
        default:
          return "&#39;";
      }
    });
  }

  /**
   * How many leading letters to bold for a word of `length` letters.
   * `occurrence` is the zero-based count of times this exact word has
   * already appeared (used only by the 1-letter alternating rule).
   */
  function boldCountFor(length, occurrence) {
    if (length === 1) return occurrence % 2 === 0 ? 1 : 0;
    if (length === 2) return 1;
    if (length === 3) return 2;
    if (length === 4) return Math.random() < 0.5 ? 2 : 3;
    if (length === 5) return 2 + Math.floor(Math.random() * 3);
    return 3 + Math.floor(Math.random() * 3); // 6+ letters
  }

  /**
   * Transform one "word token" — a run of characters between whitespace.
   * Letters and digits are counted for the formula; every punctuation
   * character is always bolded. Returns escaped HTML.
   */
  function transformToken(token, counters, singleLetterState) {
    var chars = Array.from(token);
    var wordChars = [];
    for (var i = 0; i < chars.length; i++) {
      if (WORD_CHAR.test(chars[i])) wordChars.push(chars[i]);
    }
    var letterCount = wordChars.length;

    // No letters at all (e.g. "...", "—", "😊"): everything is punctuation.
    if (letterCount === 0) {
      var allPunct = "";
      for (var p = 0; p < chars.length; p++) {
        allPunct += "<b>" + escapeHTML(chars[p]) + "</b>";
      }
      return allPunct;
    }

    var occurrence;
    // Single-letter words share one global alternating counter.
    if (letterCount === 1) {
      occurrence = singleLetterState.count;
      singleLetterState.count += 1;
    } else {
      // Occurrence tracking is per-word and case-insensitive: "The" and
      // "the" share a counter, so the same word varies each time it appears.
      var key = wordChars.join("").toLowerCase();
      occurrence = counters.get(key) || 0;
      counters.set(key, occurrence + 1);
    }

    var boldCount = boldCountFor(letterCount, occurrence);
    var out = "";
    var seen = 0;
    for (var k = 0; k < chars.length; k++) {
      var c = chars[k];
      if (WORD_CHAR.test(c)) {
        seen += 1;
        out +=
          seen <= boldCount ? "<b>" + escapeHTML(c) + "</b>" : escapeHTML(c);
      } else {
        out += "<b>" + escapeHTML(c) + "</b>";
      }
    }
    return out;
  }

  /**
   * The Variable Fixation Formula. Pure function: text in, HTML out.
   * Preserves every space, tab, and line break exactly as given.
   */
  function transform(text) {
    if (typeof text !== "string" || text.length === 0) return "";
    var counters = new Map();
    var singleLetterState = { count: 0 };
    var tokens = text.split(/(\s+)/); // split, keeping the whitespace
    var result = "";
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (token === "") continue;
      result += WHITESPACE.test(token)
        ? token
        : transformToken(token, counters, singleLetterState);
    }
    return result;
  }

  root.NeuroReader = {
    transform: transform,
    boldCountFor: boldCountFor,
    escapeHTML: escapeHTML,
  };
})(typeof window !== "undefined" ? window : globalThis);
