import { mkdir, readFile, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { parseCmtArchive } from "../src/earthquake/focalMechanismArchive.js";

const source = "https://www.data.jma.go.jp/eqev/data/bulletin/";
const directory = new URL("../public/data/focal-mechanism/", import.meta.url);
const cache = new URL("../.cache/focal-mechanism/", import.meta.url);
await mkdir(directory, { recursive: true });
await mkdir(cache, { recursive: true });
async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`JMA status ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
function unzip(buffer) {
  const entries = [];
  for (let i = 0; i < buffer.length - 46; i++) {
    if (buffer.readUInt32LE(i) !== 0x02014b50) continue;
    const size = buffer.readUInt32LE(i + 20), offset = buffer.readUInt32LE(i + 42);
    const method = buffer.readUInt16LE(i + 10);
    const start = offset + 30 + buffer.readUInt16LE(offset+26) + buffer.readUInt16LE(offset+28);
    const data = buffer.subarray(start, start+size);
    if (method !== 0 && method !== 8) throw new Error("Unsupported ZIP method");
    entries.push((method === 8 ? inflateRawSync(data) : data).toString("ascii"));
  }
  if (!entries.length) throw new Error("Empty ZIP");
  return entries.join("\n");
}
const html = (await download(`${source}cmt.html`)).toString("utf8");
const paths = [...new Set([...html.matchAll(/href="\.\/(data\/cmt\/cmt\d{4}(?:\d{2})?\.zip)"/g)].map(m => m[1]))];
if (!paths.length) throw new Error("No official archives");
const months = new Map();
for (const path of paths) {
  const file = new URL(path.split("/").pop(), cache);
  let zip;
  try { zip = await readFile(file); } catch { zip = await download(source+path); await writeFile(file, zip); await new Promise(resolve => setTimeout(resolve, 200)); }
  const records = parseCmtArchive(unzip(zip));
  if (!records.length) throw new Error(`No parsed records: ${path}`);
  for (const record of records) {
    const month = new Date(record.time + 9*3600000).toISOString().slice(0,7).replace("-", "");
    if (!months.has(month)) months.set(month, new Map());
    months.get(month).set(record.id, record);
  }
  console.log(`${path}: ${records.length}`);
}
for (const [month, entries] of months) await writeFile(new URL(`${month}.json`, directory), JSON.stringify({ records: [...entries.values()], source: source+"cmt.html" }));
await writeFile(new URL("manifest.json", directory), JSON.stringify({ source: source+"cmt.html", generatedAt: new Date().toISOString(), months: [...months.keys()].sort(), count: [...months.values()].reduce((sum, entries) => sum + entries.size, 0) }));
