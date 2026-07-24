import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import https from "node:https";
import path from "node:path";

const SOURCE_URL = "https://www.data.jma.go.jp/eqev/data/bulletin/data/tsunami/stat_j.txt";
const OUTPUT_FILE = path.resolve("public/data/jma-tsunami-observation-stations.json");
const localSource = process.argv[2] ? path.resolve(process.argv[2]) : null;

const source = localSource
  ? await readFile(localSource)
  : await download(SOURCE_URL);
const text = new TextDecoder("shift_jis").decode(source);
const stationsByCode = new Map();

for (const line of text.split(/\r?\n/u)) {
  const columns = line.trim().split(/\s+/u);
  if (!/^\d{5}$/u.test(columns[0] ?? "") || columns.length < 12) continue;

  const [code, name, latitudeDegrees, latitudeMinutes, longitudeDegrees, longitudeMinutes, agency] = columns;
  const latitude = toDecimalDegrees(latitudeDegrees, latitudeMinutes);
  const longitude = toDecimalDegrees(longitudeDegrees, longitudeMinutes);
  if (!name || !agency || !Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;

  if (!stationsByCode.has(code)) {
    stationsByCode.set(code, {
      code,
      name,
      coordinates: [roundCoordinate(longitude), roundCoordinate(latitude)],
      agency,
      forecastAreaCode: columns.at(-1) === "000" ? "" : columns.at(-1)
    });
  }
}

const stations = [...stationsByCode.values()].sort((left, right) => left.code.localeCompare(right.code, "ja"));
if (stations.length < 400) {
  throw new Error(`Unexpected JMA tsunami observation station count: ${stations.length}`);
}

const payload = {
  source: SOURCE_URL,
  retrievedAt: new Date().toISOString().slice(0, 10),
  sourceSha256: createHash("sha256").update(source).digest("hex"),
  stations
};

await mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
await writeFile(OUTPUT_FILE, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
console.log(`Updated ${path.relative(process.cwd(), OUTPUT_FILE)} (${stations.length} stations, source SHA-256 ${payload.sourceSha256})`);

function toDecimalDegrees(degrees, minutes) {
  const degreesValue = Number(degrees);
  const minutesValue = Number(minutes);
  if (!Number.isFinite(degreesValue) || !Number.isFinite(minutesValue)) return Number.NaN;
  return degreesValue + minutesValue / 60;
}

function roundCoordinate(value) {
  return Math.round(value * 100_000) / 100_000;
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        download(new URL(response.headers.location, url)).then(resolve, reject);
        return;
      }
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Download failed (${response.statusCode}) ${url}`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    }).on("error", reject);
  });
}
