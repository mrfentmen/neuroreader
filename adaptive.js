/* NeuroReader local adaptive layer.
 *
 * This module never receives source text for storage. Text is analyzed into
 * aggregate metrics, then discarded. The canonical formula remains the only
 * code that chooses fixation characters; this layer recommends presentation
 * settings and strength metadata around that output.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.NeuroReaderAdaptive = factory();
})(typeof window !== "undefined" ? window : globalThis, function () {
  "use strict";

  var STORAGE_KEY = "neuroreader-adaptive-v1";
  var DEFAULT_STATE = {
    enabled: false,
    autoSpeed: false,
    profile: {
      totalWords: 0,
      totalTimeMs: 0,
      regressions: 0,
      scrollSamples: 0,
      speedSamples: 0,
      speedTotalWpm: 0,
      preferredStrengths: {},
      settingChanges: {},
      contentTypes: {},
      sessions: 0,
      days: {},
    },
    sessions: [],
    events: [],
    goals: { dailyWords: 5000, weeklyDays: 5 },
  };

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function numeric(value, fallback) {
    var result = Number(value);
    return Number.isFinite(result) ? result : fallback || 0;
  }

  function wordMetrics(text) {
    var source = String(text || "");
    var words = source.match(/[\p{L}\p{N}]+/gu) || [];
    var sentences = source.match(/[.!?]+/g) || [];
    var punctuation = source.match(/[^\p{L}\p{N}\s]/gu) || [];
    var totalLetters = words.reduce(function (sum, word) { return sum + Array.from(word).length; }, 0);
    var longWords = words.filter(function (word) { return Array.from(word).length >= 8; }).length;
    var compounds = words.filter(function (word) { return Array.from(word).length >= 15; }).length;
    var dialogue = (source.match(/["“”']/g) || []).length;
    var imperative = (source.match(/\b(?:open|click|select|press|choose|enter|go|read|write|add|remove|turn|make|start|stop)\b/gi) || []).length;
    return {
      words: words.length,
      sentences: sentences.length || (words.length ? 1 : 0),
      averageWordLength: words.length ? totalLetters / words.length : 0,
      averageSentenceLength: sentences.length ? words.length / sentences.length : words.length,
      punctuationDensity: source.length ? punctuation.length / source.length : 0,
      longWordRatio: words.length ? longWords / words.length : 0,
      compoundRatio: words.length ? compounds / words.length : 0,
      dialogueRatio: source.length ? dialogue / source.length : 0,
      imperativeRatio: words.length ? imperative / words.length : 0,
      codeBlocks: /```[\s\S]*?```|<code\b|<pre\b/.test(source),
    };
  }

  function classifyContent(text, hints) {
    var metrics = wordMetrics(text);
    var options = hints || {};
    if (options.monospace || options.code || metrics.codeBlocks) return { type: "code", confidence: 1, metrics: metrics };
    var scores = { technical: 0, narrative: 0, instructions: 0, general: 0 };
    if (metrics.averageWordLength >= 6 || metrics.longWordRatio >= 0.28 || metrics.compoundRatio >= 0.04) scores.technical += 3;
    if (metrics.punctuationDensity >= 0.08) scores.technical += 1;
    if (metrics.dialogueRatio >= 0.012) scores.narrative += 3;
    if (metrics.averageSentenceLength >= 8 && metrics.averageSentenceLength <= 24) scores.narrative += 1;
    if (metrics.imperativeRatio >= 0.04 || metrics.averageSentenceLength <= 9) scores.instructions += 3;
    if (!scores.technical && !scores.narrative && !scores.instructions) scores.general = 1;
    var type = Object.keys(scores).sort(function (a, b) { return scores[b] - scores[a]; })[0];
    var top = scores[type];
    var total = Object.keys(scores).reduce(function (sum, key) { return sum + scores[key]; }, 0);
    return { type: type, confidence: total ? Math.min(1, top / total) : 0, metrics: metrics };
  }

  function dateParts(now) {
    var date = new Date(now());
    return {
      day: date.toISOString().slice(0, 10),
      hour: String(date.getHours()).padStart(2, "0"),
      weekday: date.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }),
    };
  }

  function normalizeState(value) {
    var state = clone(DEFAULT_STATE);
    if (!value || typeof value !== "object") return state;
    state.enabled = value.enabled === true;
    state.autoSpeed = value.autoSpeed === true;
    state.goals = Object.assign(state.goals, value.goals || {});
    state.profile = Object.assign(state.profile, value.profile || {});
    state.profile.preferredStrengths = Object.assign({}, DEFAULT_STATE.profile.preferredStrengths, state.profile.preferredStrengths || {});
    state.profile.settingChanges = Object.assign({}, state.profile.settingChanges || {});
    state.profile.contentTypes = Object.assign({}, state.profile.contentTypes || {});
    state.profile.days = Object.assign({}, state.profile.days || {});
    state.sessions = Array.isArray(value.sessions) ? value.sessions.slice(-200) : [];
    state.events = Array.isArray(value.events) ? value.events.slice(-500) : [];
    return state;
  }

  function createStore(options) {
    var config = options || {};
    var storage = config.storage || (typeof localStorage !== "undefined" ? localStorage : null);
    var now = config.now || Date.now;
    var stored = null;
    try {
      stored = storage && storage.getItem(STORAGE_KEY) ? JSON.parse(storage.getItem(STORAGE_KEY)) : null;
    } catch (error) {
      if (storage && storage.removeItem) storage.removeItem(STORAGE_KEY);
    }
    var state = normalizeState(stored);

    function persist() {
      if (storage && storage.setItem) storage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    function event(type, data) {
      var safeData = {};
      Object.keys(data || {}).forEach(function (key) {
        var value = data[key];
        if (typeof value === "boolean" || typeof value === "number" || typeof value === "string" && value.length <= 32) safeData[key] = value;
      });
      state.events.push(Object.assign({ type: type, at: new Date(now()).toISOString() }, safeData));
      state.events = state.events.slice(-500);
      persist();
    }
    function recordScroll(sample) {
      var position = numeric(sample && sample.position, 0);
      var at = numeric(sample && sample.at, Date.now());
      var previous = state.events.length ? state.events[state.events.length - 1] : null;
      var delta = previous && previous.type === "scroll" ? position - numeric(previous.position, position) : 0;
      var elapsed = previous && previous.type === "scroll" ? Math.max(1, at - numeric(previous.atMs, at)) : 0;
      var wpm = elapsed ? Math.max(0, numeric(sample && sample.viewportWords, 0) * Math.abs(delta) / elapsed * 60000 / 1000) : 0;
      state.profile.scrollSamples += 1;
      if (wpm > 0) {
        state.profile.speedSamples += 1;
        state.profile.speedTotalWpm += wpm;
      }
      event("scroll", { position: position, atMs: at, delta: delta, wpm: wpm });
    }
    function recordSettingChange(name, value) {
      var key = String(name || "unknown");
      state.profile.settingChanges[key] = numeric(state.profile.settingChanges[key], 0) + 1;
      if (key === "fixation-6-plus") state.profile.preferredStrengths["6-plus"] = numeric(value, 0);
      event("setting", { name: key, value: value === true || value === false ? value : numeric(value, 0) });
    }
    function recordSession(metrics) {
      var data = metrics || {};
      var parts = dateParts(now);
      var words = Math.max(0, Math.round(numeric(data.words, 0)));
      var timeMs = Math.max(0, Math.round(numeric(data.timeMs, 0)));
      var contentType = String(data.contentType || "general");
      state.profile.totalWords += words;
      state.profile.totalTimeMs += timeMs;
      state.profile.regressions += Math.max(0, Math.round(numeric(data.regressions, 0)));
      state.profile.sessions += 1;
      state.profile.days[parts.day] = numeric(state.profile.days[parts.day], 0) + 1;
      state.profile.contentTypes[contentType] = numeric(state.profile.contentTypes[contentType], 0) + words;
      if (numeric(data.wpm, 0) > 0) {
        state.profile.speedSamples += 1;
        state.profile.speedTotalWpm += numeric(data.wpm, 0);
      }
      var rawSettings = data.settings && typeof data.settings === "object" ? data.settings : {};
      var safeSettings = {};
      ["gradient", "complexity", "sentence", "adaptive", "autoSpeed"].forEach(function (key) {
        if (rawSettings[key] !== undefined) safeSettings[key] = rawSettings[key] === true;
      });
      if (rawSettings.adaptiveStrength !== undefined) safeSettings.adaptiveStrength = Math.max(0, Math.min(5, Math.round(numeric(rawSettings.adaptiveStrength, 0))));
      state.sessions.push({ words: words, timeMs: timeMs, wpm: numeric(data.wpm, 0), regressions: numeric(data.regressions, 0), contentType: contentType, at: new Date(now()).toISOString(), hour: parts.hour, weekday: parts.weekday, settings: safeSettings });
      state.sessions = state.sessions.slice(-200);
      event("session", { words: words, timeMs: timeMs, contentType: contentType });
    }
    function getRecommendedSettings() {
      var profile = state.profile;
      var averageWpm = profile.speedSamples ? profile.speedTotalWpm / profile.speedSamples : 0;
      var regressionRate = profile.totalWords ? profile.regressions / profile.totalWords : 0;
      var strong = numeric(profile.preferredStrengths["6-plus"], 3);
      return {
        adaptive: state.enabled,
        adaptiveStrength: Math.max(3, Math.min(5, strong + (regressionRate > 0.002 ? 1 : 0))),
        complexity: regressionRate > 0.002 || (profile.contentTypes.technical || 0) > (profile.contentTypes.narrative || 0),
        speedMode: averageWpm > 350 ? "scan" : averageWpm > 0 && averageWpm < 120 ? "deep" : "steady",
        contentType: Object.keys(profile.contentTypes).sort(function (a, b) { return profile.contentTypes[b] - profile.contentTypes[a]; })[0] || "general",
      };
    }
    function getDashboard() {
      var profile = state.profile;
      var timeOfDay = {};
      var dayOfWeek = {};
      state.sessions.forEach(function (session) {
        timeOfDay[session.hour] = numeric(timeOfDay[session.hour], 0) + 1;
        dayOfWeek[session.weekday] = numeric(dayOfWeek[session.weekday], 0) + 1;
      });
      var days = Object.keys(profile.days).sort();
      var streak = 0;
      var cursor = new Date(now());
      var today = cursor.toISOString().slice(0, 10);
      var yesterday = new Date(cursor.getTime());
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      if (!profile.days[today] && !profile.days[yesterday.toISOString().slice(0, 10)]) {
        cursor = null;
      } else if (!profile.days[today]) {
        cursor = yesterday;
      }
      if (cursor) for (var i = days.length - 1; i >= 0; i--) {
        var expected = cursor.toISOString().slice(0, 10);
        if (days[i] !== expected) break;
        streak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }
      return {
        totalWords: profile.totalWords,
        totalMinutes: Math.round(profile.totalTimeMs / 60000),
        averageWpm: profile.speedSamples ? Math.round(profile.speedTotalWpm / profile.speedSamples) : 0,
        regressions: profile.regressions,
        sessions: profile.sessions,
        streak: streak,
        timeOfDay: timeOfDay,
        dayOfWeek: dayOfWeek,
        contentTypes: Object.assign({}, profile.contentTypes),
        goals: Object.assign({}, state.goals),
        recommended: getRecommendedSettings(),
      };
    }
    function exportJSON() { return JSON.stringify(getDashboard(), null, 2); }
    function exportCSV() {
      var rows = ["date,words,timeMs,wpm,regressions,contentType"];
      state.sessions.forEach(function (session) {
        rows.push([session.at, session.words, session.timeMs, session.wpm, session.regressions, JSON.stringify(session.contentType)].join(","));
      });
      return rows.join("\n");
    }
    function encodePreset(settings) {
      var json = JSON.stringify(settings || {});
      if (typeof btoa === "function") return btoa(unescape(encodeURIComponent(json)));
      return Buffer.from(json, "utf8").toString("base64");
    }
    function decodePreset(code) {
      try {
        var json = typeof atob === "function" ? decodeURIComponent(escape(atob(String(code)))) : Buffer.from(String(code), "base64").toString("utf8");
        var value = JSON.parse(json);
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("bad");
        return value;
      } catch (error) {
        throw new Error("Invalid preset code");
      }
    }
    return {
      getState: function () { return clone(state); },
      setEnabled: function (enabled) { state.enabled = !!enabled; event("adaptive", { enabled: state.enabled }); },
      setAutoSpeed: function (enabled) { state.autoSpeed = !!enabled; event("speed-mode", { enabled: state.autoSpeed }); },
      recordScroll: recordScroll,
      recordSettingChange: recordSettingChange,
      recordSession: recordSession,
      classifyContent: classifyContent,
      getRecommendedSettings: getRecommendedSettings,
      getDashboard: getDashboard,
      exportJSON: exportJSON,
      exportCSV: exportCSV,
      encodePreset: encodePreset,
      decodePreset: decodePreset,
      reset: function () { state = clone(DEFAULT_STATE); persist(); },
    };
  }

  return { DEFAULT_STATE: clone(DEFAULT_STATE), classifyContent: classifyContent, createStore: createStore };
});
