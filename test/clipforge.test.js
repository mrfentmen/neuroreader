"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { execFileSync } = require("child_process");

const root = path.join(__dirname, "..");
const repositoryExtension = path.join(root, "extensions", "video-compressor");
const extension = repositoryExtension;
const manifest = JSON.parse(fs.readFileSync(path.join(extension, "manifest.json"), "utf8"));
assert.strictEqual(manifest.manifest_version, 3);
assert.deepStrictEqual(manifest.permissions, ["storage"]);
assert(!manifest.host_permissions);
assert(!manifest.content_scripts);
assert.strictEqual(manifest.action.default_popup, "app.html");
assert(!manifest.icons, "source manifest gets icons during packaging");
assert.match(manifest.description, /privately/i);

const context = { console, globalThis: {} };
vm.runInNewContext(fs.readFileSync(path.join(extension, "app.js"), "utf8"), context);
const utils = context.globalThis.ClipForgeUtils;
assert(utils);
assert.strictEqual(utils.validVideoFile({ name: "clip.mp4", type: "" }), true);
assert.strictEqual(utils.validVideoFile({ name: "notes.txt", type: "text/plain" }), false);
assert.strictEqual(utils.validVideoFile({ name: "clip", type: "video/webm" }), true);
assert.strictEqual(utils.MAX_FILE_SIZE, 2 * 1024 * 1024 * 1024);
assert.deepStrictEqual(JSON.parse(JSON.stringify(utils.outputDimensions(1920, 1080, "720"))), { width: 1280, height: 720 });
assert.deepStrictEqual(JSON.parse(JSON.stringify(utils.outputDimensions(640, 360, "720"))), { width: 640, height: 360 });
assert.strictEqual(utils.fileStem("My clip?.mp4"), "My clip");
assert.strictEqual(utils.formatDuration(74), "1:14");
assert.strictEqual(utils.chooseMimeType, utils.chooseMimeType);

const source = fs.readFileSync(path.join(extension, "app.js"), "utf8");
assert(!/fetch\s*\(/.test(source));
assert(!/XMLHttpRequest/.test(source));
assert.match(source, /MediaRecorder/);
assert.match(source, /captureStream/);
const html = fs.readFileSync(path.join(extension, "app.html"), "utf8");
assert.match(html, /buymeacoffee\.com\/contactae2b/);
assert(fs.existsSync(path.join(extension, "branding", "clipforge-icon.svg")));
assert(fs.existsSync(path.join(extension, "privacy.html")));
assert.match(fs.readFileSync(path.join(root, "CLIPFORGE-RELEASE.md"), "utf8"), /Chrome Web Store/);
assert.strictEqual((html.match(/class="ad-slot/g) || []).length, 2);
assert.match(html, /class="ad-slot top-ad-slot"/);
assert.match(html, /aria-label="Top advertisement space"/);
assert.strictEqual(manifest.action.default_popup, "app.html");
const packageCheck = fs.mkdtempSync(path.join(root, ".clipforge-banner-test-"));
try {
  execFileSync(process.execPath, [path.join(root, "tools/package-clipforge.js"), "--version", "0.1.0", "--out", packageCheck], { cwd: root, env: Object.assign({}, process.env, { CLIPFORGE_EXTENSION_DIR: extension }), stdio: "ignore" });
  const packagedHtml = execFileSync("unzip", ["-p", path.join(packageCheck, "clipforge-chrome-v0.1.0.zip"), "app.html"], { encoding: "utf8" });
  assert.strictEqual((packagedHtml.match(/class="ad-slot/g) || []).length, 2);
} finally {
  fs.rmSync(packageCheck, { recursive: true, force: true });
}
console.log("ClipForge unit tests passed.");
