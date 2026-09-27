const DAY_MS = 24 * 60 * 60 * 1000;
const JAPAN_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;
const SLAB_BOUNDARY_DEFINITIONS = [
  { region: "Kuril", plate: "太平洋プレート（日本・千島）", boundaryName: "North American:Pacific" },
  { region: "Izu-Bonin", plate: "太平洋プレート（伊豆・小笠原）", boundaryName: "Pacific:Philippine" },
  { region: "Ryukyu", plate: "フィリピン海プレート（琉球）", boundaryName: "Eurasian:Philippine" }
];

function toFiniteNumber(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toJapanDate(value) {
  const text = String(value ?? "").trim();
  const directMatch = text.match(/^(\d{4}-\d{2}-\d{2})$/u);
  if (directMatch) return directMatch[1];
  const time = Date.parse(text);
  if (!Number.isFinite(time)) return "";
  return new Date(time + JAPAN_UTC_OFFSET_MS).toISOString().slice(0, 10);
}

function parseDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) ? time : null;
}

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function summarize(values) {
  if (!values.length) return { count: 0, min: null, median: null, max: null };
  return {
    count: values.length,
    min: Math.min(...values),
    median: median(values),
    max: Math.max(...values)
  };
}

function buildDailyCounts(items, startDate, endDate) {
  const counts = new Map();
  items.forEach((item) => {
    if (item.sourceDate) counts.set(item.sourceDate, (counts.get(item.sourceDate) ?? 0) + 1);
  });
  const itemDates = [...counts.keys()].sort();
  const first = parseDay(startDate) ?? parseDay(itemDates[0]);
  const last = parseDay(endDate) ?? parseDay(itemDates.at(-1));
  if (first === null || last === null || last < first) return [];
  const daily = [];
  for (let day = first; day <= last; day += DAY_MS) {
    const sourceDate = new Date(day).toISOString().slice(0, 10);
    daily.push({ sourceDate, count: counts.get(sourceDate) ?? 0 });
  }
  return daily;
}

function buildActivityComparison(daily) {
  if (daily.length < 2) return { comparable: false, firstCount: null, secondCount: null, changePercent: null };
  const split = Math.ceil(daily.length / 2);
  const firstCount = daily.slice(0, split).reduce((total, item) => total + item.count, 0);
  const secondCount = daily.slice(split).reduce((total, item) => total + item.count, 0);
  const firstRate = firstCount / split;
  const secondRate = secondCount / (daily.length - split);
  return {
    comparable: true,
    firstCount,
    secondCount,
    changePercent: firstRate === 0 ? (secondRate === 0 ? 0 : null) : (secondRate / firstRate - 1) * 100
  };
}

function buildCrossSection(items, plateData) {
  const points = items.filter((item) => item.latitude !== null && item.longitude !== null && item.depthKm !== null && item.depthKm >= 0);
  if (points.length < 2) return { available: false, points: [], spanKm: 0 };
  const centerLatitude = points.reduce((total, item) => total + item.latitude, 0) / points.length;
  const centerLongitude = points.reduce((total, item) => total + item.longitude, 0) / points.length;
  const cosine = Math.cos(centerLatitude * Math.PI / 180);
  const projected = points.map((item) => ({
    ...item,
    x: (item.longitude - centerLongitude) * 111.32 * cosine,
    y: (item.latitude - centerLatitude) * 110.57
  }));
  const covariance = projected.reduce((result, item) => ({
    xx: result.xx + item.x ** 2,
    yy: result.yy + item.y ** 2,
    xy: result.xy + item.x * item.y
  }), { xx: 0, yy: 0, xy: 0 });
  const angle = 0.5 * Math.atan2(2 * covariance.xy, covariance.xx - covariance.yy);
  const axisX = Math.cos(angle);
  const axisY = Math.sin(angle);
  const sectionPoints = projected.map((item) => ({
    distanceKm: item.x * axisX + item.y * axisY,
    depthKm: item.depthKm,
    magnitude: item.magnitude,
    sourceDate: item.sourceDate
  }));
  const distances = sectionPoints.map((item) => item.distanceKm);
  const spanKm = Math.max(...distances) - Math.min(...distances);
  return {
    available: Number.isFinite(spanKm) && spanKm >= 0.5,
    centerLatitude,
    centerLongitude,
    minDistanceKm: Math.min(...distances),
    maxDistanceKm: Math.max(...distances),
    spanKm,
    points: sectionPoints,
    plateProfiles: buildPlateDepthProfiles(plateData, {
      centerLatitude,
      centerLongitude,
      axisX,
      axisY,
      minDistanceKm: Math.min(...distances),
      maxDistanceKm: Math.max(...distances)
    })
  };
}

function buildPlateDepthProfiles(plateData, section) {
  const contours = Array.isArray(plateData?.contours?.features) ? plateData.contours.features : [];
  const boundaries = Array.isArray(plateData?.boundaries?.features) ? plateData.boundaries.features : [];
  const zeroDepthContours = SLAB_BOUNDARY_DEFINITIONS.flatMap((definition) => boundaries
    .filter((feature) => feature?.properties?.LABEL === "Convergent Boundary")
    .filter((feature) => feature?.properties?.NAME === definition.boundaryName)
    .map((feature) => ({
      ...feature,
      properties: { region: definition.region, plate: definition.plate, depthKm: 0 }
    })));
  const candidatesByProfile = new Map();
  [...zeroDepthContours, ...contours].forEach((feature) => {
    const depthKm = toFiniteNumber(feature?.properties?.depthKm);
    const region = String(feature?.properties?.region ?? "").trim();
    const plate = String(feature?.properties?.plate ?? "").trim();
    if (depthKm === null || depthKm < 0 || !region || !plate) return;
    const intersections = getSectionIntersections(feature?.geometry, section);
    if (!intersections.length) return;
    const key = `${region}\u0000${plate}`;
    const profile = candidatesByProfile.get(key) ?? { region, plate, depths: new Map() };
    const candidates = profile.depths.get(depthKm) ?? [];
    candidates.push(...intersections);
    profile.depths.set(depthKm, candidates);
    candidatesByProfile.set(key, profile);
  });
  return [...candidatesByProfile.values()].map((profile) => ({
    region: profile.region,
    plate: profile.plate,
    points: selectContinuousPlateProfile(profile.depths)
  })).filter((profile) => (
    profile.points.length >= 2
    && profile.points[0].depthKm === 0
  ));
}

function selectContinuousPlateProfile(depthCandidates) {
  let previousDistance = null;
  return [...depthCandidates.entries()]
    .sort(([leftDepth], [rightDepth]) => leftDepth - rightDepth)
    .map(([depthKm, candidates]) => {
      const uniqueCandidates = [...new Set(candidates)];
      const distanceKm = uniqueCandidates.sort((left, right) => (
        previousDistance === null
          ? Math.abs(left) - Math.abs(right)
          : Math.abs(left - previousDistance) - Math.abs(right - previousDistance)
      ))[0];
      previousDistance = distanceKm;
      return { depthKm, distanceKm };
    });
}

function getSectionIntersections(geometry, section) {
  const lines = geometry?.type === "LineString"
    ? [geometry.coordinates]
    : geometry?.type === "MultiLineString"
      ? geometry.coordinates
      : [];
  const limit = Math.max(8, (section.maxDistanceKm - section.minDistanceKm) * 0.08);
  const intersections = [];
  lines.forEach((line) => {
    for (let index = 1; index < line.length; index += 1) {
      const previous = projectCoordinateToSection(line[index - 1], section);
      const current = projectCoordinateToSection(line[index], section);
      if (!previous || !current) continue;
      const delta = previous.offsetKm - current.offsetKm;
      if (Math.abs(delta) < 0.000001) continue;
      if ((previous.offsetKm > 0 && current.offsetKm > 0) || (previous.offsetKm < 0 && current.offsetKm < 0)) continue;
      const ratio = previous.offsetKm / delta;
      const distanceKm = previous.distanceKm + (current.distanceKm - previous.distanceKm) * ratio;
      if (distanceKm >= section.minDistanceKm - limit && distanceKm <= section.maxDistanceKm + limit) {
        intersections.push(distanceKm);
      }
    }
  });
  return intersections;
}

function projectCoordinateToSection(coordinate, section) {
  const longitude = toFiniteNumber(coordinate?.[0]);
  const latitude = toFiniteNumber(coordinate?.[1]);
  if (longitude === null || latitude === null) return null;
  const x = (longitude - section.centerLongitude) * 111.32 * Math.cos(section.centerLatitude * Math.PI / 180);
  const y = (latitude - section.centerLatitude) * 110.57;
  return {
    distanceKm: x * section.axisX + y * section.axisY,
    offsetKm: -x * section.axisY + y * section.axisX
  };
}

/**
 * Summarize the currently displayed hypocenters. The cross section follows the
 * selected points' principal axis; it is a reading aid, not a plate model.
 */
export function buildEarthquakeDistributionAnalysis(items, { startDate = "", endDate = "", plateData = null } = {}) {
  const normalized = (Array.isArray(items) ? items : []).map((item) => ({
    sourceDate: toJapanDate(item?.originTime || item?.time || item?.sourceDate),
    latitude: toFiniteNumber(item?.latitude),
    longitude: toFiniteNumber(item?.longitude),
    depthKm: toFiniteNumber(item?.depthKm),
    magnitude: toFiniteNumber(item?.magnitude)
  })).filter((item) => item.sourceDate || item.latitude !== null || item.longitude !== null);
  const depths = normalized.map((item) => item.depthKm).filter((value) => value !== null && value >= 0);
  const magnitudes = normalized.map((item) => item.magnitude).filter((value) => value !== null);
  const daily = buildDailyCounts(normalized, startDate, endDate);
  return {
    count: normalized.length,
    depth: summarize(depths),
    magnitude: summarize(magnitudes),
    daily,
    activity: buildActivityComparison(daily),
    crossSection: buildCrossSection(normalized, plateData)
  };
}
