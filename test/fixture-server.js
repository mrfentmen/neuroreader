"use strict";

const { spawn } = require("child_process");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

async function waitForServer(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch("http://127.0.0.1:" + port + "/index.html");
      if (response.ok) {
        await response.arrayBuffer();
        return true;
      }
    } catch (error) {
      // The child process may still be starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function startFixtureServer(port) {
  const existing = await fetch("http://127.0.0.1:" + port + "/index.html").then(
    async (response) => {
      if (!response.ok) return false;
      await response.arrayBuffer();
      return true;
    },
    () => false,
  );
  if (existing) return { close: async () => {} };

  const server = spawn("python3", ["-m", "http.server", String(port), "--bind", "127.0.0.1"], {
    cwd: ROOT,
    stdio: "ignore",
  });
  server.on("error", () => {});
  if (!(await waitForServer(port, 15000))) {
    server.kill();
    throw new Error("fixture server did not become ready on :" + port);
  }
  return {
    close: async () => {
      if (!server.killed) server.kill();
    },
  };
}

module.exports = { startFixtureServer };
