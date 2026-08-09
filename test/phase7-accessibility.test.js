"use strict";
const assert = require("assert");
const fs = require("fs");

const index = fs.readFileSync("index.html", "utf8");
const privacy = fs.readFileSync("privacy.html", "utf8");
const accessibility = fs.readFileSync("accessibility.html", "utf8");

assert.match(index, /<html lang="en">/);
assert.match(index, /href="#main-content"/);
assert.match(index, /<main id="main-content" tabindex="-1">/);
assert.match(index, /href="accessibility\.html">Accessibility<\/a>/);
assert.match(index, /prefers-reduced-motion/);
assert.match(index, /:focus-visible/);
assert.match(index, /role="status"/);
assert.match(index, /aria-live="polite"/);

assert.match(privacy, /<html lang="en">/);
assert.match(privacy, /href="#main-content"/);
assert.match(privacy, /<main id="main-content"[^>]*tabindex="-1"/);
assert.match(privacy, /href="accessibility\.html">Accessibility<\/a>/);
assert.match(privacy, /prefers-reduced-motion/);
assert.match(privacy, /local storage/);
assert.match(privacy, /Buy Me a Coffee/);
assert.match(privacy, /requestAnimationFrame/);

assert.match(accessibility, /<html lang="en">/);
assert.match(accessibility, /Skip to accessibility statement/);
assert.match(accessibility, /<main id="main-content" tabindex="-1">/);
assert.match(accessibility, /WCAG 2\.2 AA/);
assert.match(accessibility, /Known limitations/);
assert.match(accessibility, /GitHub repository/);
assert.match(accessibility, /Do\s+not include private reading material/);
assert.match(accessibility, /prefers-reduced-motion/);
assert.match(accessibility, /:focus-visible/);

assert.ok(!/TODO|FIXME|TBD|placeholder/i.test(accessibility), "statement has no placeholder language");
console.log("Phase 7 accessibility statement tests passed.");
