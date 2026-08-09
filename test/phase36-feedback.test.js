"use strict";
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const files = ["chrome", "firefox", "safari"];
const html = files.map((browser) => fs.readFileSync(path.join(root, "extensions", browser, "popup.html"), "utf8"));
const js = files.map((browser) => fs.readFileSync(path.join(root, "extensions", browser, "popup.js"), "utf8"));
const css = files.map((browser) => fs.readFileSync(path.join(root, "extensions", browser, "styles.css"), "utf8"));

for (let i = 0; i < files.length; i++) {
  assert.match(html[i], /id="nr-feedback"/);
  assert.match(html[i], /id="nr-feedback-open"/);
  assert.match(html[i], /without including page text/);
  assert.match(js[i], /function openFeedbackDraft\(\)/);
  assert.match(js[i], /github\.com\/mrfentmen\/neuroreader\/issues\/new/);
  assert.match(js[i], /page text, private URLs, names, account details/);
  assert.doesNotMatch(js[i], /encodeURIComponent\(body\)/);
  assert.match(js[i], /navigator\.clipboard\.writeText\(body\)/);
  assert.match(html[i], /maxlength="2000"/);
  assert.match(css[i], /#nr-feedback/);
}
assert.strictEqual(js[0], js[1], "Chrome and Firefox feedback logic stays identical");
assert.strictEqual(js[1], js[2], "Firefox and Safari feedback logic stays identical");
assert.strictEqual(html[0], html[1], "Chrome and Firefox feedback markup stays identical");
assert.strictEqual(html[1], html[2], "Firefox and Safari feedback markup stays identical");
assert.strictEqual(css[0], css[1], "Chrome and Firefox feedback styling stays identical");
assert.strictEqual(css[1], css[2], "Firefox and Safari feedback styling stays identical");for (const source of js) {
  assert.doesNotMatch(source, /document\.body\.innerText|document\.body\.textContent|location\.href/);
  assert.match(source, /tabs\.create\(\{ url: issueUrl \}\)/);
}
console.log("Phase 36 feedback privacy tests passed.");
