import { validateEarlyAccessToken } from "../_shared/earlyAccessAuth.js";

const NOMADS_FILTER = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl";
const GFS_PRESSURE_LEVELS = [
  1000, 975, 950, 925, 900, 850, 800, 750, 700, 650, 600,
  550, 500, 450, 400, 350, 300, 250, 200, 150, 100
];
const GFS_VARIABLES = ["TMP", "RH", "HGT", "UGRD", "VGRD"];
const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "X-MeteoScope-Early-Access",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "public, max-age=300, s-maxage=900, stale-while-revalidate=1800"
};

function errorResponse(code, status) {
  return new Response(JSON.stringify({ error: code }), { status, headers: RESPONSE_HEADERS });
}

function readUnsigned(bytes, offset, length) {
  let value = 0;
  for (let index = 0; index < length; index += 1) value = value * 256 + bytes[offset + index];
  return value;
}

function readSigned(bytes, offset, length) {
  const value = readUnsigned(bytes, offset, length);
  const sign = 2 ** (length * 8 - 1);
  return value >= sign ? value - 2 ** (length * 8) : value;
}

function readFloat32(bytes, offset) {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getFloat32(0, false);
}

function readBits(bytes, state, width) {
  if (!width) return 0;
  let value = 0;
  for (let index = 0; index < width; index += 1) {
    const byteIndex = state.bitOffset >> 3;
    const bitIndex = 7 - (state.bitOffset & 7);
    value = value * 2 + ((bytes[byteIndex] >> bitIndex) & 1);
    state.bitOffset += 1;
  }
  return value;
}

function unpackComplexPacking(section5, section7) {
  const numberOfPoints = readUnsigned(section5, 5, 4);
  const referenceValue = readFloat32(section5, 11);
  const binaryScale = readSigned(section5, 15, 2);
  const decimalScale = readSigned(section5, 17, 2);
  const bitsForReference = section5[19];
  const missingValueManagement = section5[22];
  const numberOfGroups = readUnsigned(section5, 31, 4);
  const referenceGroupWidth = section5[35];
  const bitsForGroupWidths = section5[36];
  const referenceGroupLength = readUnsigned(section5, 37, 4);
  const groupLengthIncrement = section5[41];
  const trueLengthLastGroup = readUnsigned(section5, 42, 4);
  const bitsForGroupLengths = section5[46];
  if (numberOfGroups < 1 || numberOfGroups > numberOfPoints) throw new Error("unsupported GFS group count");
  if (missingValueManagement !== 0) throw new Error("GFS missing-value packing is unavailable");

  const state = { bitOffset: 5 * 8 };
  const references = Array.from({ length: numberOfGroups }, () => readBits(section7, state, bitsForReference));
  const widths = Array.from({ length: numberOfGroups }, () => referenceGroupWidth + readBits(section7, state, bitsForGroupWidths));
  const lengths = Array.from({ length: numberOfGroups }, (_, index) => (
    index === numberOfGroups - 1
      ? trueLengthLastGroup
      : referenceGroupLength + readBits(section7, state, bitsForGroupLengths) * groupLengthIncrement
  ));
  const packed = [];
  for (let groupIndex = 0; groupIndex < numberOfGroups; groupIndex += 1) {
    for (let sampleIndex = 0; sampleIndex < lengths[groupIndex] && packed.length < numberOfPoints; sampleIndex += 1) {
      const packedValue = readBits(section7, state, widths[groupIndex]);
      packed.push((referenceValue + (references[groupIndex] + packedValue) * 2 ** binaryScale) * 10 ** -decimalScale);
    }
  }
  if (packed.length !== numberOfPoints) throw new Error("incomplete GFS packed data");
  return packed;
}

function unpackSimplePacking(section5, section7) {
  const numberOfPoints = readUnsigned(section5, 5, 4);
  const referenceValue = readFloat32(section5, 11);
  const binaryScale = readSigned(section5, 15, 2);
  const decimalScale = readSigned(section5, 17, 2);
  const bitsPerValue = section5[19];
  const state = { bitOffset: 5 * 8 };
  const values = Array.from({ length: numberOfPoints }, () => {
    const packed = readBits(section7, state, bitsPerValue);
    return (referenceValue + packed * 2 ** binaryScale) * 10 ** -decimalScale;
  });
  return values;
}

function parseProduct(section4) {
  const category = section4[9];
  const number = section4[10];
  const surfaceType = section4[22];
  const scale = readSigned(section4, 23, 1);
  const scaledValue = readUnsigned(section4, 24, 4);
  const pressure = surfaceType === 100 ? (scaledValue * 10 ** -scale) / 100 : null;
  const variable = category === 0 && number === 0 ? "temperature"
    : category === 1 && number === 1 ? "humidity"
      : category === 3 && number === 5 ? "height"
        : category === 2 && number === 2 ? "uWind"
          : category === 2 && number === 3 ? "vWind"
            : null;
  return { variable, pressure };
}

/**
 * Decodes the small, single-grid-point messages returned by NOAA's official
 * GRIB Filter. A one-point subset uses template 5.0; larger filter subsets
 * may use the same source data in template 5.3.
 */
export function parseGfsPointProfile(buffer) {
  const bytes = new Uint8Array(buffer);
  const valuesByPressure = new Map();
  let messageCount = 0;
  let offset = 0;
  while (offset + 20 <= bytes.length) {
    if (String.fromCharCode(...bytes.slice(offset, offset + 4)) !== "GRIB") break;
    const messageLength = readUnsigned(bytes, offset + 8, 8);
    const end = offset + messageLength;
    if (messageLength < 40 || end > bytes.length) throw new Error("invalid GFS GRIB message");
    let cursor = offset + 16;
    let product = null;
    let section5 = null;
    let section7 = null;
    while (cursor + 5 <= end - 4) {
      const length = readUnsigned(bytes, cursor, 4);
      if (length < 5 || cursor + length > end) throw new Error("invalid GFS GRIB section");
      const section = bytes[cursor + 4];
      const content = bytes.slice(cursor, cursor + length);
      if (section === 4) product = parseProduct(content);
      if (section === 5) section5 = content;
      if (section === 7) section7 = content;
      cursor += length;
    }
    if (product?.variable && Number.isFinite(product.pressure) && section5 && section7) {
      const template = readUnsigned(section5, 9, 2);
      const values = template === 0
        ? unpackSimplePacking(section5, section7)
        : template === 3
          ? unpackComplexPacking(section5, section7)
          : (() => { throw new Error(`unsupported GFS packing template ${template}`); })();
      if (values.length !== 1) throw new Error("GFS subset did not return one grid point");
      const pressure = Math.round(product.pressure);
      const row = valuesByPressure.get(pressure) ?? { pressure };
      row[product.variable] = product.variable === "temperature" ? values[0] - 273.15 : values[0];
      valuesByPressure.set(pressure, row);
    }
    messageCount += 1;
    offset = end;
  }
  const rows = [...valuesByPressure.values()]
    .filter((row) => Number.isFinite(row.temperature) && Number.isFinite(row.humidity) && Number.isFinite(row.height))
    .sort((left, right) => right.pressure - left.pressure);
  if (!messageCount || !rows.length) throw new Error("GFS GRIB data was not recognized");
  return rows;
}

export function normalizeGfsCoordinates(latitude, longitude) {
  const rawLon = Number(longitude);
  const rawLat = Number(latitude);
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLon)) return null;
  const lat = Math.max(-89.75, Math.min(89.75, rawLat));
  const lon = ((rawLon % 360) + 360) % 360;
  return {
    latitude: Math.round(lat * 4) / 4,
    longitude: Math.round(lon * 4) / 4
  };
}

export function getLatestGfsCycle(now = new Date()) {
  const ready = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  const cycleHour = Math.floor(ready.getUTCHours() / 6) * 6;
  ready.setUTCHours(cycleHour, 0, 0, 0);
  return {
    date: ready.toISOString().slice(0, 10).replaceAll("-", ""),
    hour: String(cycleHour).padStart(2, "0")
  };
}

export function buildGfsSubsetUrl({ latitude, longitude, cycle = getLatestGfsCycle() }) {
  const params = new URLSearchParams({
    file: `gfs.t${cycle.hour}z.pgrb2.0p25.f000`,
    subregion: "",
    leftlon: longitude.toFixed(2),
    rightlon: longitude.toFixed(2),
    toplat: latitude.toFixed(2),
    bottomlat: latitude.toFixed(2),
    dir: `/gfs.${cycle.date}/${cycle.hour}/atmos`
  });
  GFS_PRESSURE_LEVELS.forEach((level) => params.set(`lev_${level}_mb`, "on"));
  GFS_VARIABLES.forEach((variable) => params.set(`var_${variable}`, "on"));
  return `${NOMADS_FILTER}?${params}`;
}

async function fetchGfsProfile(coordinates, now = new Date()) {
  const cycle = getLatestGfsCycle(now);
  const sourceUrl = buildGfsSubsetUrl({ ...coordinates, cycle });
  const response = await fetch(sourceUrl, {
    headers: { Accept: "application/octet-stream", "User-Agent": "MeteoScope/1.0 (+https://meteoscope.pages.dev/)" },
    cf: { cacheTtl: 300, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`GFS request failed: ${response.status}`);
  const rows = parseGfsPointProfile(await response.arrayBuffer());
  if (rows.length < 8) throw new Error("GFS profile has insufficient pressure levels");
  return { cycle, coordinates, rows, sourceUrl };
}

export async function onRequest({ request, env }) {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
  if (request.method !== "GET" && request.method !== "HEAD") return errorResponse("method_not_allowed", 405);
  if (!env.NOTIFICATIONS_DB) return errorResponse("early_access_not_configured", 503);
  const access = await validateEarlyAccessToken(env.NOTIFICATIONS_DB, request.headers.get("X-MeteoScope-Early-Access") ?? "");
  if (!access.active) return errorResponse("early_access_required", 401);
  const requestUrl = new URL(request.url);
  const coordinates = normalizeGfsCoordinates(requestUrl.searchParams.get("lat"), requestUrl.searchParams.get("lon"));
  if (!coordinates) return errorResponse("coordinates_required", 400);
  try {
    const result = await fetchGfsProfile(coordinates);
    return new Response(request.method === "HEAD" ? null : JSON.stringify({
      source: "NOAA GFS 0.25°",
      forecastHour: 0,
      ...result
    }), { headers: { ...RESPONSE_HEADERS, "X-MeteoScope-Source": "NOAA GFS" } });
  } catch (error) {
    console.error("[gfs-profile] NOAA GFS lookup failed", error?.message ?? error);
    return errorResponse("noaa_gfs_unavailable", 502);
  }
}
