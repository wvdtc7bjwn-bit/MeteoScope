import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// Read the import-only CSS entry point in cascade order for style contract tests.
export async function readStylesheet(file) {
  const url = file instanceof URL ? file : pathToFileURL(file);
  const source = await readFile(url, "utf8");
  const pattern = /^@import "(\.\/[^"\n]+)";[ \t]*$/gm;
  const imports = [...source.matchAll(pattern)];
  if (!imports.length) return source;
  if (source.replace(pattern, "").trim()) throw new Error("Expected an import-only stylesheet entry");
  return (await Promise.all(imports.map((match) => readStylesheet(new URL(match[1], url))))).join("");
}
