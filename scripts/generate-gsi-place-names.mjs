import fs from "node:fs";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const inputPath = process.argv[2];
const outputPath = process.argv[3] ?? "public/data/gsi-place-names-romaji.json";
if (!inputPath) {
  throw new Error("Usage: node scripts/generate-gsi-place-names.mjs <gazetteer.pdf> [output.json]");
}

const data = new Uint8Array(fs.readFileSync(inputPath));
const document = await pdfjs.getDocument({ data, disableWorker: true }).promise;
const names = {};

for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
  const page = await document.getPage(pageNumber);
  const content = await page.getTextContent();
  const rows = groupItemsByRow(content.items);
  rows.forEach((row) => {
    const japanese = row
      .filter((item) => item.x >= 95 && item.x < 225)
      .map((item) => item.text)
      .join("")
      .trim();
    const romanized = row
      .filter((item) => item.x >= 425 && item.x < 620)
      .map((item) => item.text)
      .join(" ")
      .replace(/\s+/gu, " ")
      .trim();
    if (!japanese || !romanized || japanese === "Japanese(Kanji)" || romanized === "Romanized Japanese") return;
    if (!/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(japanese)) return;
    if (!/^[A-Za-z0-9().,'’\-\s]+$/u.test(romanized)) return;
    names[japanese] = romanized;
  });
}

const payload = {
  source: "Geospatial Information Authority of Japan, Gazetteer of Japan 2021",
  sourceUrl: "https://www.gsi.go.jp/kihonjohochousa/gazetteer.html",
  generatedAt: new Date().toISOString(),
  names
};

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(payload)}\n`, "utf8");
console.log(`Wrote ${Object.keys(names).length} place names to ${outputPath}`);

function groupItemsByRow(items) {
  const rows = new Map();
  items.forEach((item) => {
    const text = String(item.str ?? "").trim();
    if (!text) return;
    const y = Math.round(Number(item.transform?.[5] ?? 0) * 2) / 2;
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y).push({
      x: Number(item.transform?.[4] ?? 0),
      text
    });
  });
  return [...rows.values()].map((row) => row.sort((left, right) => left.x - right.x));
}
