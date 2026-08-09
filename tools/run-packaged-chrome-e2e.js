"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.join(__dirname, "..");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "extensions", "chrome", "manifest.json"), "utf8"));
const version = manifest.version;
const output = path.join(root, ".package-e2e-temp");
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
try {
  const packaged = spawnSync(process.execPath, ["tools/package-chrome.js", "--version", version, "--out", output], {
    cwd: root,
    encoding: "utf8",
  });
  if (packaged.status !== 0) {
    process.stderr.write(packaged.stderr || packaged.stdout || "Chrome packaging failed\n");
    process.exit(packaged.status || 1);
  }
  const extensionDir = path.join(output, `neuroreader-chrome-v${version}`);
  const result = spawnSync(process.execPath, ["test/extension.e2e.js"], {
    cwd: root,
    env: Object.assign({}, process.env, { NR_EXTENSION_DIR: extensionDir }),
    stdio: "inherit",
  });
  process.exitCode = result.status === null ? 1 : result.status;
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
