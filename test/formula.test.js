"use strict";
/*
 * NeuroReader — Variable Fixation Formula unit tests.
 *
 * Run with: npm test
 *
 * Why does the test extract and eval the script out of index.html instead of
 * importing a module? Because NeuroReader is deliberately a single HTML file
 * (no build tools, no dependencies — a constitution decision). Eval-ing the
 * inline script means we test the exact code that ships, so the tests can
 * never drift out of sync with the app.
 *
 * 21 assertions covering: every bolding rule, punctuation, spacing/line-break
 * preservation, HTML-injection safety, Unicode, and performance.
 */
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) throw new Error("No <script> block found in index.html");

// Browser stubs so the UI wiring never runs; only the formula is evaluated.
// (The script only touches `window.NeuroReader` and defers `init()`.)
global.window = globalThis;
global.document = { readyState: "loading", addEventListener() {} };
eval(m[1]);

const N = globalThis.NeuroReader;
let passed = 0;
function ok(name, fn) {
  fn();
  passed++;
  console.log("  \u2713 " + name);
}

// Roundtrip helper: strip <b> tags and unescape HTML entities.
function roundtrip(text) {
  return N.transform(text)
    .replace(/<\/?b>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}
function boldedLetters(word) {
  // Count single-char <b>X</b> wrappers (letters are never entity-escaped).
  const matches = N.transform(word).match(/<b>(.)<\/b>/g) || [];
  return matches.length;
}

console.log("NeuroReader formula unit tests\n");

console.log("Exact rules:");
ok("empty string -> empty", () => assert.strictEqual(N.transform(""), ""));
ok("whitespace-only is untouched", () =>
  assert.strictEqual(N.transform("   \n  "), "   \n  "),
);
ok("2 letters -> always exactly 1 bold", () => {
  for (let i = 0; i < 50; i++) assert.strictEqual(boldedLetters("to"), 1);
  assert.strictEqual(boldedLetters("be"), 1);
  assert.strictEqual(boldedLetters("or"), 1);
});
ok("3 letters -> always exactly 2 bold", () => {
  for (let i = 0; i < 50; i++) assert.strictEqual(boldedLetters("the"), 2);
  assert.strictEqual(boldedLetters("fox"), 2);
});
ok("4 letters -> 2 or 3 bold (50-50), both occur", () => {
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(boldedLetters("four"));
  assert.deepStrictEqual([...seen].sort(), [2, 3]);
});
ok("5 letters -> 2, 3, or 4 bold, all occur", () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(boldedLetters("quick"));
  assert.deepStrictEqual([...seen].sort(), [2, 3, 4]);
});
ok("6+ letters -> 3, 4, or 5 bold, all occur", () => {
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(boldedLetters("through"));
  assert.deepStrictEqual([...seen].sort(), [3, 4, 5]);
});
ok(
  "1 letter -> alternates globally: 1st bold, 2nd normal, 3rd bold, 4th normal",
  () => {
    assert.strictEqual(N.transform("a a a a"), "<b>a</b> a <b>a</b> a");
    assert.strictEqual(N.transform("a i a i"), "<b>a</b> i <b>a</b> i");
    assert.strictEqual(N.transform("i a i a"), "<b>i</b> a <b>i</b> a");
  },
);
ok("1-letter rule is a GLOBAL counter across ALL single-letter words", () => {
  // The bolding alternates across every single-letter word regardless of letter.
  assert.strictEqual(N.transform("a i a"), "<b>a</b> i <b>a</b>");
  assert.strictEqual(N.transform("i a i"), "<b>i</b> a <b>i</b>");
  assert.strictEqual(N.transform("A i a"), "<b>A</b> i <b>a</b>");
});
ok("global counter: 1st single letter bold, 2nd normal, 3rd bold", () => {
  assert.strictEqual(N.transform("I am I"), "<b>I</b> <b>a</b>m I");
  assert.strictEqual(N.transform("a b c d"), "<b>a</b> b <b>c</b> d");
});

console.log("Punctuation:");
ok("all punctuation is bolded", () => {
  const out = N.transform('Hello, world! How are you? "Fine," she said.');
  ["<b>,</b>", "<b>!</b>", "<b>?</b>", "<b>&quot;</b>", "<b>.</b>"].forEach(
    (p) => assert.ok(out.includes(p), "missing bolded punct " + p),
  );
});
ok("pure punctuation token is fully bolded", () =>
  assert.strictEqual(
    N.transform("... \u2014 ()"),
    "<b>.</b><b>.</b><b>.</b> <b>\u2014</b> <b>(</b><b>)</b>",
  ),
);
ok("apostrophe is punctuation and gets bolded; don't counts 4 letters", () => {
  const out = N.transform("don't");
  assert.ok(out.includes("<b>&#39;</b>"), "apostrophe not bolded");
  assert.ok(
    [2, 3].includes(boldedLetters("don't")),
    "4 letters -> 2 or 3 bold",
  );
});

console.log("Structure preservation:");
ok("roundtrip: stripping markup returns the exact original", () => {
  const samples = [
    "The quick brown fox jumps over the lazy dog.",
    "one  two\n\nthree",
    "\ttabbed\ttext\nline two",
    "  leading and trailing spaces  ",
    "Numbers 42 and 3.14159 and years 2026.",
    "URL: https://example.com/path?q=1&x=2",
    "caf\u00e9 d\u00e9j\u00e0 vu \u2014 na\u00efve r\u00e9sum\u00e9",
    "Contractions: don't, it's, we're, I'm.",
    'Mixed "quotes" and (parens) and [brackets] and {braces}.',
    "a",
    "a b c",
    "a a a",
    "I",
    "I I I",
    "Hyphen-ated words and -- dashes --- em-dashes",
  ];
  samples.forEach((s) =>
    assert.strictEqual(
      roundtrip(s),
      s,
      "roundtrip failed for: " + JSON.stringify(s),
    ),
  );
});
ok("emoji and symbols are preserved", () => {
  assert.strictEqual(
    roundtrip("Hello \ud83d\udc4b world \ud83c\udf0d"),
    "Hello \ud83d\udc4b world \ud83c\udf0d",
  );
});
ok("newlines and paragraph breaks preserved", () => {
  const out = N.transform("Para one.\n\nPara two.\nLine three.");
  assert.ok(out.includes("\n\n"));
  assert.ok(out.includes("\n"));
});

console.log("Safety:");
ok("HTML injection is neutralized", () => {
  const out = N.transform('<script>alert("x")</script>');
  assert.ok(!out.includes("<script>"), "raw <script> leaked into output");
  assert.ok(out.includes("&lt;"), "< escaped");
  assert.ok(out.includes("&gt;"), "> escaped");
  assert.ok(!/<img/i.test(out), "no foreign tags");
  // The only tags in the output must be our own <b>...</b> pairs.
  assert.ok(
    !out.replace(/<b>|<\/b>/g, "").includes("<"),
    "stray tag left behind",
  );
});
ok("user text with & < > \" ' is escaped in output", () => {
  const out = N.transform("5 < 6 & 7 > 4 \"quoted\" 'single'");
  assert.ok(out.includes("&lt;"));
  assert.ok(out.includes("&amp;"));
  assert.ok(out.includes("&gt;"));
  assert.ok(out.includes("&quot;"));
});

console.log("Performance:");
{
  const sample =
    "The quick brown fox jumps over the lazy dog near the river bank while the sun sets slowly behind the hills";
  const parts = sample.split(" ");
  const words = [];
  for (let i = 0; i < 10000; i++) words.push(parts[i % parts.length]);
  const longText = words.join(" ") + ".";
  const t0 = process.hrtime.bigint();
  const out = N.transform(longText);
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  console.log("  10,000 words transformed in " + ms.toFixed(2) + "ms");
  ok("10k words: no crash, output non-empty", () =>
    assert.ok(out.length > 1000),
  );
  ok("10k words: roundtrip exact", () =>
    assert.strictEqual(roundtrip(longText), longText),
  );
  ok("1000 words transforms in < 100ms", () =>
    assert.ok(ms / 10 < 100, "too slow: " + ms + "ms for 10k"),
  );
}
{
  const words = [];
  for (let i = 0; i < 1000; i++) words.push("word");
  const t0 = process.hrtime.bigint();
  N.transform(words.join(" "));
  const t1 = process.hrtime.bigint();
  const ms = Number(t1 - t0) / 1e6;
  ok("1000 words < 100ms (" + ms.toFixed(2) + "ms)", () => assert.ok(ms < 100));
}

console.log("\n" + passed + " assertions passed.");
