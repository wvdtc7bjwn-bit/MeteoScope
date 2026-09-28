import AdmZip from "adm-zip";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const SOURCE_URL = "https://www.data.jma.go.jp/stats/data/mdrr/normal/2020/data/normal_amedas_daily.zip";
const OUTPUT_PATH = resolve("public/data/amedas-daily-high-low-temperature-normals-1991-2020.json");
const TEMPERATURE_NORMAL_ELEMENTS = {
  maximum: "0600",
  minimum: "0700"
};
const DAYS_PER_MONTH_SLOT = 31;

const response = await fetch(SOURCE_URL, { headers: { Accept: "application/zip" } });
if (!response.ok) throw new Error(`Could not download AMeDAS normal data: ${response.status}`);

const zip = new AdmZip(Buffer.from(await response.arrayBuffer()));
const stations = {};

for (const entry of zip.getEntries()) {
  if (entry.isDirectory || !entry.entryName.endsWith(".csv")) continue;
  const rows = zip.readAsText(entry).split(/\r?\n/);
  const values = Object.fromEntries(
    Object.keys(TEMPERATURE_NORMAL_ELEMENTS).map((kind) => [kind, Array(DAYS_PER_MONTH_SLOT * 12).fill(null)])
  );
  let stationId = "";

  rows.forEach((row) => {
    const fields = row.split(",");
    const kind = Object.entries(TEMPERATURE_NORMAL_ELEMENTS)
      .find(([, element]) => fields[2]?.trim() === element)?.[0];
    if (fields.length < 14 || !kind) return;
    const month = Number(fields[6]);
    if (!Number.isInteger(month) || month < 1 || month > 12) return;
    stationId = fields[1]?.trim() || stationId;
    for (let day = 0; day < DAYS_PER_MONTH_SLOT; day += 1) {
      const value = Number(fields[7 + day * 2]);
      if (Number.isFinite(value) && Math.abs(value) < 9000) {
        values[kind][(month - 1) * DAYS_PER_MONTH_SLOT + day] = value;
      }
    }
  });

  if (stationId && Object.values(values).some((series) => series.some(Number.isFinite))) stations[stationId] = values;
}

const data = {
  period: "1991-2020",
  source: "気象庁 アメダス（地域気象観測）日別平年値",
  unit: "0.1C",
  stations
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, `${JSON.stringify(data)}\n`);
console.log(`Wrote ${Object.keys(stations).length} AMeDAS daily high/low temperature normal records to ${OUTPUT_PATH}`);
