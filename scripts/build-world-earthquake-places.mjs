import { readFile, writeFile } from "node:fs/promises";
import shapefile from "shapefile";
import { normalizeWorldPlaceKey } from "../src/earthquake/worldEarthquakePlace.js";

// Extract Japanese place names from Natural Earth 1:10m Populated Places v5.1.2.
// https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-populated-places/
const input = process.argv[2];
if (!input) throw new Error("Pass the path to ne_10m_populated_places.dbf");

const source = await shapefile.openDbf(new Uint8Array(await readFile(input)), { encoding: "utf-8" });
const countries = new Map();
for (let result = await source.read(); !result.done; result = await source.read()) {
  const { ISO_A2: country, NAME_JA: japanese, NAME: name, NAMEASCII: ascii, NAME_EN: english } = result.value;
  if (!/^[A-Z]{2}$/u.test(country ?? "") || !/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(japanese ?? "")) continue;
  const places = countries.get(country) ?? new Map();
  countries.set(country, places);
  for (const alias of [name, ascii, english]) {
    if (!alias) continue;
    const key = normalizeWorldPlaceKey(alias);
    const previous = places.get(key);
    // Keep the source spelling when a name maps to different places in the same country.
    places.set(key, previous === undefined || previous === japanese ? japanese : null);
  }
}

const byKey = ([a], [b]) => a < b ? -1 : a > b ? 1 : 0;
const dictionary = Object.fromEntries([...countries].sort(byKey).map(([country, places]) => [
  country, Object.fromEntries([...places].filter(([, name]) => name).sort(byKey))
]));
const target = new URL("../src/earthquake/worldEarthquakePlacesJa.generated.js", import.meta.url);
await writeFile(target,
  "// Generated from Natural Earth 1:10m Populated Places v5.1.2 (public domain).\n"
  + "// https://www.naturalearthdata.com/about/terms-of-use/\n"
  + `export default ${JSON.stringify(dictionary, null, 2)};\n`);
console.log(`Generated ${Object.values(dictionary).reduce((count, places) => count + Object.keys(places).length, 0)} names`);
