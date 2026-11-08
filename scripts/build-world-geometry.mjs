// Build from Natural Earth 1:10m Admin 0 Countries, version 5.1.1.
// Download: https://www.naturalearthdata.com/downloads/10m-cultural-vectors/10m-admin-0-countries/
// Natural Earth data is public domain: https://www.naturalearthdata.com/about/terms-of-use/
import { writeFile } from "node:fs/promises";
import shapefile from "shapefile";
import simplify from "@turf/simplify";
import { worldGeometryModule } from "./lib/pack-world-geometry.mjs";

const input = process.argv[2];
if (!input) throw new Error("Pass the path to ne_10m_admin_0_countries.shp");
const source = await shapefile.open(input, input.replace(/\.shp$/i, ".dbf"));
const features = [];
for (;;) {
  const result = await source.read();
  if (result.done) break;
  const feature = result.value;
  const iso = String(feature.properties.ADM0_A3 || "").replace(/\0/g, "").trim();
  const simplified = simplify(feature, { tolerance: 0.0015, highQuality: true });
  function round(value) {
    if (typeof value === "number") return Math.round(value * 10000) / 10000;
    return Array.isArray(value) ? value.map(round) : value;
  }
  features.push({
    type: "Feature",
    properties: { ISO_A3: iso },
    geometry: { ...simplified.geometry, coordinates: round(simplified.geometry.coordinates) }
  });
}
if (!features.some((feature) => feature.properties.ISO_A3 === "JPN")) throw new Error("Japan is missing");
const data = JSON.stringify({ type: "FeatureCollection", features });
await writeFile("src/map/data/worldCountriesGeoJson.js", worldGeometryModule({ type: "FeatureCollection", features }));
console.log(`Generated ${features.length} countries, ${Buffer.byteLength(data)} bytes`);
