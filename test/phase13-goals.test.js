"use strict";

const assert = require("assert");
const adaptive = require("../adaptive.js");

function memory() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
  };
}

let now = new Date("2026-08-08T10:00:00Z").getTime();
const storage = memory();
const store = adaptive.createStore({ storage, now: () => now });

assert.deepStrictEqual(store.getDashboard().goals, { dailyWords: 5000, weeklyDays: 5 });
assert.strictEqual(store.getGoalProgress().dailyWords, 0);
assert.strictEqual(store.getGoalProgress().weeklyDays, 0);

store.setGoals({ dailyWords: 1200, weeklyDays: 3 });
assert.deepStrictEqual(store.getDashboard().goals, { dailyWords: 1200, weeklyDays: 3 });
store.recordSession({ words: 700, timeMs: 60000, contentType: "general" });
assert.strictEqual(store.getGoalProgress().dailyWords, 700);
assert.strictEqual(store.getGoalProgress().dailyPercent, 58);
assert.strictEqual(store.getGoalProgress().dailyMet, false);

store.recordSession({ words: 500, timeMs: 60000, contentType: "general" });
assert.strictEqual(store.getGoalProgress().dailyMet, true);
assert.strictEqual(store.getGoalProgress().dailyPercent, 100);
assert.strictEqual(store.getGoalProgress().weeklyDays, 1);

now = new Date("2026-08-07T10:00:00Z").getTime();
store.recordSession({ words: 100, timeMs: 60000, contentType: "general" });
now = new Date("2026-08-06T10:00:00Z").getTime();
store.recordSession({ words: 100, timeMs: 60000, contentType: "general" });
now = new Date("2026-08-08T10:00:00Z").getTime();
assert.strictEqual(store.getGoalProgress().weeklyDays, 3);
assert.strictEqual(store.getGoalProgress().weeklyMet, true);
store.recordSession({ words: 0, timeMs: 0, contentType: "general" });
assert.strictEqual(store.getGoalProgress().weeklyDays, 3);

store.setGoals({ dailyWords: -5, weeklyDays: 99 });
assert.deepStrictEqual(store.getDashboard().goals, { dailyWords: 100, weeklyDays: 7 });
const reloaded = adaptive.createStore({ storage, now: () => now });
assert.deepStrictEqual(reloaded.getDashboard().goals, { dailyWords: 100, weeklyDays: 7 });
const legacyStorage = memory();
legacyStorage.setItem("neuroreader-adaptive-v1", JSON.stringify({
  profile: { totalWords: 4, totalTimeMs: 1, regressions: 0, sessions: 1, days: { "2026-08-08": 1 }, contentTypes: {}, preferredStrengths: {}, settingChanges: {}, scrollSamples: 0, speedSamples: 0, speedTotalWpm: 0 },
  sessions: [{ words: 450, timeMs: 60000, at: "2026-08-08T10:00:00", contentType: "general" }],
  events: [], goals: { dailyWords: 500, weeklyDays: 1 },
}));
const migrated = adaptive.createStore({ storage: legacyStorage, now: () => now });
assert.strictEqual(migrated.getGoalProgress().dailyWords, 450);
reloaded.reset();
assert.deepStrictEqual(reloaded.getDashboard().goals, { dailyWords: 5000, weeklyDays: 5 });
assert.strictEqual(reloaded.getGoalProgress().dailyWords, 0);
console.log("Phase 13 goal tests passed.");
