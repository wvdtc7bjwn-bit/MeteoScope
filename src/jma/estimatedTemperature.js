import { fetchJson, fetchArrayBuffer } from "./jmaClient.js";
import { readPngPixel } from "../utils/pngPixel.js";

export const JMA_TEMPERATURE_ROOT = "https://www.jma.go.jp/bosai/jmatile/data/suikeikishou";
export const JMA_TEMPERATURE_MAX_AGE_MS = 90 * 60 * 1000;
// Official suikei display palette, -29 <= T < -28 ... 43 <= T < 44.
// This is a 1 C display category, NOT a decoded 0.5 C GRIB value.
const COLORS = "dedce8 d8d6e4 ceccde c5c2d8 bbb7d1 b2adcb a8a3c5 9e99be 948eb8 8b84b1 8179ab 776fa4 6f669a 665e90 5e5585 554d7b 4d4471 3e3d74 2e3677 1f2e7a 0f277d 002080 002799 002db3 0034cc 003ae6 0041ff 0052ff 0063ff 0074ff 0085ff 0096ff 25a7ff 4ab8ff 6fc9ff 94daff b9ebff c7effc d5f3f9 e3f7f6 f1fbf3 fffff0 ffffde ffffcc ffffba ffffa8 ffff96 fefd78 fdfb5a fcf93c fbf71e faf500 fbe300 fcd000 fdbe00 feab00 ff9900 ff8200 ff6c00 ff5500 ff3f00 ff2800 f02015 e1182a d2103e c30853 b40068 a0005c 8c0051 780045 64003a 50002e 450028".split(" ");
const CATEGORY = new Map(COLORS.map((hex, i) => [Number.parseInt(hex, 16), { lowerC: i - 29, upperC: i - 28 }]));
CATEGORY.set(0x3a0022, { lowerC: 44, upperC: null });
CATEGORY.set(0xe4e2ec, { lowerC: null, upperC: -29 });

export function decodeJmaTemperaturePixel(pixel) {
  if (!pixel || pixel.length < 4 || pixel[3] !== 255) return null;
  const range = CATEGORY.get(pixel[0] * 65536 + pixel[1] * 256 + pixel[2]);
  return range ? { ...range } : null; // Unknown/new palettes fail closed.
}

// Unlike AMeDAS's compact timestamp, JMA tile validtime/basetime are UTC.
export function parseJmaTemperatureTime(value) {
  if (typeof value !== "string" || !/^\d{14}$/.test(value)) return null;
  const stamp = Date.UTC(+value.slice(0,4), +value.slice(4,6)-1, +value.slice(6,8), +value.slice(8,10), +value.slice(10,12), +value.slice(12,14));
  if (!Number.isFinite(stamp)) return null;
  const iso = new Date(stamp).toISOString();
  return iso.replace(/[-:TZ.]/g, "").slice(0,14) === value ? iso : null;
}

export function selectJmaTemperatureFrame(records, now = Date.now()) {
  if (!Array.isArray(records)) return null;
  return records.flatMap(record => {
    const time = parseJmaTemperatureTime(record?.validtime);
    const base = parseJmaTemperatureTime(record?.basetime);
    if (!time || !base || record.basetime !== record.validtime || !Array.isArray(record.elements) || !record.elements.includes("temp")
      || (record.member && record.member !== "none")) return [];
    const age = now - Date.parse(time);
    return age >= 0 && age <= JMA_TEMPERATURE_MAX_AGE_MS
      ? [{ basetime: record.basetime, validtime: record.validtime, observationTime: time, baseTime: base }] : [];
  }).sort((a,b) => b.validtime.localeCompare(a.validtime))[0] ?? null;
}

export function jmaTemperatureTilePosition(coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lon, lat] = coordinates;
  if (![lon,lat].every(Number.isFinite) || lon < 118 || lon >= 150 || lat < 20 || lat >= 48) return null;
  // Use the containing 1 km mesh's centre, not a neighbouring raster pixel/label.
  const mesh = [Math.floor(lon*80), Math.floor(lat*120)];
  const centre = [(mesh[0]+.5)/80, (mesh[1]+.5)/120];
  // JMA's 512 px raster tiles use half the usual XYZ scale at native z=10.
  const x = (centre[0]+180)/360*512;
  const y = (1-Math.asinh(Math.tan(centre[1]*Math.PI/180))/Math.PI)/2*512;
  return { key: mesh.join("/"), coordinates: centre, tileX: Math.floor(x), tileY: Math.floor(y),
    pixelX: Math.floor((x-Math.floor(x))*512), pixelY: Math.floor((y-Math.floor(y))*512) };
}

export function createJmaTemperatureReader({ json = fetchJson, bytes = fetchArrayBuffer,
  pixel = (data,x,y) => readPngPixel(data,x,y,512), now = Date.now } = {}) {
  const tiles = new Map(), flights = new Map();
  async function tile(url, signal) {
    if (tiles.has(url)) return tiles.get(url);
    if (!flights.has(url)) {
      const request = bytes(url, { ttlMs: 0, retryCount: 0, staleIfError: false, timeoutMs: 8000 })
        .then(data => { tiles.set(url,data); while (tiles.size>4) tiles.delete(tiles.keys().next().value); return data; })
        .finally(() => flights.delete(url));
      flights.set(url,request);
    }
    const data = await flights.get(url);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return data;
  }
  return async (coordinates, { signal } = {}) => {
    const position = jmaTemperatureTilePosition(coordinates);
    if (!position) return { reason: "outside-coverage" };
    const records = await json(`${JMA_TEMPERATURE_ROOT}/targetTimes.json`, {
      ttlMs: 60000, cache: "no-store", staleIfError: false, retryCount: 0, signal
    });
    const frame = selectJmaTemperatureFrame(records, now());
    if (!frame) return { reason: "no-fresh-frame" };
    const url = `${JMA_TEMPERATURE_ROOT}/${frame.basetime}/none/${frame.validtime}/surf/temp/10/${position.tileX}/${position.tileY}.png`;
    const data = await tile(url,signal);
    const range = decodeJmaTemperaturePixel(await pixel(data,position.pixelX,position.pixelY));
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    if (now()-Date.parse(frame.observationTime)>JMA_TEMPERATURE_MAX_AGE_MS) return { reason: "no-fresh-frame" };
    return { ...frame, range, meshCoordinates: position.coordinates, retrievedAt: new Date(now()).toISOString(),
      reason: range ? null : "missing-mesh", sourceUrl: "https://www.jma.go.jp/bosai/suikei/#elem=temp" };
  };
}
