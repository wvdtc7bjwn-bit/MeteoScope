import { JMA_ENDPOINTS } from "../config.js";
import { fetchJson } from "./jmaClient.js";

export async function fetchTyphoonList() {
  let typhoons = null;
  let unavailable = false;

  try {
    typhoons = await fetchJson(JMA_ENDPOINTS.typhoon);
  } catch (error) {
    console.warn("[Weather Viewer] typhoon data unavailable", error);
    unavailable = true;
  }

  const count = Array.isArray(typhoons) ? typhoons.length : Object.keys(typhoons ?? {}).length;
  const details = extractTyphoonDetails(typhoons);

  return {
    raw: typhoons,
    details,
    unavailable,
    summary: buildSummary(count, unavailable),
    updatedAt: unavailable ? "未取得" : "取得済み"
  };
}

function buildSummary(count, unavailable) {
  if (unavailable) return "台風データを取得できません";
  return count > 0 ? `台風データ ${count} 件` : "現在表示できる台風データはありません";
}

function extractTyphoonDetails(raw) {
  const typhoon = findDetailSource(raw);
  if (!typhoon) return buildEmptyDetails("未取得");

  const lat = pickValue(typhoon, ["lat", "latitude", "centerLat", "centerLatitude", "中心緯度"]);
  const lng = pickValue(typhoon, ["lon", "lng", "longitude", "centerLon", "centerLng", "centerLongitude", "中心経度"]);
  const positionText = pickValue(typhoon, ["center", "position", "centerPosition", "location", "中心位置"]);

  return {
    name: formatPlain(pickValue(typhoon, ["name", "typhoonName", "stormName", "japaneseName", "台風名", "名称"])),
    pressure: formatWithUnit(pickValue(typhoon, ["pressure", "centralPressure", "centerPressure", "pres", "中心気圧"]), "hPa"),
    maxWind: formatWithUnit(pickValue(typhoon, ["maxWind", "maximumWind", "maxWindSpeed", "wind", "最大風速"]), "m/s"),
    maxGust: formatWithUnit(pickValue(typhoon, ["maxGust", "maximumGust", "maxInstantWind", "gust", "最大瞬間風速"]), "m/s"),
    direction: formatPlain(pickValue(typhoon, ["direction", "moveDirection", "movingDirection", "移動方向"])),
    speed: formatWithUnit(pickValue(typhoon, ["speed", "moveSpeed", "movingSpeed", "移動速度"]), "km/h"),
    position: formatPosition(lat, lng, positionText)
  };
}

function buildEmptyDetails(value) {
  return {
    name: value,
    pressure: value,
    maxWind: value,
    maxGust: value,
    direction: value,
    speed: value,
    position: value
  };
}

function findDetailSource(raw) {
  const items = flattenCandidates(raw);
  return items.find((item) => hasAnyKey(item, [
    "name", "typhoonName", "stormName", "japaneseName", "台風名", "名称",
    "pressure", "centralPressure", "centerPressure", "pres", "中心気圧",
    "maxWind", "maximumWind", "maxWindSpeed", "最大風速",
    "lat", "latitude", "lon", "lng", "longitude"
  ])) ?? items[0] ?? null;
}

function flattenCandidates(value) {
  if (!value || typeof value !== "object") return [];
  if (Array.isArray(value)) return value.flatMap(flattenCandidates);

  const children = ["typhoons", "items", "data", "storms", "report", "analysis", "current", "center"]
    .flatMap((key) => flattenCandidates(value[key]));

  return [value, ...children];
}

function hasAnyKey(object, keys) {
  return keys.some((key) => object?.[key] !== undefined);
}

function pickValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function formatWithUnit(value, unit) {
  if (value === null) return "未取得";
  const text = String(value);
  return text.includes(unit) ? text : `${text} ${unit}`;
}

function formatPlain(value) {
  return value === null ? "未取得" : String(value);
}

function formatPosition(lat, lng, fallback) {
  if (fallback !== null && fallback !== undefined && fallback !== "") return String(fallback);
  if (lat !== null && lng !== null) return `${lat}, ${lng}`;
  return "未取得";
}
