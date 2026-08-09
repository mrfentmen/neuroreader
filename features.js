/* NeuroReader optional presentation features. The formula remains the only engine
 * that decides which characters are bold; this module only decorates its HTML. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NeuroReaderFeatures = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var DEFAULTS = {
    gradient: false,
    complexity: false,
    sentence: false,
    progress: false,
    spotlight: false,
    ruler: false,
    motion: false,
    contrast: false,
    rainbowWords: false,
    color: "#dc2626",
    profile: "custom",
  };
  var COMPLEXITY = {
    short: "#dc2626",
    medium: "#2563eb",
    long: "#16a34a",
  };
  var RAINBOW = ["#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#2563eb", "#9333ea"];

  function settings(value) {
    var input = value || {};
    var out = {};
    Object.keys(DEFAULTS).forEach(function (key) {
      out[key] = input[key] === undefined ? DEFAULTS[key] : input[key];
    });
    if (input.baseColor) out.color = input.baseColor;
    if (!/^#[0-9a-f]{6}$/i.test(String(out.color))) out.color = DEFAULTS.color;
    if (["custom", "adhd", "dyslexia", "autism"].indexOf(String(out.profile)) < 0) out.profile = DEFAULTS.profile;
    if (out.profile === "adhd") {
      out.gradient = false;
      out.complexity = false;
      out.sentence = false;
      out.progress = true;
      out.spotlight = true;
      out.ruler = false;
      out.motion = false;
      out.contrast = false;
      out.rainbowWords = false;
    } else if (out.profile === "dyslexia") {
      out.gradient = true;
      out.complexity = false;
      out.sentence = true;
      out.progress = false;
      out.spotlight = false;
      out.ruler = false;
      out.motion = false;
      out.contrast = true;
      out.rainbowWords = false;
    } else if (out.profile === "autism") {
      out.gradient = false;
      out.complexity = false;
      out.sentence = false;
      out.progress = false;
      out.spotlight = false;
      out.ruler = false;
      out.motion = true;
      out.contrast = true;
      out.rainbowWords = false;
    }
    return out;
  }

  function rgb(hex) {
    var value = String(hex || "").replace(/^#/, "");
    if (value.length === 3) value = value.split("").map(function (c) { return c + c; }).join("");
    if (!/^[0-9a-f]{6}$/i.test(value)) value = "dc2626";
    return [parseInt(value.slice(0, 2), 16), parseInt(value.slice(2, 4), 16), parseInt(value.slice(4, 6), 16)];
  }

  function hex(parts) {
    return "#" + parts.map(function (part) {
      return Math.max(0, Math.min(255, Math.round(part))).toString(16).padStart(2, "0");
    }).join("");
  }

  function mix(color, amount) {
    var source = rgb(color);
    var target = amount < 0 ? [0, 0, 0] : [255, 255, 255];
    var distance = Math.abs(amount);
    return hex(source.map(function (part, index) { return part + (target[index] - part) * distance; }));
  }

  function plain(html) {
    return String(html || "")
      .replace(/<[^>]*>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  function isWordChar(value) {
    return /[\p{L}\p{N}]/u.test(value || "");
  }

  function tokenLength(token) {
    return Array.from(plain(token)).filter(isWordChar).length;
  }

  function colorFor(length, position, option) {
    var base = option.color;
    if (option.sentence && position === "first") return "#16a34a";
    if (option.sentence && position === "last") return "#2563eb";
    if (option.complexity) {
      if (length <= 4) return base;
      if (length <= 8) return COMPLEXITY.medium;
      if (length <= 14) return COMPLEXITY.long;
    }
    return base;
  }

  function decorateToken(token, option, state) {
    var length = tokenLength(token);
    if (!length) {
      if (/[.!?]/.test(plain(token))) state.afterSentence = true;
      return token;
    }
    var punctuationAtEnd = /[.!?](?:[^\p{L}\p{N}]*)$/u.test(plain(token));
    var position = state.afterSentence ? "first" : punctuationAtEnd ? "last" : "middle";
    state.afterSentence = punctuationAtEnd;
    var base = colorFor(length, position, option);
    var wordIndex = state.wordIndex++;
    if (option.rainbowWords) base = RAINBOW[wordIndex % RAINBOW.length];
    var fixationIndex = 0;
    var result = token.replace(/<b(?:\s[^>]*)?>[\s\S]*?<\/b>/gi, function (full) {
      var inner = full.replace(/^<b(?:\s[^>]*)?>|<\/b>$/gi, "");
      var character = plain(inner);
      if (!isWordChar(character)) return full;
      var color = base;
      if (length >= 15 && (option.complexity || option.rainbowWords)) color = RAINBOW[(wordIndex + fixationIndex) % RAINBOW.length];
      if (option.gradient && length < 15) color = mix(base, Math.min(0.62, fixationIndex * 0.2));
      if (length >= 15 && (option.gradient || option.complexity)) color = RAINBOW[fixationIndex % RAINBOW.length];
      fixationIndex += 1;
      var extra = "";
      if (option.gradient && length < 15) extra += "background:linear-gradient(90deg," + color + "," + mix(base, 0.7) + ");-webkit-background-clip:text;background-clip:text;color:transparent;";
      return "<b data-nr-fixation=\"1\" data-nr-gradient=\"" + (option.gradient && length < 15 ? "1" : "0") + "\" data-nr-word=\"" + wordIndex + "\" data-nr-length=\"" + length + "\" style=\"" + ("color:" + color + ";" + extra) + "\">" + inner + "</b>";
    });
    return result;
  }

  function decorateHtml(html, option) {
    var normalized = settings(option);
    if (!normalized.gradient && !normalized.complexity && !normalized.sentence && !normalized.rainbowWords) return html;
    var state = { afterSentence: true, wordIndex: 0 };
    return String(html || "").split(/(\s+)/).map(function (token) {
      return /^\s+$/.test(token) ? token : decorateToken(token, normalized, state);
    }).join("");
  }

  function wrapReadingBlocks(html) {
    return String(html || "").split(/\n{2,}/).map(function (block, index) {
      return "<p class=\"nr-reading-block\" data-nr-reading-block=\"" + index + "\">" + block.replace(/\n/g, "<br>") + "</p>";
    }).join("");
  }

  return {
    DEFAULTS: DEFAULTS,
    normalize: settings,
    decorateHtml: decorateHtml,
    wrapReadingBlocks: wrapReadingBlocks,
    plainText: plain,
    colors: { complexity: COMPLEXITY, rainbow: RAINBOW },
  };
});
