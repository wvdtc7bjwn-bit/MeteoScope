// Manual, reproducible static-data build. No scheduled job or application-side bulk downloads.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import AdmZip from "adm-zip";
import { openDbf } from "shapefile";
import { environmentMeshIndex, ENVIRONMENT_SCHEMA } from "../src/location/environmentMesh.js";
const root = new URL("../", import.meta.url), cache = new URL(".cache/land-use/", root);
const destination = new URL("public/data/temperature-environment/v1/", root);
await mkdir(cache, { recursive: true }); await mkdir(destination, { recursive: true });
async function catalogue(kind, address, pattern) {
  const file = new URL(`${kind}-catalogue.html`, cache);
  let html;
  try { html = await readFile(file, "utf8"); } catch {
    const response = await fetch(address, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`Catalogue ${response.status}`);
    html = await response.text(); await writeFile(file, html);
  }
  const selected = new Map();
  for (const match of html.matchAll(/DownLd\('([^']+)','([^']+)','([^']+)'/g)) {
    const name = match[2], identity = name.match(pattern); if (!identity) continue;
    const year = Number(identity[1]), primary = identity[2], previous = selected.get(primary);
    if (!previous || year > previous.year) selected.set(primary, { name, year, primary, url: new URL(match[3], address).href });
  }
  if (selected.size < 150) throw Error(`Incomplete ${kind} catalogue: ${selected.size}`);
  return selected;
}
const land = await catalogue("land-use", "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-L03-a-v3_1.html", /^L03-a-(16|21)_(\d{4})-jgd(?:2011)?_GML.zip$/);
const terrain = await catalogue("terrain", "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-G04-a.html", /^G04-a-(11)_(\d{4})-jgd_GML.zip$/);
async function records(source, visit) {
  if (!source) return;
  const file = new URL(source.name, cache);
  let bytes;
  try { bytes = await readFile(file); } catch {
    const response = await fetch(source.url, { signal: AbortSignal.timeout(30000) });
    if (!response.ok) throw Error(`${response.status}: ${source.url}`);
    bytes = Buffer.from(await response.arrayBuffer()); await writeFile(file, bytes);
  }
  const zip = new AdmZip(bytes), entry = zip.getEntries().find(e => e.entryName.endsWith(".dbf"));
  if (!entry) throw Error(`Missing DBF: ${source.name}`);
  const db = await openDbf(zip.readFile(entry), { encoding: "shift_jis" });
  for (;;) { const record = await db.read(); if (record.done) break; visit(record.value); }
  source.sha256 = createHash("sha256").update(bytes).digest("hex");
}
const validNumber = value => value !== null && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const terrainNumber = value => value != null && String(value).trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : null;
const manifest = { schema: 1, description: "MeteoScope processed MLIT land-use and terrain attributes; not a temperature product", sources: [], tiles: [] };
const primaries = [...new Set([...land.keys(), ...terrain.keys()])].sort();
let cursor = 0, complete = 0;
// Two workers, each downloading one ZIP at a time; complete locally rather than per visitor.
await Promise.all([0, 1].map(async () => {
  while (cursor < primaries.length) {
    const primary = primaries[cursor++], l = land.get(primary), t = terrain.get(primary);
    const buffer = new ArrayBuffer(ENVIRONMENT_SCHEMA.headerBytes + ENVIRONMENT_SCHEMA.cells * ENVIRONMENT_SCHEMA.cellBytes);
    const view = new DataView(buffer); new Uint8Array(buffer).fill(255);
    view.setUint32(0, 0x4d534531, false); view.setUint16(4, 1, true); view.setUint16(6, Number(primary), true);
    view.setUint16(8, l ? 2000 + l.year : 0, true); view.setUint16(10, t ? 2011 : 0, true); view.setUint32(12, 0, true);
    for (let i = 0; i < 6400; i++) view.setInt16(16 + i * 10 + 5, -32768, true);
    let landCells = 0, terrainCells = 0;
    await records(l, row => {
      const code = String(row["メッシュ"] ?? ""), index = environmentMeshIndex(code);
      if (!code.startsWith(primary) || index == null) throw Error(`Bad land mesh: ${code}`);
      const fields = ["田", "他農用地", "森林", "荒地", "建物用地", "道路", "鉄道", "他用地", "河川湖沼", "海浜", "海水域", "ゴルフ場"];
      const values = fields.map(key => validNumber(row[key])); if (values.some(v => v == null)) throw Error(`Bad land attributes: ${l.name}`);
      const total = values.reduce((a,b) => a+b,0), outside = validNumber(row["範囲外"]) ?? 0;
      if (!total || outside > total * .1) return;
      const fractions = [(values[4]+values[5]+values[6])/total, values[2]/total, (values[0]+values[1])/total, values[8]/total, values[10]/total];
      fractions.forEach((value, i) => view.setUint8(16 + index * 10 + i, Math.round(value * 250))); landCells++;
    });
    await records(t, row => {
      const code = String(row.G04a_001 ?? ""), index = environmentMeshIndex(code);
      if (!code.startsWith(primary) || index == null) throw Error(`Bad terrain mesh: ${code}`);
      const height = terrainNumber(row.G04a_002), max = terrainNumber(row.G04a_003), min = terrainNumber(row.G04a_004), slope = terrainNumber(row.G04a_010);
      if (height == null || height < -500 || height > 9000 || max == null || min == null || max < min || min < -500 || max > 9000) return;
      const start = 16 + index * 10; view.setInt16(start + 5, Math.round(height), true); view.setUint16(start + 7, Math.round(max-min), true);
      if (slope != null && slope >= 0 && slope <= 90) view.setUint8(start + 9, Math.round(slope * 2)); terrainCells++;
    });
    await writeFile(new URL(`${primary}.bin`, destination), new Uint8Array(buffer));
    manifest.tiles.push({ primary, landYear: l ? 2000+l.year : null, terrainYear: t ? 2011 : null, landCells, terrainCells });
    manifest.sources.push(...[l,t].filter(Boolean)); complete++;
    if (complete % 10 === 0 || complete === primaries.length) console.log(`Built ${complete}/${primaries.length}`);
  }
}));
manifest.tiles.sort((a,b)=>a.primary.localeCompare(b.primary)); manifest.sources.sort((a,b)=>a.name.localeCompare(b.name));
await writeFile(new URL("manifest.json", destination), JSON.stringify(manifest, null, 2)+"\n");
await writeFile(new URL("src/location/environmentCoverage.generated.js", root), `// Generated by scripts/build-temperature-environment.mjs\nexport const ENVIRONMENT_MESHES = new Set(${JSON.stringify(primaries)});\n`);
console.log(JSON.stringify({ tiles:primaries.length, bytes:primaries.length*(ENVIRONMENT_SCHEMA.headerBytes+6400*10), landCells:manifest.tiles.reduce((a,t)=>a+t.landCells,0), terrainCells:manifest.tiles.reduce((a,t)=>a+t.terrainCells,0) }));
