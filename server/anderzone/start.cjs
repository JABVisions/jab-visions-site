const { register, stripTypeScriptTypes } = require("node:module");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const quiet = "--disable-warning=ExperimentalWarning";
if (!process.execArgv.includes(quiet)) {
  const { spawn } = require("node:child_process");
  const child = spawn(process.execPath, [quiet, ...process.execArgv, __filename], {
    stdio: "inherit",
    env: process.env,
  });
  child.on("exit", (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    else process.exit(code ?? 1);
  });
  return;
}

if (typeof stripTypeScriptTypes !== "function") {
  console.error(
    "ANDERZONE room needs Node.js 22.6 or newer. It runs the TypeScript sources with Node's built-in type stripper, so a production install does not need the typescript package."
  );
  process.exit(1);
}

register(pathToFileURL(path.join(__dirname, "ts-hooks.mjs")).href);

import(pathToFileURL(path.join(__dirname, "listen.ts")).href).catch((error) => {
  console.error(error);
  process.exit(1);
});
