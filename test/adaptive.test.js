"use strict";

const assert = require("assert");
const adaptive = require("../adaptive.js");

function makeMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => data.has(key) ? data.get(key) : null,
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
  };
}

const storage = makeMemoryStorage();
const store = adaptive.createStore({ storage, now: () => new Date("2026-08-08T10:00:00Z") });

assert.strictEqual(store.getState().enabled, false);
assert.deepStrictEqual(store.classifyContent("for (let index = 0; index < 10; index++) { return value; }", { monospace: true }).type, "code");
assert.strictEqual(store.classifyContent("The algorithm computes a variable fixation formula from long compound words.").type, "technical");
assert.strictEqual(store.classifyContent('"Hello," she said. "Are you coming?" He smiled.').type, "narrative");
assert.strictEqual(store.classifyContent("Open the file. Press Enter. Select the option.").type, "instructions");

store.setEnabled(true);
store.recordSettingChange("fixation-6-plus", 5);
store.recordScroll({ position: 100, at: 1000, viewportWords: 90 });
store.recordScroll({ position: 300, at: 3000, viewportWords: 90 });
store.recordScroll({ position: 180, at: 4000, viewportWords: 90 });
store.recordSession({ words: 1200, timeMs: 600000, wpm: 120, regressions: 3, contentType: "technical", settings: { gradient: true } });
store.recordSession({ words: 800, timeMs: 400000, wpm: 120, regressions: 0, contentType: "narrative", settings: {} });

const state = store.getState();
assert.strictEqual(state.enabled, true);
assert.strictEqual(state.profile.totalWords, 2000);
assert.strictEqual(state.profile.regressions, 3);
assert.strictEqual(state.profile.preferredStrengths["6-plus"], 5);
assert.ok(state.profile.scrollSamples >= 3);
assert.ok(store.getRecommendedSettings().complexity);
assert.ok(store.getRecommendedSettings().adaptiveStrength >= 4);

const dashboard = store.getDashboard();
assert.strictEqual(dashboard.totalWords, 2000);
assert.strictEqual(dashboard.totalMinutes, 17);
assert.ok(dashboard.averageWpm > 120);
assert.strictEqual(dashboard.contentTypes.technical, 1200);
assert.strictEqual(dashboard.sessions, 2);
assert.strictEqual(dashboard.streak, 1);
assert.ok(Object.keys(dashboard.timeOfDay).length >= 1);
assert.ok(Object.keys(dashboard.dayOfWeek).length >= 1);
assert.ok(store.exportJSON().includes('"totalWords": 2000'));
assert.ok(store.exportCSV().split("\n").length >= 3);

const code = store.encodePreset({ gradient: true, complexity: true, adaptive: true });
assert.deepStrictEqual(store.decodePreset(code), { gradient: true, complexity: true, adaptive: true });
assert.throws(() => store.decodePreset("not-a-preset"), /Invalid preset/);

store.reset();
assert.strictEqual(store.getState().profile.totalWords, 0);
assert.strictEqual(store.getDashboard().sessions, 0);
console.log("Adaptive foundation tests passed.");
