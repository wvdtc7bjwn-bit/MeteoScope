import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const SOURCE_URL = "https://raw.githubusercontent.com/0Quake/JMA_Region/main/%E9%9C%87%E5%A4%AE%E5%9C%B0%E5%90%8D.geojson";
const OUTPUT_PATH = path.resolve("public/data/jma-earthquake-epicenter-regions.geojson");

async function main() {
  const response = await fetch(SOURCE_URL, {
    headers: { "user-agent": "MeteoScope JMA epicenter-region updater" },
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`Failed to download JMA epicenter regions: HTTP ${response.status}`);
  const source = await response.json();
  if (source?.type !== "FeatureCollection" || !Array.isArray(source.features) || !source.features.length) {
    throw new Error("JMA epicenter-region GeoJSON is invalid");
  }
  if (!source.features.every((feature) => feature?.properties?.name && feature?.geometry?.coordinates)) {
    throw new Error("JMA epicenter-region GeoJSON has a feature without a name or geometry");
  }
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(source)}\n`, "utf8");
  console.log(`Saved ${source.features.length} JMA epicenter regions to ${OUTPUT_PATH}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
