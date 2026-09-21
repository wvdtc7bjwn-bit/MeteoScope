import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FEATURE_SERVER =
  "https://services.arcgis.com/wlVTGRSYTzAbjjiC/ArcGIS/rest/services/flood_risk_all/FeatureServer";
const OUTPUT_PATH = fileURLToPath(
  new URL("../public/data/jma-designated-river-geometry.geojson", import.meta.url),
);

// 気象庁の「指定河川洪水予報の予報区域」追加・変更通知で、Layer 0 に
// 未収録であることを確認した指定河川。Layer 1 から対応する流路を採用する。
const SUPPLEMENTAL_FORECAST_AREAS = [
  { code: "810108010400", name: "途別川", layer1Name: "途別川" },
  { code: "810108016600", name: "十勝川水系美生川", layer1Name: "美生川" },
  { code: "810108010401", name: "十勝川水系途別川上流", layer1Name: "途別川" },
  { code: "830304004900", name: "善福寺川", layer1Name: "善福寺川" },
  { code: "880801000200", name: "石手川", layer1Name: "石手川" },
  {
    code: "880802000103",
    name: "肱川水系肱川（菅田～鹿野川）",
    layer1Name: "肱川",
  },
  { code: "890907000103", name: "矢部川中流部", layer1Name: "矢部川" },
];

function featureWithProperties(feature, properties) {
  return {
    type: "Feature",
    properties,
    geometry: feature.geometry,
  };
}

async function fetchGeoJson(layer, params) {
  const query = new URLSearchParams({
    f: "geojson",
    returnGeometry: "true",
    outSR: "4326",
    geometryPrecision: "5",
    maxAllowableOffset: "0.003",
    ...params,
  });
  const response = await fetch(`${FEATURE_SERVER}/${layer}/query?${query}`);
  if (!response.ok) {
    throw new Error(`FeatureServer layer ${layer} returned HTTP ${response.status}`);
  }

  const collection = await response.json();
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) {
    throw new Error(`FeatureServer layer ${layer} did not return GeoJSON features`);
  }
  return collection;
}

async function main() {
  const layer0 = await fetchGeoJson(0, {
    where: "1=1",
    outFields: "FAREACODE,RIVERNAME",
  });
  const existingCodes = new Set(
    layer0.features.map((feature) => String(feature.properties?.FAREACODE ?? "")),
  );
  const missingAreas = SUPPLEMENTAL_FORECAST_AREAS.filter(
    ({ code }) => !existingCodes.has(code),
  );
  const names = [...new Set(missingAreas.map(({ layer1Name }) => layer1Name))];
  const layer1 = names.length
    ? await fetchGeoJson(1, {
        where: `RIVERNAME IN (${names.map((name) => `'${name.replaceAll("'", "''")}'`).join(",")})`,
        outFields: "RIVERCODE,RIVERNAME",
      })
    : { features: [] };
  const byRiverName = new Map(
    layer1.features.map((feature) => [String(feature.properties?.RIVERNAME ?? ""), feature]),
  );
  const supplements = missingAreas.map(({ code, name, layer1Name }) => {
    const source = byRiverName.get(layer1Name);
    if (!source) {
      throw new Error(`Layer 1 does not contain the geometry for ${name} (${layer1Name})`);
    }
    return featureWithProperties(source, {
      FAREACODE: code,
      RIVERNAME: name,
      sourceLayer: 1,
      sourceRiverName: layer1Name,
    });
  });

  const collection = {
    type: "FeatureCollection",
    metadata: {
      generatedAt: new Date().toISOString(),
      source: "ESRIジャパン株式会社・気象庁",
      baseLayer: 0,
      supplementalLayer: 1,
      supplementalForecastAreas: supplements.map(({ properties }) => properties.FAREACODE),
    },
    features: [
      ...layer0.features.map((feature) =>
        featureWithProperties(feature, { ...feature.properties, sourceLayer: 0 }),
      ),
      ...supplements,
    ],
  };

  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(collection)}\n`, "utf8");
  console.log(
    `Wrote ${collection.features.length} river features (${supplements.length} supplemental) to ${OUTPUT_PATH}`,
  );
}

await main();
