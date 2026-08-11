"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const repositoryVault = path.join(root, "extensions", "image-vault");
const vault = repositoryVault;
const manifest = JSON.parse(fs.readFileSync(path.join(vault, "manifest.json"), "utf8"));
assert.strictEqual(manifest.manifest_version, 3);
assert(!manifest.permissions);
assert(!manifest.host_permissions);
assert(!manifest.content_scripts);
assert.strictEqual(manifest.action.default_popup, "app.html");
assert(!manifest.background);
const source = fs.readFileSync(path.join(vault, "app.js"), "utf8");
assert.match(source, /PBKDF2/);
assert.match(source, /AES-GCM/);
assert.match(source, /crypto\.getRandomValues/);
assert.match(source, /indexedDB/);
assert(!/fetch\s*\(/.test(source));
assert(!/XMLHttpRequest/.test(source));
assert(!/innerHTML/.test(source));
const html = fs.readFileSync(path.join(vault, "app.html"), "utf8");
assert.match(html, /Private image vault/);
assert.match(html, /There is no recovery service/);
assert.match(html, /They never leave Chrome/);
assert.strictEqual((html.match(/class="ad-slot/g) || []).length, 2);
assert.match(html, /class="ad-slot top-ad-slot"/);
assert.match(html, /class="ad-slot bottom-ad-slot"/);
assert(fs.existsSync(path.join(vault, "privacy.html")));
const packageCheck = fs.mkdtempSync(path.join(root, ".lockbox-banner-test-"));
try {
  execFileSync(process.execPath, [path.join(root, "tools/package-image-vault.js"), "--version", "0.1.0", "--out", packageCheck], { cwd: root, env: Object.assign({}, process.env, { IMAGE_VAULT_EXTENSION_DIR: vault }), stdio: "ignore" });
  const packagedHtml = execFileSync("unzip", ["-p", path.join(packageCheck, "clipforge-lockbox-chrome-v0.1.0.zip"), "app.html"], { encoding: "utf8" });
  assert.strictEqual((packagedHtml.match(/class="ad-slot/g) || []).length, 2);
} finally {
  fs.rmSync(packageCheck, { recursive: true, force: true });
}
console.log("Image vault security tests passed.");
