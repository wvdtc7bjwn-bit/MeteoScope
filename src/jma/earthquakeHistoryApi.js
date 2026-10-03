export const JMA_EARTHQUAKE_INTENSITY_API_URL = "https://www.data.jma.go.jp/eqdb/data/shindo/api/";
export const JMA_EARTHQUAKE_HISTORY_SOURCE_URL = "https://www.data.jma.go.jp/eqdb/data/shindo/";

export const JMA_HISTORY_INTENSITIES = Object.freeze({ "1": "1", "2": "2", "3": "3", "4": "4", "5-": "A", "5+": "B", "6-": "C", "6+": "D", "7": "7" });
export const JMA_HISTORY_SORTS = Object.freeze({ newest: "S0", oldest: "S1", intensity: "S2", magnitude: "S3" });

export function validateJmaHistoryConditions(value = {}) {
  const minIntensity = String(value.minIntensity ?? "1");
  const minMagnitude = String(value.minMagnitude ?? "0");
  const maxDepth = String(value.maxDepth ?? "all");
  const sort = String(value.sort ?? "newest");
  const keyword = String(value.keyword ?? "").trim();
  if (!Object.hasOwn(JMA_HISTORY_INTENSITIES, minIntensity)
    || !/^\d(?:\.\d)?$/u.test(minMagnitude) || Number(minMagnitude) > 9.9
    || (maxDepth !== "all" && (!/^\d{1,3}$/u.test(maxDepth) || Number(maxDepth) > 999))
    || !Object.hasOwn(JMA_HISTORY_SORTS, sort) || keyword.length > 40 || /[\u0000-\u001f]/u.test(keyword)) {
    throw new TypeError("検索条件が不正です");
  }
  const hasNearby = value.nearby || value.nearbyLat !== undefined || value.nearbyLon !== undefined || value.nearbyRadiusKm !== undefined;
  const nearby = !hasNearby
    ? null
    : {
      latitude: Number(value.nearby?.latitude ?? value.nearbyLat),
      longitude: Number(value.nearby?.longitude ?? value.nearbyLon),
      radiusKm: Number(value.nearby?.radiusKm ?? value.nearbyRadiusKm)
    };
  if (nearby && (!Number.isFinite(nearby.latitude) || nearby.latitude < -90 || nearby.latitude > 90
    || !Number.isFinite(nearby.longitude) || nearby.longitude < -180 || nearby.longitude > 180
    || !Number.isInteger(nearby.radiusKm) || nearby.radiusKm < 10 || nearby.radiusKm > 300)) {
    throw new TypeError("近傍検索の条件が不正です");
  }
  return { minIntensity, minMagnitude: String(Number(minMagnitude)), maxDepth: maxDepth === "all" ? "all" : String(Number(maxDepth)), sort, keyword, nearby };
}

export function isJmaHistoryDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(String(value ?? ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function buildJmaIntensitySearchForm(startDate, endDate, startTime = "00:00", endTime = "23:59", conditions = {}) {
  const filters = validateJmaHistoryConditions(conditions);
  const form = new FormData();
  [
    ["mode", "search"],
    ["dateTimeF[]", startDate], ["dateTimeF[]", startTime],
    ["dateTimeT[]", endDate], ["dateTimeT[]", endTime],
    ["mag[]", Number(filters.minMagnitude).toFixed(1)], ["mag[]", "9.9"], ["dep[]", "000"], ["dep[]", filters.maxDepth === "all" ? "999" : filters.maxDepth.padStart(3, "0")],
    ["epi[]", "99"], ["pref[]", "99"], ["city[]", "99"], ["station[]", "99"],
    ["obsInt", "1"], ["maxInt", JMA_HISTORY_INTENSITIES[filters.minIntensity]], ["additionalC", filters.minIntensity !== "1" || Number(filters.minMagnitude) > 0 || filters.maxDepth !== "all" || Boolean(filters.nearby) ? "true" : "false"],
    ["Sort", JMA_HISTORY_SORTS[filters.sort]], ["Comp", "C0"], ["seisCount", "false"], ["observed", "false"]
  ].forEach(([key, value]) => form.append(key, value));
  if (filters.nearby) {
    const points = buildNearbySearchPolygon(filters.nearby);
    points.forEach(([latitude, longitude], index) => {
      form.append(`boundsAr[${index}][]`, latitude.toFixed(5));
      form.append(`boundsAr[${index}][]`, longitude.toFixed(5));
    });
  }
  return form;
}

export function buildNearbySearchPolygon({ latitude, longitude, radiusKm }, vertices = 32) {
  // A slightly circumscribed polygon avoids dropping points near the circle edge;
  // the client applies the exact great-circle radius after this upstream prefilter.
  const angularDistance = radiusKm / (6371.0088 * Math.cos(Math.PI / vertices));
  const latitudeRadians = latitude * Math.PI / 180;
  return Array.from({ length: vertices }, (_, index) => {
    const bearing = 2 * Math.PI * index / vertices;
    const pointLatitude = Math.asin(Math.sin(latitudeRadians) * Math.cos(angularDistance)
      + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearing));
    const pointLongitude = longitude * Math.PI / 180 + Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
      Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(pointLatitude)
    );
    return [pointLatitude * 180 / Math.PI, ((pointLongitude * 180 / Math.PI + 540) % 360) - 180];
  });
}

export function isCoordinateWithinRadius(coordinates, center, radiusKm) {
  if (!Array.isArray(coordinates) || coordinates.length < 2 || !Array.isArray(center) || center.length < 2) return false;
  const [longitude, latitude] = coordinates.map(Number);
  const [centerLongitude, centerLatitude] = center.map(Number);
  if (![longitude, latitude, centerLongitude, centerLatitude, Number(radiusKm)].every(Number.isFinite)) return false;
  const radians = (degrees) => degrees * Math.PI / 180;
  const latitudeDelta = radians(centerLatitude - latitude);
  const longitudeDelta = radians(centerLongitude - longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(radians(latitude)) * Math.cos(radians(centerLatitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= Number(radiusKm);
}

export function normalizeJmaEarthquakeOriginTime(value) {
  const match = String(value ?? "").match(/^(\d{4})\/(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/u);
  if (!match) return "";
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? "00"}+09:00`;
}

export function normalizeJmaEarthquakeIntensity(value) {
  return String(value ?? "")
    .replace(/^震度/u, "")
    .replace(/[０-９]/gu, (digit) => String("０１２３４５６７８９".indexOf(digit)))
    .replace("弱", "-")
    .replace("強", "+")
    .trim() || "felt";
}

export function splitJmaEarthquakeDateRange(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  const middle = start + Math.floor((end - start) / (2 * 86_400_000)) * 86_400_000;
  return [formatUtcDate(middle), formatUtcDate(middle + 86_400_000)];
}

function formatUtcDate(timestamp) {
  return new Date(timestamp).toISOString().slice(0, 10);
}
