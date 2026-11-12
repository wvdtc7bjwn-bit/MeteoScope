import { MECHANISM_ROOT, MECHANISM_TYPES } from "../../src/earthquake/focalMechanism.js";

const headers = { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*", "X-Content-Type-Options": "nosniff" };
const number = value => /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
const plain = value => value.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
function coordinate(value, axis) {
  const match = value.match(/^(\d+)度([\d.]+)分([NSEW])$/);
  if (!match || !Number.isFinite(Number(match[2])) || Number(match[2]) >= 60 || !(axis === "lat" ? "NS" : "EW").includes(match[3])) return null;
  const result = (Number(match[1]) + Number(match[2]) / 60) * ("SW".includes(match[3]) ? -1 : 1);
  return Math.abs(result) <= (axis === "lat" ? 90 : 180) ? result : null;
}

export function parseMechanisms(html, type, month) {
  const definition = Object.hasOwn(MECHANISM_TYPES, type) ? MECHANISM_TYPES[type] : null;
  if (!definition) throw new Error("Unknown mechanism type");
  const records = new Map();
  for (const row of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...row[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(cell => plain(cell[1]));
    if (!cells.length || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(cells[0])) continue;
    const id = row[1].match(new RegExp(`href=["']\\./fig/(${definition.prefix}${month}\\d{8})\\.html["']`))?.[1];
    const time = Date.parse(`${cells[0].replace(" ", "T")}+09:00`);
    const lat = coordinate(cells[1] ?? "", "lat"), lon = coordinate(cells[2] ?? "", "lon");
    if (!id || !Number.isFinite(time) || lat === null || lon === null || cells[0].slice(0, 7).replace("-", "") !== month) continue;
    const start = type === "cmt" ? 7 : 6;
    const planes = [0, 1].map(index => cells.slice(start + index * 3, start + index * 3 + 3).map(number));
    if (planes.some(plane => plane.length !== 3 || plane.some(v => v === null) || plane[0] < 0 || plane[0] > 360 || plane[1] < 0 || plane[1] > 90 || Math.abs(plane[2]) > 180)) continue;
    records.set(id, { id, type, time, originTime: new Date(time).toISOString(), coordinates: [lon, lat], place: cells[5], magnitude: number(cells[4]), mw: type === "cmt" ? number(cells[6]) : null, planes });
  }
  return [...records.values()];
}

export async function onRequest({ request }) {
  const reply = (data, status = 200) => new Response(request.method === "HEAD" ? null : JSON.stringify(data), { status, headers: { ...headers, "Cache-Control": status === 200 ? "public, max-age=900, s-maxage=3600" : "no-store" } });
  if (!["GET", "HEAD"].includes(request.method)) return reply({ error: "method_not_allowed" }, 405);
  const params = new URL(request.url).searchParams;
  const month = params.get("month"), type = params.get("type") || "cmt";
  const definition = Object.hasOwn(MECHANISM_TYPES, type) ? MECHANISM_TYPES[type] : null;
  if (!definition || !/^(19|20)\d{2}(0[1-9]|1[0-2])$/.test(month ?? "")) return reply({ error: "invalid_query" }, 400);
  const source = `${MECHANISM_ROOT}${definition.directory}/${definition.prefix}${month}.html`;
  try {
    const response = await fetch(source, { signal: AbortSignal.timeout(12000), cf: { cacheTtl: 3600, cacheEverything: true } });
    if (response.status === 404) return reply({ records: [], source, unavailable: true });
    if (!response.ok) throw new Error("upstream_status");
    const html = await response.text();
    if (html.length > 1500000 || !/<table\b/i.test(html)) throw new Error("unexpected_format");
    const records = parseMechanisms(html, type, month);
    if (!records.length && /<td[^>]*>\s*\d{4}-\d{2}-\d{2}/i.test(html)) throw new Error("unrecognized_records");
    return reply({ records, source, unavailable: false });
  } catch {
    console.warn("[jma-focal-mechanism] upstream request or parsing failed");
    return reply({ error: "source_unavailable" }, 502);
  }
}
