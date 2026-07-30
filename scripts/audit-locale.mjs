import { readFile } from "node:fs/promises";
import { localizeText } from "../src/ui/locale.js";

const sources = process.argv.slice(2);
const targets = sources.length ? sources : ["index.html"];
const unresolved = new Map();

for (const target of targets) {
  const source = await readFile(target, "utf8");
  const isMarkup = /\.(?:html?|svg)$/iu.test(target);
  const candidates = isMarkup ? extractMarkupText(source) : extractScriptText(source);
  for (const match of candidates) {
    const text = String(match[1] ?? "").replace(/\s+/gu, " ").trim();
    if (text.includes("${") || text.startsWith("}") || /^(?:disabled\s+)?(?:title|aria-label)=/u.test(text)) continue;
    if (!text || !/[ぁ-んァ-ヶ一-龯]/u.test(text)) continue;
    if (localizeText(text, "en") !== text) continue;
    const list = unresolved.get(text) ?? [];
    list.push(target);
    unresolved.set(text, list);
  }
}

for (const [text, files] of [...unresolved].sort(([a], [b]) => a.localeCompare(b, "ja"))) {
  console.log(`${text}\t${[...new Set(files)].join(",")}`);
}

if (unresolved.size) {
  console.error(`Untranslated static strings: ${unresolved.size}`);
  process.exitCode = 1;
}

function extractMarkupText(source) {
  return [
    ...source.matchAll(/>([^<>]+)</gu),
    ...source.matchAll(/\b(?:aria-label|title|placeholder|alt)="([^"]+)"/gu)
  ];
}

function extractScriptText(source) {
  const candidates = [];
  const stringPattern = /"(?:\\.|[^"\\\r\n])*"|'(?:\\.|[^'\\\r\n])*'|`(?:\\.|[^`\\\r\n])*`/gu;
  for (const match of source.matchAll(stringPattern)) {
    const value = match[0].slice(1, -1);
    if (!value.includes("<")) {
      candidates.push([match[0], value]);
      continue;
    }
    candidates.push(...extractMarkupText(value));
  }
  return candidates;
}
