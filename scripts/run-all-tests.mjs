import { readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const tests = (await readdir(new URL("../Tests/", import.meta.url)))
  .filter((name) => name.endsWith("Tests.mjs")).sort();
const failed = [];
// One isolated process per suite keeps DOM mocks and fake clocks independent.
// No application servers, benchmark scripts or production jobs are started.
for (const name of tests) {
  const result = await new Promise((resolve) => {
    const child = spawn(process.execPath, [`Tests/${name}`], {
      cwd: root, stdio: ["ignore", "pipe", "pipe"], windowsHide: true
    });
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; });
    child.stderr.on("data", (chunk) => { output += chunk; });
    const timer = setTimeout(() => child.kill(), 120_000);
    child.on("error", (error) => { output += error.message; });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
  console.log(`${result.code === 0 ? "PASS" : "FAIL"} ${name}`);
  if (result.code !== 0) {
    failed.push(name);
    console.error(result.output);
  }
}
console.log(`Suites: ${tests.length - failed.length} passed, ${failed.length} failed, ${tests.length} total`);
if (failed.length) process.exitCode = 1;
