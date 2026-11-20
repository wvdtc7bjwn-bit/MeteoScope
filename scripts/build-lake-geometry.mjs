import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { read as readShapefile } from "shapefile";

// Official W09-05_GML.zip, JGD2000 geographic coordinates (longitude, latitude
// in SHP). Keep all polygon parts and interior rings; do not simplify the data.
export function normalizeLakeCollection(collection) {
  if (collection.type !== "FeatureCollection" || !collection.features?.length) throw new Error("Empty lake collection");
  return {
    type: "FeatureCollection",
    features: collection.features.map((feature, index) => {
      if (!["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) throw new Error("Expected polygon lake geometry");
      const polygons = feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates;
      for (const polygon of polygons) for (const ring of polygon) {
        if (ring.length < 4 || ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw new Error("Unclosed lake ring");
        for (const [lon, lat] of ring) if (!Number.isFinite(lon) || !Number.isFinite(lat) || lon < 122 || lon > 154 || lat < 20 || lat > 46) throw new Error("Invalid Japanese lake coordinates");
      }
      return { type: "Feature", properties: { code: `lake-${index + 1}`, name: String(feature.properties.W09_001 ?? "").trim() }, geometry: feature.geometry };
    })
  };
}

export async function buildLakeGeometry(input) {
  if (!input) throw new Error("Usage: node scripts/build-lake-geometry.mjs path/to/W09-05-g_Lake.shp");
  const source = resolve(input);
  const collection = normalizeLakeCollection(await readShapefile(source, source.replace(/\.shp$/iu, ".dbf"), { encoding: "shift-jis" }));
  const text = JSON.stringify(collection) + "\n";
  await writeFile(new URL("../public/data/japan-lakes.geojson", import.meta.url), text);
  const metadata = {
    source: "国土数値情報（湖沼データ）・国土交通省",
    sourceUrl: "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-W09-v2_2.html",
    downloadUrl: "https://nlftp.mlit.go.jp/ksj/gml/data/W09/W09-05/W09-05_GML.zip",
    licenseUrl: "https://nlftp.mlit.go.jp/ksj/other/agreement_02.html",
    license: "商用可（出典・加工者表示、利用規約継承）",
    referenceDate: "2005-09-01",
    sourceCrs: "JGD2000 geographic (SHP longitude/latitude)",
    processing: "MeteoScopeがGeoJSONへ変換。湖内の島・穴・複数ポリゴンを保持。座標の簡略化なし。基図タイルには既存と同じ表示用の量子化・簡略化を適用。",
    limitations: "整備時点の湖沼・貯水池で、全ての池・現在の湖岸を網羅しない。原典由来の時間的・空間的誤差があり、測量・航行・浸水範囲の判定には使用しない。",
    featureCount: collection.features.length,
    sha256: createHash("sha256").update(text).digest("hex"),
    sourceSha256: createHash("sha256").update(await readFile(source)).digest("hex")
  };
  await writeFile(new URL("../public/data/japan-lakes.metadata.json", import.meta.url), JSON.stringify(metadata, null, 2) + "\n");
  console.log(`Lakes: ${collection.features.length} features, ${text.length} bytes`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await buildLakeGeometry(process.argv[2]);
