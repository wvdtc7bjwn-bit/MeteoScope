const DAY_MS = 24 * 60 * 60 * 1000;
const JAPAN_UTC_OFFSET_MS = 9 * 60 * 60 * 1000;
// Display-only screening to avoid projecting distant slabs into a shallow,
// clearly inland earthquake cluster. This is not a tectonic classification.
const SHALLOW_INLAND_MAX_DEPTH_KM = 30;
const SHALLOW_INLAND_MIN_BOUNDARY_DISTANCE_KM = 100;
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
  const principalAxis = {
    axisX: Math.cos(angle),
    axisY: Math.sin(angle),
    axisSource: "earthquake-axis"
  };
  const contourAxis = {
    axisX: -principalAxis.axisY,
    axisY: principalAxis.axisX,
    axisSource: "plate-contour-axis"
  };
  const boundaryCenter = {
    centerLatitude,
    centerLongitude
  };
  const boundaryAxes = getNearestBoundaryAxes(plateData, boundaryCenter);
  const shallowInland = projected.every((item) => item.depthKm <= SHALLOW_INLAND_MAX_DEPTH_KM)
    && boundaryAxes.length > 0
    && Math.min(...boundaryAxes.map((axis) => axis.preferredZeroDistanceKm)) > SHALLOW_INLAND_MIN_BOUNDARY_DISTANCE_KM;
  const axes = shallowInland ? [principalAxis] : [principalAxis, contourAxis, ...boundaryAxes];
  const candidates = axes.map((axis) => (
    buildCrossSectionCandidate(projected, {
      centerLatitude,
      centerLongitude,
      ...axis,
      plateData,
      includePlateProfiles: !shallowInland
    })
  ));
  const boundaryCandidates = candidates.filter((candidate) => (
    candidate.axisSource === "plate-boundary-axis"
    && getPlateProfileScore(candidate.plateProfiles) > 0
  ));
  const selected = (boundaryCandidates.length ? boundaryCandidates : candidates).sort((left, right) => (
    getPlateProfileScore(right.plateProfiles) - getPlateProfileScore(left.plateProfiles)
  ))[0];
  return getPlateProfileScore(selected.plateProfiles) > 0
    ? selected
    : {
      ...selected,
      minDistanceKm: selected.rawMinDistanceKm,
      maxDistanceKm: selected.rawMaxDistanceKm,
      spanKm: selected.rawMaxDistanceKm - selected.rawMinDistanceKm,
      plateProfileStatus: shallowInland ? "shallow-inland" : "unavailable"
    };
}

function getZeroDepthContours(plateData) {
  const boundaries = Array.isArray(plateData?.boundaries?.features) ? plateData.boundaries.features : [];
  return SLAB_BOUNDARY_DEFINITIONS.flatMap((definition) => boundaries
    .filter((feature) => feature?.properties?.LABEL === "Convergent Boundary")
    .filter((feature) => feature?.properties?.NAME === definition.boundaryName)
    .map((feature) => ({
      ...feature,
      properties: { region: definition.region, plate: definition.plate, depthKm: 0 }
    })));
}

function getNearestBoundaryAxes(plateData, center) {
  const cosine = Math.cos(center.centerLatitude * Math.PI / 180);
  const axes = [];
  getZeroDepthContours(plateData).forEach((feature) => {
    getCoordinateLines(feature?.geometry).forEach((line) => {
      for (let index = 1; index < line.length; index += 1) {
        const previous = projectCoordinateToCenter(line[index - 1], center, cosine);
        const current = projectCoordinateToCenter(line[index], center, cosine);
        if (!previous || !current) continue;
        const deltaX = current.x - previous.x;
        const deltaY = current.y - previous.y;
        const lengthSquared = deltaX ** 2 + deltaY ** 2;
        if (lengthSquared < 0.000001) continue;
        const ratio = Math.max(0, Math.min(1, -(previous.x * deltaX + previous.y * deltaY) / lengthSquared));
        const closestX = previous.x + deltaX * ratio;
        const closestY = previous.y + deltaY * ratio;
        const distanceSquared = closestX ** 2 + closestY ** 2;
        if (distanceSquared < 0.000001) continue;
        axes.push({
          axisX: closestX / Math.sqrt(distanceSquared),
          axisY: closestY / Math.sqrt(distanceSquared),
          axisSource: "plate-boundary-axis",
          distanceSquared,
          preferredZeroDistanceKm: Math.sqrt(distanceSquared)
        });
      }
    });
  });
  return axes
    .sort((left, right) => left.distanceSquared - right.distanceSquared)
    .filter((axis, index, all) => index === 0 || !all.slice(0, index).some((other) => (
      Math.abs(axis.axisX * other.axisX + axis.axisY * other.axisY) > 0.995
    )))
    .slice(0, 3)
    .map(({ distanceSquared, ...axis }) => axis);
}

function buildCrossSectionCandidate(projected, {
  centerLatitude,
  centerLongitude,
  axisX,
  axisY,
  axisSource,
  preferredZeroDistanceKm = null,
  plateData,
  includePlateProfiles = true
}) {
  const sectionPoints = projected.map((item) => ({
    distanceKm: item.x * axisX + item.y * axisY,
    depthKm: item.depthKm,
    magnitude: item.magnitude,
    sourceDate: item.sourceDate
  }));
  const distances = sectionPoints.map((item) => item.distanceKm);
  const spanKm = Math.max(...distances) - Math.min(...distances);
  const rawMinDistanceKm = Math.min(...distances);
  const rawMaxDistanceKm = Math.max(...distances);
  const profilePaddingKm = Math.max(100, Math.min(320, spanKm * 0.8));
  const minDistanceKm = rawMinDistanceKm - profilePaddingKm;
  const maxDistanceKm = rawMaxDistanceKm + profilePaddingKm;
  const section = {
    centerLatitude,
    centerLongitude,
    rawMinDistanceKm,
    rawMaxDistanceKm,
    axisX,
    axisY,
    preferredZeroDistanceKm,
    minDistanceKm,
    maxDistanceKm
  };
  const exactProfiles = includePlateProfiles ? buildPlateDepthProfiles(plateData, section) : [];
  const plateProfiles = !includePlateProfiles
    ? []
    : getPlateProfileScore(exactProfiles) > 0
      ? exactProfiles
      : buildProjectedPlateDepthProfiles(plateData, section);
  const plateDistances = plateProfiles.flatMap((profile) => profile.points.map((point) => point.distanceKm));
  const displayMinDistanceKm = plateDistances.length
    ? Math.min(minDistanceKm, Math.min(...plateDistances) - 12)
    : minDistanceKm;
  const displayMaxDistanceKm = plateDistances.length
    ? Math.max(maxDistanceKm, Math.max(...plateDistances) + 12)
    : maxDistanceKm;
  return {
    available: Number.isFinite(spanKm) && spanKm >= 0.5,
    centerLatitude,
    centerLongitude,
    rawMinDistanceKm,
    rawMaxDistanceKm,
    minDistanceKm: displayMinDistanceKm,
    maxDistanceKm: displayMaxDistanceKm,
    spanKm: displayMaxDistanceKm - displayMinDistanceKm,
    axisSource,
    points: sectionPoints,
    plateProfiles,
    plateProfileStatus: includePlateProfiles ? "available" : "shallow-inland",
      plateProfileMethod: getPlateProfileScore(exactProfiles) > 0
      ? "intersection"
      : plateProfiles.length
        ? "nearby-projection"
        : "unavailable"
  };
}

function getPlateProfileScore(profiles) {
  return (Array.isArray(profiles) ? profiles : []).reduce((score, profile) => {
    const points = Array.isArray(profile?.points) ? profile.points : [];
    const maximumDepth = Math.max(0, ...points.map((point) => point.depthKm ?? 0));
    return score + Math.max(0, points.length - 1) * 1000 + maximumDepth;
  }, 0);
}

function buildPlateDepthProfiles(plateData, section) {
  const contours = Array.isArray(plateData?.contours?.features) ? plateData.contours.features : [];
  const zeroDepthContours = getZeroDepthContours(plateData);
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
    points: selectContinuousPlateProfile(profile.depths, section)
  })).filter((profile) => (
    profile.points.length >= 2
    && profile.points[0].depthKm === 0
  ));
}

function buildProjectedPlateDepthProfiles(plateData, section) {
  const contours = Array.isArray(plateData?.contours?.features) ? plateData.contours.features : [];
  const candidatesByProfile = new Map();
  [...getZeroDepthContours(plateData), ...contours].forEach((feature) => {
    const depthKm = toFiniteNumber(feature?.properties?.depthKm);
    const region = String(feature?.properties?.region ?? "").trim();
    const plate = String(feature?.properties?.plate ?? "").trim();
    if (depthKm === null || depthKm < 0 || !region || !plate) return;
    const projection = getNearestSectionProjection(feature?.geometry, section);
    if (!projection) return;
    const key = `${region}\u0000${plate}`;
    const profile = candidatesByProfile.get(key) ?? { region, plate, depths: new Map() };
    const candidates = profile.depths.get(depthKm) ?? [];
    candidates.push(projection);
    profile.depths.set(depthKm, candidates);
    candidatesByProfile.set(key, profile);
  });
  const profiles = [...candidatesByProfile.values()].map((profile) => {
    const selected = selectContinuousProjectedPlateProfile(profile.depths, section);
    return {
      region: profile.region,
      plate: profile.plate,
      projected: true,
      zeroOffsetKm: selected[0]?.offsetKm ?? Infinity,
      maximumOffsetKm: Math.max(0, ...selected.map((point) => point.offsetKm)),
      points: selected.map(({ depthKm, distanceKm }) => ({ depthKm, distanceKm }))
    };
  }).filter((profile) => (
    profile.points.length >= 2
    && profile.points[0].depthKm === 0
    && profile.maximumOffsetKm <= 260
  ));
  const nearestZeroOffsetKm = Math.min(...profiles.map((profile) => profile.zeroOffsetKm));
  return profiles
    .filter((profile) => profile.zeroOffsetKm <= nearestZeroOffsetKm + 16)
    .map(({ zeroOffsetKm, ...profile }) => profile);
}

function selectContinuousProjectedPlateProfile(depthCandidates, section = {}) {
  let previousDistance = null;
  return [...depthCandidates.entries()]
    .sort(([leftDepth], [rightDepth]) => leftDepth - rightDepth)
    .map(([depthKm, candidates]) => {
      const selected = candidates.sort((left, right) => {
        const referenceDistance = previousDistance ?? section.preferredZeroDistanceKm ?? 0;
        const leftScore = Math.abs(left.distanceKm - referenceDistance) + left.offsetKm * 1.5;
        const rightScore = Math.abs(right.distanceKm - referenceDistance) + right.offsetKm * 1.5;
        return leftScore - rightScore;
      })[0];
      previousDistance = selected.distanceKm;
      return { depthKm, ...selected };
    });
}

function selectContinuousPlateProfile(depthCandidates, section = {}) {
  let previousDistance = null;
  return [...depthCandidates.entries()]
    .sort(([leftDepth], [rightDepth]) => leftDepth - rightDepth)
    .map(([depthKm, candidates]) => {
      const uniqueCandidates = [...new Set(candidates)];
      const distanceKm = uniqueCandidates.sort((left, right) => (
        previousDistance === null && depthKm === 0 && Number.isFinite(section.preferredZeroDistanceKm)
          ? Math.abs(left - section.preferredZeroDistanceKm) - Math.abs(right - section.preferredZeroDistanceKm)
          : previousDistance === null
          ? Math.abs(left) - Math.abs(right)
          : Math.abs(left - previousDistance) - Math.abs(right - previousDistance)
      ))[0];
      previousDistance = distanceKm;
      return { depthKm, distanceKm };
    });
}

function getSectionIntersections(geometry, section) {
  const lines = getCoordinateLines(geometry);
  const limit = Math.max(8, (section.maxDistanceKm - section.minDistanceKm) * 0.08);
  const intersections = [];
  lines.forEach((line) => {
    for (let index = 1; index < line.length; index += 1) {
      const previous = projectCoordinateToSection(line[index - 1], section);
      const current = projectCoordinateToSection(line[index], section);
      if (!previous || !current) continue;
      if (Math.abs(previous.offsetKm) < 0.000001) {
        intersections.push(previous.distanceKm);
      }
      if (Math.abs(current.offsetKm) < 0.000001) {
        intersections.push(current.distanceKm);
      }
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
  return intersections.filter((distanceKm) => (
    distanceKm >= section.minDistanceKm - limit
    && distanceKm <= section.maxDistanceKm + limit
  ));
}

function getNearestSectionProjection(geometry, section) {
  const limit = Math.max(80, (section.maxDistanceKm - section.minDistanceKm) * 0.35);
  const projections = [];
  getCoordinateLines(geometry).forEach((line) => {
    for (let index = 1; index < line.length; index += 1) {
      const previous = projectCoordinateToSection(line[index - 1], section);
      const current = projectCoordinateToSection(line[index], section);
      if (!previous || !current) continue;
      const offsetDelta = current.offsetKm - previous.offsetKm;
      const ratio = Math.max(0, Math.min(1, offsetDelta === 0 ? 0 : -previous.offsetKm / offsetDelta));
      const distanceKm = previous.distanceKm + (current.distanceKm - previous.distanceKm) * ratio;
      const offsetKm = Math.abs(previous.offsetKm + offsetDelta * ratio);
      if (distanceKm < section.minDistanceKm - limit || distanceKm > section.maxDistanceKm + limit) continue;
      projections.push({ distanceKm, offsetKm });
    }
  });
  return projections.sort((left, right) => (
    left.offsetKm - right.offsetKm || Math.abs(left.distanceKm) - Math.abs(right.distanceKm)
  ))[0] ?? null;
}

// Plate contours are assembled in increasing depth order. Keep that order in
// the cross-section: sorting by horizontal distance can reverse the profile
// when the slab bends, and spline interpolation can invent extrema between
// measured contours.
export function buildPlateProfilePath(points) {
  const validPoints = (Array.isArray(points) ? points : []).filter((point) => (
    Number.isFinite(point?.x) && Number.isFinite(point?.y)
  ));
  if (!validPoints.length) return "";
  return validPoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");
}

function getCoordinateLines(geometry) {
  return geometry?.type === "LineString"
    ? [geometry.coordinates]
    : geometry?.type === "MultiLineString"
      ? geometry.coordinates
      : [];
}

function projectCoordinateToCenter(coordinate, center, cosine) {
  const longitude = toFiniteNumber(coordinate?.[0]);
  const latitude = toFiniteNumber(coordinate?.[1]);
  if (longitude === null || latitude === null) return null;
  return {
    x: (longitude - center.centerLongitude) * 111.32 * cosine,
    y: (latitude - center.centerLatitude) * 110.57
  };
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
