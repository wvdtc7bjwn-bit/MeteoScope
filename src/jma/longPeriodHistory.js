import { parseCsvRows } from "../utils/csv.js";
import { normalizeLongPeriodClass } from "../earthquake/longPeriodGroundMotion.js";
import { parseJstDateTime } from "../utils/jstDateTime.js";

export const LONG_PERIOD_HISTORY_LIST_URL = "https://www.data.jma.go.jp/eew/data/ltpgm_explain/data/past/past_list.html";
const stripHtml = value => String(value).replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
const minuteKey = value => {
  const iso = parseJstDateTime(value);
  return iso ? new Date(Date.parse(iso) + 9 * 60 * 60 * 1000).toISOString().slice(0, 16) : "";
};

export function parseLongPeriodHistoryCatalog(html) {
  const records = [];
  for (const row of String(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => stripHtml(cell[1]));
    const eventId = row[1].match(/eventId=(\d{14})(?:&|["'\s>])/i)?.[1]
      ?? row[1].match(/href=["']?\.\/(\d{14})\/index\.html/i)?.[1];
    const date = cells[0]?.match(/(\d{4})年(\d{2})月(\d{2})日\s*(\d{2})時(\d{2})分/);
    const maxClass = normalizeLongPeriodClass(cells[3]?.replace(/^階級/, ""));
    if (!eventId || !date || maxClass === null || !cells[2]?.trim() || !Number.isFinite(Number(cells[2]))) continue;
    records.push({ eventId, originMinute: minuteKey(`${date[1]}-${date[2]}-${date[3]} ${date[4]}:${date[5]}`),
      place: cells[1], magnitude: Number(cells[2]), maxClass });
  }
  if (!records.length) throw new Error("JMA long-period history catalogue unavailable");
  return records;
}

export function findLongPeriodHistoryRecord(records, hypocenter) {
  const minute = minuteKey(hypocenter.originTime);
  const place = value => String(value ?? "").normalize("NFKC").replace(/\s/g, "");
  const magnitudeText = String(hypocenter.magnitude ?? "").replace(/^M/i, "").trim();
  const magnitude = magnitudeText ? Number(magnitudeText) : NaN;
  if (!minute || !place(hypocenter.place) || !Number.isFinite(magnitude)) return null;
  const matches = records.filter(record => record.originMinute === minute && place(record.place) === place(hypocenter.place)
    && Math.abs(record.magnitude - magnitude) <= 0.21);
  // The archive ID and the initial JMA event ID can differ. Never guess between nearby earthquakes.
  return matches.length === 1 ? matches[0] : null;
}

export function parseLongPeriodHistoryCsv(csv, record) {
  const rows = parseCsvRows(csv);
  if (!rows[0]?.[0]?.includes("震度計番号") || !rows[0]?.[5]?.includes("長周期地震動階級")) {
    throw new Error("JMA long-period CSV format changed");
  }
  const stations = rows.slice(1).flatMap(row => {
    const grade = normalizeLongPeriodClass(row[5]);
    if (!/^\d{5}$/.test(row[0]) || !row[1] || grade === null) return [];
    return [{ code: row[0], stationName: row[1], areaName: row[2], prefecture: "", class: grade,
      observationStart: row[3], periods: row.slice(6, 13).map((value, index) => ({ band: String(index + 1), unit: "秒台", class: normalizeLongPeriodClass(value), sva: null })) }];
  });
  if (!stations.length || Math.max(...stations.map(station => station.class)) !== record.maxClass) {
    throw new Error("JMA long-period CSV does not match catalogue maximum");
  }
  const areas = new Map();
  for (const station of stations) {
    const current = areas.get(station.areaName);
    if (!current || station.class > current.maxClass) areas.set(station.areaName, { areaName: station.areaName, prefecture: "", maxClass: station.class });
  }
  return { eventId: record.eventId, source: "jma-history-csv", status: "issued", maxClass: record.maxClass,
    reportTime: "", reportTimeRaw: "", areas: [...areas.values()], stations,
    url: `https://www.data.jma.go.jp/eew/data/ltpgm_explain/event.php?dir1=data/past&eventId=${record.eventId}&past=1` };
}
