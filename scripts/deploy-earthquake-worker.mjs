import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";

const WRANGLER_VERSION = "4.95.0";
const WORKER_CONFIG = "workers/earthquake-realtime/wrangler.toml";

runWrangler([
  "deploy",
  "--config",
  WORKER_CONFIG
]);

// `versions upload/deploy` does not apply Cron changes. Reapplying triggers
// here is intentionally defensive so every supported deployment path finishes
// with the schedules declared in wrangler.toml.
runWrangler([
  "triggers",
  "deploy",
  "--config",
  WORKER_CONFIG
]);

runWrangler([
  "deployments",
  "status",
  "--config",
  WORKER_CONFIG
]);

function runWrangler(args) {
  const npxArgs = ["--yes", `wrangler@${WRANGLER_VERSION}`, ...args];
  const invocation = resolveNpxInvocation(npxArgs);
  const result = spawnSync(
    invocation.command,
    invocation.args,
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit",
      shell: false
    }
  );

  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function resolveNpxInvocation(npxArgs) {
  if (process.platform !== "win32") {
    return { command: "npx", args: npxArgs };
  }

  const npmExecutable = process.env.npm_execpath;
  if (!npmExecutable) {
    throw new Error("npm_execpath is unavailable; run this script through npm.");
  }

  return {
    command: process.execPath,
    args: [path.join(path.dirname(npmExecutable), "npx-cli.js"), ...npxArgs]
  };
}
