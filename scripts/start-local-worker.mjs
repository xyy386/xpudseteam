import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { projectRoot, readLocalDataDir } from "./local-data-location.mjs";

const wrangler = fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url));
const setup = fileURLToPath(new URL("./sites-env.mjs", import.meta.url));
const child = spawn(process.execPath, [
  "--import", setup, wrangler, "dev", "--config", "dist/server/wrangler.json",
  "--local", "--persist-to", readLocalDataDir(), "--ip", "127.0.0.1", "--inspector-port", "0",
], { cwd: projectRoot, stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
