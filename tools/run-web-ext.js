"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "neuroreader-web-ext-"));
const vendorImageSize = path.join(root, "vendor", "image-size");
const packageJson = {
  name: "neuroreader-web-ext-runner",
  private: true,
  devDependencies: { "web-ext": "10.6.0" },
  overrides: { "addons-linter": { "image-size": `file:${vendorImageSize}` } },
};
let exitCode = 1;

try {
  fs.writeFileSync(path.join(temp, "package.json"), JSON.stringify(packageJson, null, 2) + "\n");
  const install = spawnSync("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--install-links=true"], {
    cwd: temp,
    stdio: "inherit",
  });
  if (install.status !== 0) {
    exitCode = install.status || 1;
  } else {
    const linterPath = require.resolve("addons-linter", { paths: [path.join(temp, "node_modules", "web-ext")] });
    const resolvedImageSize = require.resolve("image-size", { paths: [path.dirname(linterPath)] });
    const resolvedPackage = JSON.parse(fs.readFileSync(path.join(path.dirname(resolvedImageSize), "package.json"), "utf8"));
    const patchedPackage = JSON.parse(fs.readFileSync(path.join(vendorImageSize, "package.json"), "utf8"));
    if (resolvedPackage.version !== patchedPackage.version || resolvedPackage.main !== patchedPackage.main) {
      throw new Error(`web-ext resolved unexpected image-size metadata: ${resolvedImageSize}`);
    }

    const executable = path.join(temp, "node_modules", "web-ext", "bin", "web-ext.js");
    const result = spawnSync(process.execPath, [executable, ...args], {
      cwd: root,
      stdio: "inherit",
      env: Object.assign({}, process.env, { npm_config_audit: "false", npm_config_fund: "false" }),
    });
    exitCode = typeof result.status === "number" ? result.status : 1;
  }
} catch (error) {
  console.error(error.message || error);
  exitCode = 1;
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

process.exitCode = exitCode;
