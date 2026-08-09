/* NeuroReader Phase 4 local reading progress.
 * Stores aggregate counts only: no words, URLs, or page contents.
 */
(function (root) {
  "use strict";
  var isPromiseApi = typeof browser !== "undefined" && !!browser.storage;
  var api = isPromiseApi ? browser : chrome;
  var KEY = "nrExtensionStats";
  var DEFAULTS = { totalWords: 0, totalSessions: 0, lastSessionAt: "", days: [] };

  function normalize(value) {
    var input = value || {};
    var days = Array.isArray(input.days) ? input.days : [];
    return {
      totalWords: Math.max(0, Number(input.totalWords) || 0),
      totalSessions: Math.max(0, Number(input.totalSessions) || 0),
      lastSessionAt: typeof input.lastSessionAt === "string" ? input.lastSessionAt : "",
      days: days.filter(function (day) {
        return day && /^\d{4}-\d{2}-\d{2}$/.test(day.date);
      }).slice(-14).map(function (day) {
        return { date: day.date, words: Math.max(0, Number(day.words) || 0), sessions: Math.max(0, Number(day.sessions) || 0) };
      }),
    };
  }
  function get(callback) {
    var done = typeof callback === "function" ? callback : function () {};
    if (isPromiseApi) {
      api.storage.local.get({ [KEY]: DEFAULTS }).then(function (data) { done(normalize(data[KEY])); }, function () { done(normalize(DEFAULTS)); });
    } else {
      api.storage.local.get({ [KEY]: DEFAULTS }, function (data) { done(normalize(data[KEY])); });
    }
  }
  function save(value, callback) {
    var state = normalize(value);
    if (isPromiseApi) {
      api.storage.local.set({ [KEY]: state }).then(function () { if (callback) callback(state); }, function () { if (callback) callback(state); });
    } else {
      api.storage.local.set({ [KEY]: state }, function () { if (callback) callback(state); });
    }
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function recordSession(words, callback) {
    var count = Math.max(0, Math.round(Number(words) || 0));
    if (!count) { get(callback || function () {}); return; }
    get(function (state) {
      var date = today();
      var day = state.days.length && state.days[state.days.length - 1].date === date
        ? state.days[state.days.length - 1]
        : { date: date, words: 0, sessions: 0 };
      if (!state.days.length || state.days[state.days.length - 1].date !== date) state.days.push(day);
      day.words += count;
      day.sessions += 1;
      state.totalWords += count;
      state.totalSessions += 1;
      state.lastSessionAt = new Date().toISOString();
      state.days = state.days.slice(-14);
      save(state, callback);
    });
  }
  function reset(callback) {
    save(DEFAULTS, function (state) {
      if (isPromiseApi) {
        api.storage.local.remove("nrReadingTotals").then(function () { if (callback) callback(state); }, function () { if (callback) callback(state); });
      } else {
        api.storage.local.remove("nrReadingTotals", function () { if (callback) callback(state); });
      }
    });
  }
  root.NeuroReaderStats = { KEY: KEY, DEFAULTS: DEFAULTS, normalize: normalize, get: get, recordSession: recordSession, reset: reset, today: today };
})(window);
