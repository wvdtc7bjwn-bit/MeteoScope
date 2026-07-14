import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import mapshaper from "mapshaper";

const STATION_URL = "https://www.data.jma.go.jp/eqev/data/intens-st/stations.json";
const PREFECTURE_URL = "https://www.data.jma.go.jp/developer/gis/20190125_AreaInformationPrefectureEarthquake_GIS.zip";
const OUTPUT_DIR = path.resolve("public/data");
const STATION_OUTPUT = path.join(OUTPUT_DIR, "jma-intensity-stations.json");
const PREFECTURE_OUTPUT = path.join(OUTPUT_DIR, "japan-prefectures.geojson");

const PREFECTURE_NAMES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県",
  "静岡県", "愛知県", "三重県", "滋賀県", "京都府", "大阪府", "兵庫県",
  "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県",
  "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
];

const OWNER_NAMES = {
  "0": "気象庁",
  "1": "地方公共団体",
  "2": "防災科研"
};

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });
  const workDir = await mkdtemp(path.join(os.tmpdir(), "meteoscope-jma-data-"));

  try {
    const stationResult = await updateStations();
    const prefectureResult = await updatePrefectures(workDir);
    console.log(`Updated ${path.relative(process.cwd(), STATION_OUTPUT)} (${stationResult.count} stations, source SHA-256 ${stationResult.hash})`);
    console.log(`Updated ${path.relative(process.cwd(), PREFECTURE_OUTPUT)} (${prefectureResult.count} prefectures, source SHA-256 ${prefectureResult.hash})`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

async function updateStations() {
  const source = await download(STATION_URL);
  const raw = JSON.parse(source.toString("utf8"));
  if (!Array.isArray(raw) || raw.length < 4000) {
    throw new Error(`Unexpected JMA station count: ${Array.isArray(raw) ? raw.length : "not an array"}`);
  }

  const stations = raw.map((station, index) => {
    const latitude = Number(station?.lat);
    const longitude = Number(station?.lon);
    const name = String(station?.name ?? "").trim();
    if (!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      throw new Error(`Invalid JMA station at index ${index}`);
    }
    return {
      name,
      latitude,
      longitude,
      prefectureCode: String(station.pref ?? "").padStart(2, "0"),
      owner: OWNER_NAMES[String(station.affi)] ?? "不明"
    };
  });

  const unique = new Set(stations.map((station) => `${station.name}|${station.latitude}|${station.longitude}`));
  if (unique.size !== stations.length) {
    throw new Error(`JMA station data contains ${stations.length - unique.size} duplicate records`);
  }

  await writeJson(STATION_OUTPUT, stations);
  return { count: stations.length, hash: sha256(source) };
}

async function updatePrefectures(workDir) {
  const archive = await download(PREFECTURE_URL);
  const zip = new AdmZip(archive);
  const requiredExtensions = [".shp", ".shx", ".dbf"];

  for (const extension of requiredExtensions) {
    const entry = zip.getEntries().find((candidate) => candidate.entryName.toLowerCase().endsWith(extension));
    if (!entry) throw new Error(`JMA prefecture archive is missing ${extension}`);
    await writeFile(path.join(workDir, `prefectures${extension}`), entry.getData());
  }

  const sourcePath = path.join(workDir, "prefectures.shp");
  const convertedPath = path.join(workDir, "prefectures.geojson");
  await runMapshaper([
    sourcePath,
    "encoding=utf8",
    "-clean",
    "-simplify", "weighted", "2%", "keep-shapes",
    "-o", "format=geojson", "precision=0.00001", convertedPath
  ]);

  const collection = JSON.parse(await readFile(convertedPath, "utf8"));
  if (!Array.isArray(collection?.features) || collection.features.length !== 47) {
    throw new Error(`Unexpected JMA prefecture count: ${collection?.features?.length ?? "missing"}`);
  }

  const codes = new Set();
  collection.features.forEach((feature) => {
    const code = String(feature?.properties?.code ?? "").padStart(2, "0");
    const prefectureName = PREFECTURE_NAMES[Number(code) - 1];
    if (!prefectureName || codes.has(code) || !feature?.geometry) {
      throw new Error(`Invalid or duplicate JMA prefecture code: ${code}`);
    }
    codes.add(code);
    feature.properties = { P: prefectureName, code };
  });
  collection.features.sort((left, right) => left.properties.code.localeCompare(right.properties.code));

  await writeJson(PREFECTURE_OUTPUT, collection);
  return { count: collection.features.length, hash: sha256(archive) };
}

function download(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { "user-agent": "MeteoScope data updater" } }, (response) => {
      const status = response.statusCode ?? 0;
      if (status >= 300 && status < 400 && response.headers.location) {
        response.resume();
        if (redirectCount >= 5) return reject(new Error(`Too many redirects while downloading ${url}`));
        const redirectUrl = new URL(response.headers.location, url).toString();
        download(redirectUrl, redirectCount + 1).then(resolve, reject);
        return;
      }
      if (status !== 200) {
        response.resume();
        reject(new Error(`Failed to download ${url}: HTTP ${status}`));
        return;
      }
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve(Buffer.concat(chunks)));
      response.on("error", reject);
    });
    request.setTimeout(30_000, () => request.destroy(new Error(`Timed out while downloading ${url}`)));
    request.on("error", reject);
  });
}

function runMapshaper(args) {
  return mapshaper.runCommands(args);
}

async function writeJson(filePath, value) {
  await writeFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
