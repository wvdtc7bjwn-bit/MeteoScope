import { JMA_ENDPOINTS } from "../config.js";
import { fetchText, parseJmaTime } from "./jmaClient.js";

const WEATHER_CHART_TTL_MS = 10 * 60 * 1000;
const WEATHER_CHART_MAX_ENTRIES = 18;
const WEATHER_CHART_CODE_PATTERN = /_VZS[AF]\d{2}_/;
const WEATHER_CHART_TITLE_PATTERN = /地上(?:実況|予想)図|天気図/;
const ISOBAR_MIN_COORDINATES = 4;
const WEATHER_LINE_SMOOTH_SEGMENTS = 5;
const WEATHER_LINE_CLOSE_DISTANCE_DEG = 0.35;
const WEATHER_LINE_MAX_SMOOTH_SEGMENT_DEG = 3.5;
const WEATHER_LINE_MAX_COORDINATE_JUMP_DEG = 8;
const STATIONARY_FRONT_SEGMENT_DEG = 1.35;
const EMPTY_FEATURE_COLLECTION = Object.freeze({
  type: "FeatureCollection",
  features: Object.freeze([])
});

export async function fetchWeatherChart() {
  const feedXml = await fetchText(JMA_ENDPOINTS.weatherXmlFeed, { ttlMs: WEATHER_CHART_TTL_MS });
  const feedDoc = parseXml(feedXml);
  const entries = findWeatherChartEntries(feedDoc);
  if (!entries.length) throw new Error("Weather chart XML entry not found");

  const frames = (await Promise.all(entries.map((entry) => fetchWeatherChartFrame(entry).catch((error) => {
    console.warn("[Weather Viewer] weather chart frame load failed", entry.url, error);
    return null;
  }))))
    .filter((frame) => frame?.featureCount > 0)
    .sort(compareWeatherChartFrames);
  const uniqueFrames = dedupeWeatherChartFrames(frames);
  if (!uniqueFrames.length) throw new Error("Weather chart XML has no drawable features");

  return activateWeatherChartFrame({
    frames: uniqueFrames,
    frameCount: uniqueFrames.length,
    sourceUrl: uniqueFrames[uniqueFrames.length - 1]?.sourceUrl ?? "",
    publishedAt: uniqueFrames[uniqueFrames.length - 1]?.publishedAt ?? null
  }, findLatestWeatherChartFrameIndex(uniqueFrames));
}

export function activateWeatherChartFrame(weatherChart, index = 0) {
  const frames = Array.isArray(weatherChart?.frames) ? weatherChart.frames : [];
  const activeFrameIndex = clampIndex(index, frames.length);
  const activeFrame = frames[activeFrameIndex] ?? null;

  return {
    ...weatherChart,
    activeFrameIndex,
    activeFrame,
    lines: activeFrame?.lines ?? EMPTY_FEATURE_COLLECTION,
    points: activeFrame?.points ?? EMPTY_FEATURE_COLLECTION,
    featureCount: activeFrame?.featureCount ?? 0,
    latestTime: activeFrame?.latestTime ?? weatherChart?.latestTime ?? null,
    reportTime: activeFrame?.reportTime ?? weatherChart?.reportTime ?? null,
    targetTime: activeFrame?.targetTime ?? weatherChart?.targetTime ?? null,
    sourceUrl: activeFrame?.sourceUrl ?? weatherChart?.sourceUrl ?? "",
    publishedAt: activeFrame?.publishedAt ?? weatherChart?.publishedAt ?? null,
    chartKind: activeFrame?.chartKind ?? weatherChart?.chartKind ?? "analysis",
    title: activeFrame?.title ?? weatherChart?.title ?? ""
  };
}

async function fetchWeatherChartFrame(entry) {
  const chartXml = await fetchText(entry.url, { ttlMs: WEATHER_CHART_TTL_MS });
  const chartDoc = parseXml(chartXml);
  const parsed = parseWeatherChartXml(chartDoc);
  return {
    ...parsed,
    id: buildWeatherChartFrameId(entry, parsed),
    title: entry.title,
    chartKind: getWeatherChartKind(entry),
    sourceUrl: entry.url,
    publishedAt: entry.updatedAt,
    latestTime: parsed.targetTime ?? parsed.reportTime ?? entry.updatedAt
  };
}

function findWeatherChartEntries(doc) {
  return getElements(doc, "entry")
    .map((entry) => {
      const id = getText(getFirst(entry, "id"));
      const title = getText(getFirst(entry, "title"));
      const updated = getText(getFirst(entry, "updated"));
      const updatedAt = parseJmaTime(updated);
      const updatedTime = new Date(updated).getTime();
      const link = getElements(entry, "link")
        .map((element) => element.getAttribute("href"))
        .find(Boolean);
      return { id, title, updatedAt, updatedTime, url: link };
    })
    .filter(isWeatherChartEntry)
    .sort((a, b) => (Number.isFinite(b.updatedTime) ? b.updatedTime : 0) - (Number.isFinite(a.updatedTime) ? a.updatedTime : 0))
    .slice(0, WEATHER_CHART_MAX_ENTRIES);
}

function isWeatherChartEntry(entry) {
  if (!entry?.url) return false;
  const key = `${entry.id ?? ""} ${entry.title ?? ""} ${entry.url ?? ""}`;
  return WEATHER_CHART_TITLE_PATTERN.test(entry.title ?? "") || WEATHER_CHART_CODE_PATTERN.test(key);
}

function getWeatherChartKind(entry) {
  const key = `${entry.id ?? ""} ${entry.title ?? ""} ${entry.url ?? ""}`;
  return entry.title?.includes("予想") || /_VZSF\d{2}_/.test(key) ? "forecast" : "analysis";
}

function buildWeatherChartFrameId(entry, parsed) {
  const time = parsed.targetTime ?? parsed.reportTime ?? entry.updatedAt ?? "";
  const kind = getWeatherChartKind(entry);
  return `${kind}-${time || entry.url}`;
}

function compareWeatherChartFrames(a, b) {
  const kindDiff = getWeatherChartKindOrder(a) - getWeatherChartKindOrder(b);
  if (kindDiff !== 0) return kindDiff;

  const timeDiff = getFrameTime(a) - getFrameTime(b);
  if (timeDiff !== 0) return timeDiff;

  return String(a?.id ?? a?.sourceUrl ?? "").localeCompare(String(b?.id ?? b?.sourceUrl ?? ""));
}

function dedupeWeatherChartFrames(frames) {
  const map = new Map();
  frames.forEach((frame) => {
    const key = `${frame.chartKind}-${frame.latestTime ?? frame.reportTime ?? frame.sourceUrl}`;
    const existing = map.get(key);
    if (!existing || (frame.featureCount ?? 0) >= (existing.featureCount ?? 0)) {
      map.set(key, frame);
    }
  });
  return [...map.values()].sort(compareWeatherChartFrames);
}

export function findLatestWeatherChartFrameIndex(frames = []) {
  const latestAnalysisIndex = findLatestWeatherChartFrameIndexByKind(frames, "analysis");
  if (latestAnalysisIndex >= 0) return latestAnalysisIndex;

  const now = Date.now() + 5 * 60 * 1000;
  let latestIndex = -1;
  frames.forEach((frame, index) => {
    const time = getFrameTime(frame);
    if (Number.isFinite(time) && time <= now) latestIndex = index;
  });
  return latestIndex >= 0 ? latestIndex : Math.max(0, frames.length - 1);
}

function findLatestWeatherChartFrameIndexByKind(frames = [], kind) {
  const now = Date.now() + 5 * 60 * 1000;
  let latestIndex = -1;
  frames.forEach((frame, index) => {
    if (frame?.chartKind !== kind) return;
    const time = getFrameTime(frame);
    if (Number.isFinite(time) && time <= now) latestIndex = index;
  });
  return latestIndex;
}

function getWeatherChartKindOrder(frame) {
  return frame?.chartKind === "forecast" ? 1 : 0;
}

function getFrameTime(frame) {
  const time = new Date(frame?.latestTime ?? frame?.targetTime ?? frame?.reportTime ?? frame?.publishedAt ?? "").getTime();
  return Number.isFinite(time) ? time : 0;
}

function clampIndex(index, length) {
  if (!length) return 0;
  return Math.max(0, Math.min(length - 1, Number(index) || 0));
}

function parseWeatherChartXml(doc) {
  const reportTime = parseJmaTime(getText(getFirst(doc, "ReportDateTime")));
  const headTargetTime = parseJmaTime(getText(getFirst(doc, "TargetDateTime")));
  const targetTime = parseWeatherChartValidTime(doc) ?? headTargetTime;
  const lineFeatures = [];
  const pointFeatures = [];

  getElements(doc, "Property").forEach((property, index) => {
    const type = getText(getFirst(property, "Type"));
    if (!type) return;

    if (type.includes("等圧線")) {
      parseIsobar(property, index).forEach((feature) => lineFeatures.push(feature));
      return;
    }

    if (type.includes("前線")) {
      parseFront(property, type, index).forEach((feature) => lineFeatures.push(feature));
      return;
    }

    if (type.includes("高気圧") || type.includes("低気圧") || type.includes("台風")) {
      const feature = parsePressureCenter(property, type, index);
      if (feature) pointFeatures.push(feature);
    }
  });

  return {
    reportTime,
    targetTime,
    lines: {
      type: "FeatureCollection",
      features: lineFeatures
    },
    points: {
      type: "FeatureCollection",
      features: pointFeatures
    },
    featureCount: lineFeatures.length + pointFeatures.length
  };
}

function parseWeatherChartValidTime(doc) {
  const meteorologicalInfo = getElements(doc, "MeteorologicalInfo")[0] ?? null;
  if (!meteorologicalInfo) return null;

  const dateTimeElement = [...meteorologicalInfo.childNodes]
    .find((node) => node.nodeType === 1 && node.localName === "DateTime");
  return parseJmaTime(getText(dateTimeElement)) || null;
}

function parseIsobar(property, baseIndex) {
  return getElements(property, "IsobarPart")
    .flatMap((part, index) => {
      const pressure = getText(getFirst(part, "Pressure"));
      return splitWeatherLineSegments(parseLineCoordinates(part))
        .map((segment) => prepareWeatherLineCoordinates(segment, {
          minCoordinates: ISOBAR_MIN_COORDINATES,
          smoothSegments: WEATHER_LINE_SMOOTH_SEGMENTS
        }))
        .filter(shouldRenderIsobarLine)
        .map((coordinates, segmentIndex) => ({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates
          },
          properties: {
            id: `isobar-${baseIndex}-${index}-${segmentIndex}`,
            kind: "isobar",
            pressure,
            label: pressure ? `${pressure}hPa` : ""
          }
        }));
    });
}

function parseFront(property, type, baseIndex) {
  const parts = getElements(property, "FrontPart");
  const coordinateParts = parts.length > 0 ? parts : getElements(property, "CoordinatePart");
  const frontKind = getFrontKind(type);

  return coordinateParts
    .flatMap((part, index) => {
      return splitWeatherLineSegments(parseLineCoordinates(part))
        .map((segment) => prepareWeatherLineCoordinates(segment, {
          minCoordinates: 2,
          smoothSegments: 6
        }))
        .filter((coordinates) => coordinates.length >= 2)
        .flatMap((coordinates, segmentIndex) => buildFrontFeatures(coordinates, {
          idPrefix: `front-${baseIndex}-${index}-${segmentIndex}`,
          type,
          frontKind
        }));
    });
}

function buildFrontFeatures(coordinates, options) {
  if (options.frontKind !== "stationary") {
    return [createFrontFeature(coordinates, {
      id: options.idPrefix,
      type: options.type,
      frontStyle: options.frontKind,
      frontSymbol: options.frontKind
    })];
  }

  return splitFrontByDistance(coordinates, STATIONARY_FRONT_SEGMENT_DEG)
    .map((segment, index) => {
      const frontStyle = index % 2 === 0 ? "stationary-warm" : "stationary-cold";
      const frontSymbol = index % 2 === 0 ? "warm" : "cold";
      return createFrontFeature(segment, {
        id: `${options.idPrefix}-${index}`,
        type: options.type,
        frontStyle,
        frontSymbol
      });
    })
    .filter(Boolean);
}

function createFrontFeature(coordinates, properties) {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates
    },
    properties: {
      id: properties.id,
      kind: "front",
      frontType: properties.type,
      frontStyle: properties.frontStyle,
      frontSymbol: properties.frontSymbol,
      label: properties.type
    }
  };
}

function getFrontKind(type) {
  if (type.includes("寒冷前線")) return "cold";
  if (type.includes("温暖前線")) return "warm";
  if (type.includes("閉塞前線")) return "occluded";
  if (type.includes("停滞前線")) return "stationary";
  return "front";
}

function parsePressureCenter(property, type, index) {
  const point = getPressureCenterPoint(property);
  if (!point) return null;

  const pressure = getText(getFirst(property, "Pressure"));
  const kind = type.includes("高気圧") ? "high" : type.includes("台風") ? "typhoon" : "low";
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: point
    },
    properties: {
      id: `pressure-${kind}-${index}`,
      kind,
      label: getPressureCenterLabel(kind),
      pressure,
      pressureLabel: pressure ? `${pressure}hPa` : ""
    }
  };
}

function getPressureCenterPoint(property) {
  return [
    ...getElements(property, "BasePoint"),
    ...getElements(property, "Coordinate")
  ]
    .map(parseCoordinateElement)
    .find(Boolean);
}

function getPressureCenterLabel(kind) {
  if (kind === "high") return "高";
  if (kind === "typhoon") return "台";
  return "低";
}

function parseLineCoordinates(root) {
  return getElements(root, "Line")
    .flatMap((line) => parseCoordinateList(getText(line)))
    .filter((coordinate) => Array.isArray(coordinate));
}

function prepareWeatherLineCoordinates(coordinates, options = {}) {
  const minCoordinates = options.minCoordinates ?? 2;
  const points = removeConsecutiveDuplicateCoordinates(coordinates);
  if (points.length < minCoordinates) return [];
  return smoothWeatherLine(points, options.smoothSegments ?? WEATHER_LINE_SMOOTH_SEGMENTS);
}

function splitWeatherLineSegments(coordinates) {
  const segments = [];
  let current = [];

  coordinates.forEach((coordinate) => {
    const previous = current[current.length - 1];
    if (previous && shouldSplitWeatherLine(previous, coordinate)) {
      if (current.length >= 2) segments.push(current);
      current = [coordinate];
      return;
    }
    current.push(coordinate);
  });

  if (current.length >= 2) segments.push(current);
  return segments;
}

function splitFrontByDistance(coordinates, maxSegmentDistance) {
  const segments = [];
  let current = [coordinates[0]];
  let currentDistance = 0;

  for (let index = 1; index < coordinates.length; index += 1) {
    const previous = coordinates[index - 1];
    const point = coordinates[index];
    const distance = getCoordinateDistance(previous, point);
    current.push(point);
    currentDistance += distance;

    if (currentDistance >= maxSegmentDistance && current.length >= 2) {
      segments.push(current);
      current = [point];
      currentDistance = 0;
    }
  }

  if (current.length >= 2) segments.push(current);
  return segments.length > 0 ? segments : [coordinates];
}

function shouldSplitWeatherLine(previous, next) {
  return (
    Math.abs(Number(previous[0]) - Number(next[0])) > WEATHER_LINE_MAX_COORDINATE_JUMP_DEG ||
    Math.abs(Number(previous[1]) - Number(next[1])) > WEATHER_LINE_MAX_COORDINATE_JUMP_DEG
  );
}

function shouldRenderIsobarLine(coordinates) {
  if (coordinates.length < ISOBAR_MIN_COORDINATES) return false;

  const bounds = getCoordinateBounds(coordinates);
  const spanLng = bounds.maxLng - bounds.minLng;
  const spanLat = bounds.maxLat - bounds.minLat;
  const length = getLineDistance(coordinates);

  if (length < 0.3) return false;
  return !(spanLat < 0.08 && spanLng > 6);
}

function smoothWeatherLine(points, segments) {
  if (points.length < 4 || segments <= 1) return points;

  const closed = isClosedLine(points);
  const base = closed ? points.slice(0, -1) : points;
  if (base.length < 4) return points;

  const smoothed = [];
  const count = base.length;

  for (let index = 0; index < count - (closed ? 0 : 1); index += 1) {
    const p0 = base[closed ? (index - 1 + count) % count : Math.max(0, index - 1)];
    const p1 = base[index];
    const p2 = base[(index + 1) % count];
    const p3 = base[closed ? (index + 2) % count : Math.min(count - 1, index + 2)];

    if (index === 0) smoothed.push(p1);

    if (getCoordinateDistance(p1, p2) > WEATHER_LINE_MAX_SMOOTH_SEGMENT_DEG) {
      smoothed.push(p2);
      continue;
    }

    for (let step = 1; step <= segments; step += 1) {
      smoothed.push(catmullRomPoint(p0, p1, p2, p3, step / segments));
    }
  }

  if (closed) smoothed.push(smoothed[0]);
  return removeConsecutiveDuplicateCoordinates(smoothed);
}

function catmullRomPoint(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)
  ];
}

function removeConsecutiveDuplicateCoordinates(coordinates) {
  return coordinates.filter((coordinate, index) => {
    if (!Array.isArray(coordinate)) return false;
    if (index === 0) return true;
    return getCoordinateDistance(coordinate, coordinates[index - 1]) > 0.00001;
  });
}

function isClosedLine(points) {
  return getCoordinateDistance(points[0], points[points.length - 1]) <= WEATHER_LINE_CLOSE_DISTANCE_DEG;
}

function getCoordinateDistance(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
  return Math.hypot(Number(a[0]) - Number(b[0]), Number(a[1]) - Number(b[1]));
}

function getLineDistance(points) {
  return points.slice(1).reduce((sum, point, index) => sum + getCoordinateDistance(points[index], point), 0);
}

function getCoordinateBounds(points) {
  return points.reduce((bounds, point) => ({
    minLng: Math.min(bounds.minLng, point[0]),
    maxLng: Math.max(bounds.maxLng, point[0]),
    minLat: Math.min(bounds.minLat, point[1]),
    maxLat: Math.max(bounds.maxLat, point[1])
  }), {
    minLng: Infinity,
    maxLng: -Infinity,
    minLat: Infinity,
    maxLat: -Infinity
  });
}

function parseCoordinateElement(element) {
  if (!element) return null;
  return parseCoordinateList(getText(element))[0] ?? null;
}

function parseCoordinateList(value) {
  if (!value) return [];
  const coordinates = [];
  const matches = String(value).matchAll(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/g);
  for (const match of matches) {
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    coordinates.push([lng, lat]);
  }
  return coordinates;
}

function parseXml(xml) {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const error = doc.querySelector("parsererror");
  if (error) throw new Error("Failed to parse weather chart XML");
  return doc;
}

function getElements(root, localName) {
  return [...root.getElementsByTagName("*")].filter((element) => element.localName === localName);
}

function getFirst(root, localName) {
  return getElements(root, localName)[0] ?? null;
}

function getText(element) {
  return element?.textContent?.trim() ?? "";
}
