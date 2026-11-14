import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { HAZARD_CATEGORIES, HAZARD_DIRECTORY_SOURCE, parseHazardCsv, buildHazardDirectory } from "../src/domain/municipalHazardMaps.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const cache = resolve(root, ".cache/municipal-hazard-maps");
const output = resolve(root, "public/data/municipal-hazard-maps");
await mkdir(cache, { recursive: true });
const offline = process.argv.includes("--cached");
async function sourceFile(name, url) {
  const path = resolve(cache, name);
  if (offline) return readFile(path);
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`GSI source failed: ${response.status} ${url}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(path, bytes);
  return bytes;
}
const html = (await sourceFile("opendata.html", HAZARD_DIRECTORY_SOURCE)).toString("utf8");
const rows = {}, updates = {};
// Sequential requests only: this is a manual directory update, never an app poll.
for (const category of HAZARD_CATEGORIES) {
  const bytes = await sourceFile(`${category.id}.csv`, `https://disaportaldata.gsi.go.jp/hazardmap/uty/${category.csv}`);
  rows[category.id] = parseHazardCsv(new TextDecoder("shift_jis", { fatal: true }).decode(bytes));
  const path = category.csv.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const match = html.match(new RegExp(`<tr>\\s*<td>[^<]+</td>\\s*<td>(\\d{4})年(\\d{1,2})月(\\d{1,2})日</td>\\s*<td><a href="\\.\\./uty/${path}"`, "u"));
  if (!match) throw new Error(`GSI update date not found: ${category.id}`);
  updates[category.id] = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}
const prefectures = buildHazardDirectory(rows);
if (prefectures.length !== 47) throw new Error("Expected all 47 prefectures");
// Validate every source before replacing published data. Keep a versioned path
// so a cached index cannot mix municipality records from another update.
const { createHash } = await import("node:crypto");
const version = createHash("sha256").update(JSON.stringify({ prefectures, updates })).digest("hex").slice(0, 12);
const versionDir = resolve(output, version);
await mkdir(versionDir, { recursive: true });
for (const prefecture of prefectures) await writeFile(resolve(versionDir, `${prefecture.code}.json`), JSON.stringify(prefecture));
const index = {
  schemaVersion: 1, version, source: HAZARD_DIRECTORY_SOURCE,
  categories: HAZARD_CATEGORIES.map(({ id, label }) => ({ id, label, updatedAt: updates[id] })),
  prefectures: prefectures.map(({ code, name }) => ({ code, name }))
};
await writeFile(resolve(output, "index.json.tmp"), JSON.stringify(index));
await rename(resolve(output, "index.json.tmp"), resolve(output, "index.json"));
console.log(`GSI directory: ${prefectures.length} prefectures, ${prefectures.reduce((sum, pref) => sum + pref.municipalities.length, 0)} municipalities; version ${version}`);
