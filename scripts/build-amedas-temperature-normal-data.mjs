import AdmZip from "adm-zip";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildAmedasTemperatureNormalData } from "./lib/amedasTemperatureNormals.mjs";

const SOURCE_URL = "https://www.data.jma.go.jp/stats/data/mdrr/normal/2020/data/normal_amedas_daily.zip";
const OUTPUT_PATH = resolve("public/data/amedas-daily-high-low-temperature-normals-1991-2020.json");
const sourceIndex = process.argv.indexOf("--source");
let bytes;
if (sourceIndex >= 0) {
  if (!process.argv[sourceIndex + 1]) throw new Error("--source requires a ZIP path");
  bytes = await readFile(resolve(process.argv[sourceIndex + 1]));
} else {
  const response = await fetch(SOURCE_URL, { headers: { Accept: "application/zip" } });
  if (!response.ok) throw new Error(`Could not download AMeDAS normal data: ${response.status}`);
  bytes = Buffer.from(await response.arrayBuffer());
}
const zip = new AdmZip(bytes);
const data = buildAmedasTemperatureNormalData(zip.getEntries().filter(entry => !entry.isDirectory && entry.entryName.endsWith(".csv"))
  .map(entry => ({ text: zip.readAsText(entry) })));

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(data)}\n`);
console.log(`Wrote ${Object.keys(data.stations).length} quality-checked AMeDAS daily high/low temperature normal records to ${OUTPUT_PATH}`);
