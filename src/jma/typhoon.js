import { fetchXml, parseJmaTime } from "./jmaClient.js";
import {
  attrOf,
  childrenByName,
  descendantsByName,
  fetchLatestTyphoonXmlDocuments,
  firstChildByName,
  firstDescendantByName,
  textOf
} from "./xmlFeed.js";

export const NO_TYPHOON_MESSAGE = "現在、台風情報は発表されていません";

const PAST_TYPHOON_TELEGRAMS = {
  "20260531-1545": "/data/typhoon-telegram-20260531-1545.xml"
};

export async function fetchTyphoonList() {
  let raw = null;
  let unavailable = false;

  try {
    raw = await fetchTyphoonDetailData();
  } catch (error) {
    console.warn("[Weather Viewer] typhoon data unavailable", error);
    unavailable = true;
  }

  return buildTyphoonResponse(raw, unavailable);
}

export async function fetchPastTyphoonTelegram(id) {
  const url = PAST_TYPHOON_TELEGRAMS[id];
  if (!url) throw new Error(`Unknown typhoon telegram: ${id}`);
  const document = await fetchXml(url);
  return {
    ...buildTyphoonResponse([parseTyphoonXmlDocument(document)], false),
    isPastTelegram: true,
    telegramId: id,
    summary: `過去実電文 ${id}`
  };
}

async function fetchTyphoonDetailData() {
  const documents = await fetchLatestTyphoonXmlDocuments();
  return documents.map(parseTyphoonXmlDocument).filter(Boolean);
}

function buildTyphoonResponse(raw, unavailable) {
  const typhoons = normalizeTyphoons(raw);
  const hasTyphoon = typhoons.length > 0;
  const details = hasTyphoon ? typhoons[0].details : buildEmptyDetails(NO_TYPHOON_MESSAGE);

  return {
    raw,
    typhoons,
    details,
    hasTyphoon,
    unavailable,
    summary: buildSummary(typhoons.length, unavailable),
    latestTime: hasTyphoon ? typhoons[0].updatedAt : "発表なし",
    updatedAt: unavailable ? "未取得" : (hasTyphoon ? typhoons[0].updatedAt : "発表なし")
  };
}

function buildSummary(count, unavailable) {
  if (unavailable) return "台風データを取得できません";
  return count > 0 ? `台風情報 ${count} 件` : NO_TYPHOON_MESSAGE;
}

function normalizeTyphoons(raw) {
  const items = Array.isArray(raw)
    ? raw
    : raw?.targetTc ?? raw?.typhoons ?? raw?.items ?? raw?.data ?? [];

  return items
    .map((item, index) => normalizeTyphoon(item, index))
    .filter(Boolean);
}

function parseTyphoonXmlDocument(document) {
  const report = document.documentElement;
  const head = firstChildByName(report, "Head");
  const body = firstChildByName(report, "Body");
  const title = textOf(firstChildByName(head, "Title"));
  const reportDateTime = textOf(firstChildByName(head, "ReportDateTime"));
  const meteorologicalInfos = descendantsByName(body, "MeteorologicalInfo");
  const points = meteorologicalInfos.map(parseTyphoonMeteorologicalInfo).filter(Boolean);
  if (points.length === 0) return null;

  const current = points.find((point) => point.kind === "実況")
    ?? points.find((point) => !point.forecastCircle)
    ?? points[0];
  const forecasts = points.filter((point) => point !== current && point.center);
  const forecastCircles = points
    .filter((point) => point.forecastCircle)
    .map((point) => ({
      center: point.forecastCircle.center,
      radius: point.forecastCircle.radius,
      label: point.label
    }));
  const stormWarningArea = points
    .filter((point) => point.stormWarningCircle)
    .map((point) => ({
      center: point.stormWarningCircle.center,
      radius: point.stormWarningCircle.radius,
      axes: point.stormWarningCircle.axes,
      label: point.label
    }));
  const stormWarningGroups = buildXmlStormWarningGroups(points, current);
  const track = points
    .filter((point) => point.kind === "経路" || point.kind === "実況")
    .map((point) => point.center)
    .filter(Boolean);
  const forecastTrack = [
    current.center,
    ...forecasts.map((point) => point.center)
  ].filter(Boolean);
  const details = current.details;
  const name = pickXmlTyphoonName(report, title);

  return {
    sourceFormat: "xml",
    id: textOf(firstDescendantByName(report, "Identifier")) || title || `xml-typhoon-${reportDateTime}`,
    name,
    center: current.center,
    track,
    forecastTrack,
    forecastCircles,
    stormWarningArea,
    stormWarningGroups,
    strongWindRadius: current.strongWindRadius,
    stormRadius: current.stormRadius,
    details: {
      name,
      pressure: formatWithUnit(details.pressure, "hPa"),
      maxWind: formatWithUnit(details.maxWind, "m/s"),
      maxGust: formatWithUnit(details.maxGust, "m/s"),
      direction: formatPlain(details.direction),
      speed: formatWithUnit(details.speed, "km/h"),
      position: formatPosition(current.center, details.position)
    },
    updatedAt: formatTime(reportDateTime)
  };
}

function buildXmlStormWarningGroups(points, current) {
  const groups = [];
  let group = [];

  const flush = () => {
    if (group.some((circle) => circle.kind === "stormWarning")) {
      groups.push(group);
    }
    group = [];
  };

  points.forEach((point) => {
    const currentStormCircle = point === current ? makeCurrentStormCircle(point) : null;
    const stormWarningCircle = makeStormWarningCircle(point);

    if (!currentStormCircle && !stormWarningCircle) {
      flush();
      return;
    }

    if (currentStormCircle) {
      group.push(currentStormCircle);
    }

    if (stormWarningCircle && !isSameCircle(currentStormCircle, stormWarningCircle)) {
      group.push(stormWarningCircle);
    }
  });

  flush();
  return groups;
}

function makeCurrentStormCircle(point) {
  if (!point?.center?.length || !Number.isFinite(point.stormRadius) || point.stormRadius <= 0) return null;
  return {
    kind: "currentStorm",
    center: point.center,
    radius: point.stormRadius,
    label: "暴風域"
  };
}

function makeStormWarningCircle(point) {
  if (!point?.stormWarningCircle?.center || !Number.isFinite(point.stormWarningCircle.radius)) return null;
  return {
    kind: "stormWarning",
    center: point.stormWarningCircle.center,
    radius: point.stormWarningCircle.radius,
    axes: point.stormWarningCircle.axes,
    label: point.label
  };
}

function isSameCircle(a, b) {
  if (!a || !b) return false;
  return Math.abs(a.radius - b.radius) < 0.001
    && Math.abs(a.center[0] - b.center[0]) < 0.0001
    && Math.abs(a.center[1] - b.center[1]) < 0.0001;
}

function parseTyphoonMeteorologicalInfo(info) {
  const item = firstDescendantByName(info, "Item");
  const centerKind = findKindByPropertyType(info, "中心") ?? findKindByPropertyType(info, "位置");
  const centerProperty = firstChildByName(centerKind, "Property") ?? firstDescendantByName(centerKind, "Property");
  const centerPart = firstDescendantByName(centerProperty, "CenterPart") ?? centerProperty;
  const center = readTypedPoint(centerPart, "中心位置（度）")
    ?? readTypedPoint(centerPart, "中心位置")
    ?? readTypedPoint(centerProperty, "中心位置（度）")
    ?? readTypedPoint(centerProperty, "中心位置")
    ?? normalizePoint(textOf(firstDescendantByName(centerPart, "Coordinate")));
  if (!center) return null;

  const time = textOf(firstDescendantByName(info, "DateTime"))
    || textOf(firstDescendantByName(info, "TargetDateTime"))
    || textOf(firstDescendantByName(item, "DateTime"));
  const propertyType = textOf(firstChildByName(centerProperty, "Type"));
  const typeText = `${attrOf(info, "type")} ${propertyType}`;
  const forecastCircle = readProbabilityCircle(centerPart, "予報円") ?? readProbabilityCircle(centerProperty, "予報円");
  const stormWarningCircle = readProbabilityCircle(centerPart, "暴風警戒域")
    ?? readProbabilityCircle(centerProperty, "暴風警戒域")
    ?? readWarningAreaCircle(info, center, "暴風警戒域");
  const strongWindRadius = readAreaRadius(info, ["強風域", "強風警戒域"]);
  const stormRadius = readAreaRadius(info, ["暴風域"]);

  return {
    kind: /経路|過去/.test(typeText) ? "経路" : (/実況|解析/.test(typeText) || !forecastCircle ? "実況" : "予報"),
    label: formatForecastTimeLabel(time),
    center,
    forecastCircle,
    stormWarningCircle,
    strongWindRadius,
    stormRadius,
    details: {
      pressure: readTypedScalar(info, ["中心気圧", "気圧"], ["hPa"]),
      maxWind: readTypedScalar(info, ["最大風速"], ["m/s"]),
      maxGust: readTypedScalar(info, ["最大瞬間風速"], ["m/s"]),
      direction: readTypedScalar(info, ["移動方向", "進行方向"]),
      speed: readTypedScalar(info, ["移動速度", "速さ"], ["km/h"]),
      position: textOf(firstDescendantByName(centerPart, "Location"))
    }
  };
}

function findKindByPropertyType(node, expectedType) {
  return descendantsByName(node, "Kind").find((kind) => {
    const property = firstChildByName(kind, "Property") ?? firstDescendantByName(kind, "Property");
    return normalizedText(textOf(firstChildByName(property, "Type"))).includes(normalizedText(expectedType));
  }) ?? null;
}

function readProbabilityCircle(centerPart, expectedType) {
  const circle = descendantsByName(centerPart, "ProbabilityCircle")
    .find((entry) => hasType(entry, expectedType) || normalizedText(textOf(firstChildByName(entry, "Type"))).includes(normalizedText(expectedType)));
  if (!circle) return null;

  const center = readTypedPoint(circle, "中心位置（度）")
    ?? readTypedPoint(circle, "中心位置")
    ?? normalizePoint(textOf(firstDescendantByName(circle, "BasePoint")));
  const radius = normalizeRadius(textOf(firstDescendantByName(circle, "Radius")));
  if (!center || !Number.isFinite(radius)) return null;
  return { center, radius };
}

function readAreaRadius(node, typeNames) {
  const area = [
    ...descendantsByName(node, "WarningAreaPart"),
    ...descendantsByName(node, "Area"),
    ...descendantsByName(node, "Circle")
  ]
    .find((entry) => typeNames.some((typeName) => hasType(entry, typeName)));
  const radius = pickLargestKmRadius(area);
  return Number.isFinite(radius) ? radius : null;
}

function readWarningAreaCircle(node, center, expectedType) {
  const warningArea = descendantsByName(node, "WarningAreaPart")
    .find((entry) => hasType(entry, expectedType));
  const radius = pickLargestKmRadius(warningArea);
  if (!center || !Number.isFinite(radius) || radius <= 0) return null;
  const axes = readWarningAreaAxes(warningArea);
  return { center, radius, axes };
}

function readWarningAreaAxes(warningArea) {
  return descendantsByName(warningArea, "Axis")
    .map((axis) => {
      const direction = textOf(firstDescendantByName(axis, "Direction"));
      const radius = pickLargestKmRadius(axis);
      if (!Number.isFinite(radius) || radius <= 0) return null;
      return {
        direction,
        radius,
        bearing: directionToBearing(direction)
      };
    })
    .filter(Boolean);
}

function readTypedPoint(node, expectedType) {
  const basePoint = descendantsByName(node, "BasePoint")
    .find((entry) => hasType(entry, expectedType));
  return normalizePoint(textOf(basePoint));
}

function readTypedScalar(node, expectedTypes, preferredUnits = []) {
  const typedElements = allDescendants(node)
    .filter((entry) => expectedTypes.some((typeName) => hasType(entry, typeName)));
  const typedElement = pickPreferredUnitElement(typedElements, preferredUnits);
  if (typedElement) return textOf(typedElement);

  const typedByAttr = descendantsByName(node, "Property")
    .find((entry) => expectedTypes.some((typeName) => normalizedText(textOf(firstChildByName(entry, "Type"))).includes(normalizedText(typeName))));
  if (typedByAttr) return textOf(firstDescendantByName(typedByAttr, "Text")) || textOf(typedByAttr);

  const candidates = descendantsByName(node, "Kind")
    .filter((kind) => expectedTypes.some((typeName) => normalizedText(textOf(firstChildByName(firstChildByName(kind, "Property"), "Type"))).includes(normalizedText(typeName))));
  return candidates.length ? textOf(candidates[0]) : null;
}

function pickXmlTyphoonName(report, title) {
  const typhoonNamePart = firstDescendantByName(report, "TyphoonNamePart");
  if (typhoonNamePart) {
    const name = textOf(firstChildByName(typhoonNamePart, "Name"));
    const kana = textOf(firstChildByName(typhoonNamePart, "NameKana"));
    const number = textOf(firstChildByName(typhoonNamePart, "Number")).slice(-2).replace(/^0/, "");
    if (number && name) return `台風第${Number(number)}号 (${name})`;
    if (number && kana) return `台風第${Number(number)}号 (${kana})`;
    if (name) return name;
    if (kana) return kana;
  }

  const name = descendantsByName(report, "Name")
    .map(textOf)
    .find((value) => /台風|T[0-9]|号/.test(value));
  if (name) return name;

  const headline = textOf(firstDescendantByName(report, "Text"));
  const headlineName = headline.match(/(?:令和\d+年)?台風第\d+号(?:\([^)]+\))?/)?.[0];
  if (headlineName) return headlineName;

  return title || "台風情報";
}

function allDescendants(node) {
  const matches = [];
  const visit = (current) => {
    [...(current?.children ?? [])].forEach((child) => {
      matches.push(child);
      visit(child);
    });
  };
  visit(node);
  return matches;
}

function pickPreferredUnitElement(elements, preferredUnits) {
  if (!elements.length) return null;
  for (const unit of preferredUnits) {
    const element = elements.find((entry) => attrOf(entry, "unit") === unit);
    if (element) return element;
  }
  return elements[0];
}

function pickLargestKmRadius(node) {
  const radii = descendantsByName(node, "Radius")
    .map((radius) => ({
      value: normalizeRadius(textOf(radius)),
      unit: attrOf(radius, "unit")
    }))
    .filter((radius) => Number.isFinite(radius.value));
  const kmRadii = radii.filter((radius) => radius.unit === "km").map((radius) => radius.value);
  const values = kmRadii.length ? kmRadii : radii.map((radius) => radius.value);
  return values.length ? Math.max(...values) : null;
}

function hasType(node, expectedType) {
  return normalizedText(attrOf(node, "type")).includes(normalizedText(expectedType));
}

function normalizedText(value) {
  return String(value ?? "").replace(/\s+/g, "");
}

function directionToBearing(direction) {
  const bearings = {
    北: 0,
    北北東: 22.5,
    北東: 45,
    東北東: 67.5,
    東: 90,
    東南東: 112.5,
    南東: 135,
    南南東: 157.5,
    南: 180,
    南南西: 202.5,
    南西: 225,
    西南西: 247.5,
    西: 270,
    西北西: 292.5,
    北西: 315,
    北北西: 337.5
  };
  return bearings[normalizedText(direction)] ?? null;
}

function normalizeTyphoon(item, index) {
  if (!item || typeof item !== "object") return null;
  if (item.sourceFormat === "xml") return item;
  if (Array.isArray(item.forecast) || Array.isArray(item.specifications)) {
    return normalizeJmaTyphoon(item, index);
  }

  const center = pickPoint(item, [
    "center", "current", "analysis", "position", "coordinate", "coordinates", "location"
  ]);
  const track = pickLine(item, ["track", "course", "pastCourse", "pastTrack", "route"]);
  const forecastTrack = pickLine(item, ["forecastTrack", "forecastCourse", "forecast", "forecasts"]);
  const forecastCircles = pickForecastCircles(item);
  const stormWarningArea = pickWarningArea(item);
  const stormWarningAreaShape = pickWarningAreaShape(item);
  const name = pickTyphoonName(item, index);
  const updatedAt = formatTime(pickValue(item, [
    "updatedAt", "reportDatetime", "reportDateTime", "targetTime", "validtime", "basetime", "time", "dateTime"
  ]));

  return {
    id: String(pickValue(item, ["tropicalCyclone", "typhoonNumber", "id", "code"]) ?? `typhoon-${index + 1}`),
    name,
    center,
    track,
    forecastTrack,
    forecastCircles,
    stormWarningArea,
    stormWarningAreaShape,
    strongWindRadius: pickRadius(item, ["strongWindRadius", "wind15mRadius", "galeRadius", "radius15m", "強風域"]),
    stormRadius: pickRadius(item, ["stormRadius", "wind25mRadius", "violentWindRadius", "radius25m", "暴風域"]),
    details: {
      name,
      pressure: formatWithUnit(pickValue(item, ["pressure", "centralPressure", "centerPressure", "pres", "中心気圧"]), "hPa"),
      maxWind: formatWithUnit(pickValue(item, ["maxWind", "maximumWind", "maxWindSpeed", "wind", "windSpeed", "最大風速"]), "m/s"),
      maxGust: formatWithUnit(pickValue(item, ["maxGust", "maximumGust", "maxInstantWind", "gust", "最大瞬間風速"]), "m/s"),
      direction: formatPlain(pickValue(item, ["direction", "moveDirection", "movingDirection", "dir", "移動方向"])),
      speed: formatWithUnit(pickValue(item, ["speed", "moveSpeed", "movingSpeed", "velocity", "移動速度"]), "km/h"),
      position: formatPosition(center, pickValue(item, ["centerPosition", "positionText", "locationName", "中心位置"]))
    },
    updatedAt
  };
}

function normalizeJmaTyphoon(item, index) {
  const forecast = Array.isArray(item.forecast) ? item.forecast : [];
  const specifications = Array.isArray(item.specifications) ? item.specifications : [];
  const title = forecast.find((entry) => entry?.part === "title")
    ?? specifications.find((entry) => entry?.part === "title")
    ?? item;
  const points = forecast.filter((entry) => entry?.advancedHours !== undefined && entry?.center);
  const current = points.find((entry) => Number(entry.advancedHours) === 0) ?? points[0] ?? item;
  const specNow = specifications.find((entry) => Number(entry?.advancedHours) === 0) ?? {};
  const center = normalizePoint(current.center) ?? pickPoint(item, ["center", "current", "position"]);
  if (!center) return null;

  const name = pickJmaTyphoonName(title, item, index);
  const forecastTrack = points.map((entry) => normalizePoint(entry.center)).filter(Boolean);
  const track = [
    ...(current.track?.preTyphoon ?? []),
    ...(current.track?.typhoon ?? []),
    ...(item.track?.preTyphoon ?? []),
    ...(item.track?.typhoon ?? [])
  ].map((entry) => normalizePoint(entry)).filter(Boolean);
  const forecastCircles = points
    .filter((entry) => Number(entry.advancedHours) !== 0)
    .map((entry) => {
      const circleCenter = normalizePoint(entry.center);
      const radius = normalizeRadius(entry.probabilityCircle?.radius);
      const label = formatForecastTimeLabel(entry.validtime?.JST ?? entry.validtime?.UTC);
      if (!circleCenter || !Number.isFinite(radius)) return null;
      return { center: circleCenter, radius, label };
    })
    .filter(Boolean);
  const stormWarningSource = [...points].reverse().find((entry) => entry?.stormWarningArea?.arc?.length)
    ?? current
    ?? item;
  const stormWarningAreaShape = pickWarningAreaShape(stormWarningSource);
  const stormWarningArea = pickWarningArea(stormWarningSource);
  const galeCenter = normalizePoint(current.galeWarningArea?.center) ?? center;
  const strongWindRadius = normalizeRadius(current.galeWarningArea?.radius);
  const stormRadius = normalizeRadius(current.stormWarningArea?.arc?.[0]?.[1]);

  return {
    id: String(item.tropicalCyclone ?? item.id ?? title.typhoonNumber ?? `typhoon-${index + 1}`),
    name,
    center,
    track,
    forecastTrack,
    forecastCircles,
    stormWarningArea,
    stormWarningAreaShape,
    strongWindRadius,
    strongWindCenter: galeCenter,
    stormRadius,
    details: {
      name,
      pressure: formatWithUnit(specNow.pressure ?? current.pressure ?? null, "hPa"),
      maxWind: formatWithUnit(specNow.maximumWind?.sustained?.["m/s"] ?? specNow.maximumWind?.sustained?.mps ?? null, "m/s"),
      maxGust: formatWithUnit(specNow.maximumWind?.gust?.["m/s"] ?? specNow.maximumWind?.gust?.mps ?? null, "m/s"),
      direction: formatPlain(specNow.course ?? current.course ?? null),
      speed: formatWithUnit(specNow.speed?.["km/h"] ?? current.speed?.["km/h"] ?? null, "km/h"),
      position: formatPosition(center, current.locationName ?? null)
    },
    updatedAt: formatTime(current.validtime?.JST ?? current.validtime?.UTC ?? title.validtime?.JST ?? title.validtime?.UTC ?? item.reportDatetime)
  };
}

function pickJmaTyphoonName(title, item, index) {
  const number = String(title.typhoonNumber ?? item.typhoonNumber ?? "").slice(-2).replace(/^0/, "");
  const name = title.name?.jp ?? title.name?.en ?? item.name?.jp ?? item.name?.en ?? "";
  if (Number(number)) return `台風第${Number(number)}号${name ? ` (${name})` : ""}`;
  if (name) return name;
  return pickTyphoonName(item, index);
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

function pickTyphoonName(item, index) {
  const name = pickValue(item, ["name", "typhoonName", "stormName", "japaneseName", "displayName", "台風名", "名称"]);
  if (name) return String(name);

  const number = pickValue(item, ["typhoonNumber", "number", "tcNumber"]);
  if (number) return `台風第${String(number).padStart(2, "0")}号`;

  const id = pickValue(item, ["tropicalCyclone", "id", "code"]);
  return id ? `台風 ${id}` : `台風 ${index + 1}`;
}

function pickPoint(item, keys) {
  for (const key of keys) {
    const point = normalizePoint(item[key]);
    if (point) return point;
  }
  return normalizePoint(item);
}

function normalizePoint(value) {
  if (!value) return null;
  if (Array.isArray(value) && value.length >= 2 && Number.isFinite(Number(value[0])) && Number.isFinite(Number(value[1]))) {
    return toLngLat(Number(value[0]), Number(value[1]));
  }
  if (typeof value === "string") {
    const match = value.match(/([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
    if (!match) return null;
    const lat = Number.parseFloat(match[1]);
    const lng = Number.parseFloat(match[2]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null;
  }
  if (typeof value !== "object") return null;

  const lat = pickValue(value, ["lat", "latitude", "centerLat", "centerLatitude", "y", "緯度"]);
  const lng = pickValue(value, ["lon", "lng", "longitude", "centerLon", "centerLng", "centerLongitude", "x", "経度"]);
  if (lat !== null && lng !== null) {
    const numericLat = Number(lat);
    const numericLng = Number(lng);
    if (Number.isFinite(numericLat) && Number.isFinite(numericLng)) return [numericLng, numericLat];
  }

  if (Array.isArray(value.coordinates)) return normalizePoint(value.coordinates);
  if (Array.isArray(value.coordinate)) return normalizePoint(value.coordinate);
  return null;
}

function toLngLat(first, second) {
  if (Math.abs(first) <= 90 && Math.abs(second) > 90) return [second, first];
  return [first, second];
}

function pickLine(item, keys) {
  for (const key of keys) {
    const line = normalizeLine(item[key]);
    if (line.length >= 2) return line;
  }
  return [];
}

function pickForecastCircles(item) {
  const candidates = item?.forecastCircles ?? item?.forecastCircle ?? item?.forecastAreas ?? item?.forecast;
  if (!Array.isArray(candidates)) return [];

  return candidates
    .map((entry) => {
      const center = pickPoint(entry, ["center", "position", "coordinate", "coordinates"]);
      const radius = normalizeRadius(pickValue(entry, ["radius", "radiusKm", "forecastRadius", "予報円"]));
      const label = pickValue(entry, ["label", "time", "validTime", "validtime", "datetime"]);
      if (!center || !Number.isFinite(radius)) return null;
      return { center, radius, label: label ? String(label) : "" };
    })
    .filter(Boolean);
}

function pickWarningArea(item) {
  const raw = item?.stormWarningArea ?? item?.warningArea ?? item?.stormArea ?? item?.暴風警戒域;
  if (!Array.isArray(raw)) return [];

  const circles = raw
    .map((entry) => {
      if (Array.isArray(entry)) return null;
      const center = pickPoint(entry, ["center", "position", "coordinate", "coordinates"]);
      const radius = normalizeRadius(pickValue(entry, ["radius", "radiusKm", "stormRadius", "暴風域"]));
      const label = pickValue(entry, ["label", "time", "validTime", "validtime", "datetime"]);
      if (!center || !Number.isFinite(radius)) return null;
      return { center, radius, label: label ? String(label) : "" };
    })
    .filter(Boolean);

  if (circles.length > 0) return circles;
  return pickLine(item, ["stormWarningArea", "warningArea", "stormArea", "暴風警戒域"]);
}

function pickWarningAreaShape(item) {
  const raw = item?.stormWarningArea ?? item?.warningArea ?? item?.stormArea ?? item?.暴風警戒域;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;

  const arc = (raw.arc ?? [])
    .map((entry) => {
      const center = normalizePoint(entry?.[0] ?? entry?.center);
      const radius = normalizeRadius(entry?.[1] ?? entry?.radius);
      const angles = entry?.[2] ?? entry?.angles;
      if (!center || !Number.isFinite(radius) || !Array.isArray(angles)) return null;
      const start = Number(angles[0]);
      const end = Number(angles[1]);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      return { center, radius, start, end };
    })
    .filter(Boolean);

  const line = (raw.line ?? [])
    .map((entry) => {
      const points = Array.isArray(entry?.[0]) && Array.isArray(entry?.[1])
        ? [normalizePoint(entry[0]), normalizePoint(entry[1])]
        : normalizeLine(entry);
      return points.filter(Boolean);
    })
    .filter((points) => points.length >= 2);

  return arc.length || line.length ? { arc, line } : null;
}

function normalizeLine(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizePoint(entry))
      .filter(Boolean);
  }
  if (typeof value !== "object") return [];
  return normalizeLine(value.points ?? value.items ?? value.data ?? value.coordinates ?? value.coordinate);
}

function pickValue(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
}

function pickRadius(item, keys) {
  for (const key of keys) {
    const value = pickValue(item, [key]);
    const radius = normalizeRadius(value);
    if (Number.isFinite(radius)) return radius;
  }
  return null;
}

function normalizeRadius(value) {
  if (value === null) return null;
  if (typeof value === "number") return value > 1000 ? value / 1000 : value;
  if (typeof value === "string") {
    const number = Number(value.replace(/[^\d.]/g, ""));
    if (!Number.isFinite(number)) return null;
    return number > 1000 ? number / 1000 : number;
  }
  if (Array.isArray(value)) {
    const radii = value.map(normalizeRadius).filter(Number.isFinite);
    return radii.length > 0 ? Math.max(...radii) : null;
  }
  if (typeof value === "object") {
    const radius = pickValue(value, ["radius", "base", "value", "km", "distance", "最大"]);
    return normalizeRadius(radius);
  }
  return null;
}

function formatTime(value) {
  return parseJmaTime(value) ?? "取得済み";
}

function formatForecastTimeLabel(value) {
  if (!value) return "予報";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ja-JP", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Tokyo"
  }).format(date).replace(" ", "");
}

function formatWithUnit(value, unit) {
  if (value === null) return "未取得";
  const text = String(value);
  return text.includes(unit) ? text : `${text} ${unit}`;
}

function formatPlain(value) {
  return value === null ? "未取得" : String(value);
}

function formatPosition(center, fallback) {
  if (fallback !== null && fallback !== undefined && fallback !== "") return String(fallback);
  if (center) return `北緯 ${center[1].toFixed(1)}° / 東経 ${center[0].toFixed(1)}°`;
  return "未取得";
}
