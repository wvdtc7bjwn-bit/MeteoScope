import { escapeHtmlString as escapePopup } from "../utils/html.js";
import { unwrapLineAtAntimeridian, unwrapLongitudeNear } from "./geoLine.js";
import { buildStormWarningAreaFeatures, destinationPoint } from "../typhoonGeometry.js";

function formatTyphoonForecastCenter(center) {
  const [longitude, latitude] = Array.isArray(center) ? center : [];
  if (!Number.isFinite(Number(longitude)) || !Number.isFinite(Number(latitude))) return "";
  return `${Number(longitude)},${Number(latitude)}`;
}

function buildTyphoonPopup(typhoon, label) {
  const details = typhoon.details ?? {};
  const isLowPressureSystem = details.maxWind === "-"
    && details.maxGust === "-"
    && Boolean(details.systemType);
  const windRows = isLowPressureSystem
    ? ""
    : `
      <span>最大風速: ${escapePopup(details.maxWind ?? "未取得")}</span><br>
      <span>最大瞬間風速: ${escapePopup(details.maxGust ?? "未取得")}</span><br>
    `;
  const systemTypeRow = details.systemType
    ? `<span>種別: ${escapePopup(details.systemType)}</span><br>`
    : "";
  return `
    <strong>${escapePopup(typhoon.name ?? "台風情報")}</strong><br>
    <span>${escapePopup(label)}</span><br>
    ${systemTypeRow}
    <span>中心気圧: ${escapePopup(details.pressure ?? "未取得")}</span><br>
    ${windRows}
    <span>移動: ${escapePopup(details.direction ?? "未取得")} ${escapePopup(details.speed ?? "")}</span><br>
    <span>更新: ${escapePopup(typhoon.updatedAt ?? "未取得")}</span>
  `;
}

function buildTyphoonForecastCirclePopup(typhoon, circle) {
  const details = resolveTyphoonForecastDetails(circle.details ?? {});
  const rows = [
    ["種別", details.systemType],
    ["強さ", details.strength],
    ["中心気圧", details.pressure],
    ["最大風速", details.maxWind],
    ["最大瞬間風速", details.maxGust]
  ].filter(([label, value]) => isKnownTyphoonDetail(value) || isZeroWindTyphoonRow(label, value));
  const body = rows.length > 0
    ? rows.map(([label, value]) => `
      <div class="typhoon-forecast-popup-row">
        <span>${escapePopup(label)}</span>
        <strong>${escapePopup(value)}</strong>
      </div>
    `).join("")
    : `<p class="typhoon-forecast-popup-empty">この予報円の詳細値は未取得です。</p>`;

  return `
    <section class="typhoon-forecast-popup-card" aria-label="台風予報円の情報">
      <h3>${escapePopup(formatTyphoonForecastPopupTitle(circle.label))}</h3>
      <div class="typhoon-forecast-popup-body">
        ${body}
      </div>
    </section>
  `;
}

function resolveTyphoonForecastDetails(forecastDetails) {
  return {
    systemType: String(forecastDetails.systemType ?? "").trim(),
    strength: pickKnownTyphoonDetail(forecastDetails.strength),
    pressure: pickKnownTyphoonDetail(forecastDetails.pressure),
    maxWind: pickWindTyphoonForecastDetail(forecastDetails.maxWind),
    maxGust: pickWindTyphoonForecastDetail(forecastDetails.maxGust)
  };
}

function pickWindTyphoonForecastDetail(forecastValue) {
  return String(forecastValue ?? "").trim() === "-"
    ? "-"
    : pickKnownTyphoonDetail(forecastValue);
}

function pickKnownTyphoonDetail(...values) {
  return values.find(isKnownTyphoonDetail) ?? "未取得";
}

function isKnownTyphoonDetail(value) {
  return value !== null
    && value !== undefined
    && String(value).trim() !== ""
    && String(value).trim() !== "未取得"
    && String(value).trim() !== "-";
}

function isZeroWindTyphoonRow(label, value) {
  return (label === "最大風速" || label === "最大瞬間風速")
    && String(value ?? "").trim() === "-";
}

function formatTyphoonForecastPopupTitle(label) {
  const text = String(label ?? "").trim();
  if (!text) return "予報円";
  return text.includes("予報") ? text : `${text}予報`;
}

function createTyphoonCircleFeature(center, radiusKm, properties) {
  if (!center || !Number.isFinite(radiusKm) || radiusKm <= 0) return null;
  const points = createMercatorCircleCoordinates(center, radiusKm, 128);

  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: [points]
    },
    properties
  };
}

function createMercatorCircleCoordinates(center, radiusKm, steps = 128) {
  const { pixelCenter, pixelRadius } = projectCircleForTangents({ center, radius: radiusKm });
  const points = [];

  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    points.push(unprojectMercatorPixel({
      x: pixelCenter.x + pixelRadius * Math.cos(angle),
      y: pixelCenter.y + pixelRadius * Math.sin(angle)
    }));
  }

  return points;
}

function createTyphoonCircleLineFeature(center, radiusKm, properties) {
  const polygon = createTyphoonCircleFeature(center, radiusKm, properties);
  if (!polygon) return null;
  return {
    type: "Feature",
    geometry: {
      type: "LineString",
      coordinates: polygon.geometry.coordinates[0]
    },
    properties
  };
}

function createTyphoonStormWarningFeatures(typhoon) {
  const groups = buildStormWarningCircleGroups(typhoon);
  const features = groups.flatMap((circles) => createStormWarningCircleGroupFeatures(typhoon, circles));
  if (features.length) return features;

  const circles = buildStormWarningCircles(typhoon);
  return circles
    .map((circle) => createTyphoonCircleLineFeature(circle.center, circle.radius, {
      color: "#ff2b12",
      typhoonShape: "warningArea",
      popup: buildTyphoonPopup(typhoon, circle.label ? `暴風警戒域 ${circle.label}` : "暴風警戒域")
    }))
    .filter(Boolean);
}

function createStormWarningCircleGroupFeatures(typhoon, circles) {
  const outerCircles = removeContainedCircles(circles);

  if (outerCircles.length >= 2) {
    return createOuterTangentAreaFeatures(outerCircles, {
      fillShape: "warningAreaFill",
      lineShape: "warningArea",
      color: "#ff2800",
      popup: buildTyphoonPopup(typhoon, "暴風警戒域")
    });
  }

  return outerCircles
    .map((circle) => createTyphoonCircleLineFeature(circle.center, circle.radius, {
      color: "#ff2b12",
      typhoonShape: "warningArea",
      popup: buildTyphoonPopup(typhoon, circle.label ? `暴風警戒域 ${circle.label}` : "暴風警戒域")
    }))
    .filter(Boolean);
}

function removeContainedCircles(circles) {
  return circles.filter((circle, index) => !circles.some((other, otherIndex) => {
    if (index === otherIndex) return false;
    if (!circle?.center || !other?.center) return false;
    const current = projectCircleForTangents(circle);
    const candidate = projectCircleForTangents(other);
    const dx = current.pixelCenter.x - candidate.pixelCenter.x;
    const dy = current.pixelCenter.y - candidate.pixelCenter.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance + current.pixelRadius <= candidate.pixelRadius + 1.5;
  }));
}

function buildStormWarningCircleGroups(typhoon) {
  if (Array.isArray(typhoon.stormWarningGroups)) {
    return typhoon.stormWarningGroups
      .map((group) => group.filter((circle) => circle?.center && Number.isFinite(circle.radius)))
      .filter((group) => group.length > 0);
  }

  const circles = buildStormWarningCircles(typhoon);
  return circles.length ? [circles] : [];
}

function buildStormWarningCircles(typhoon) {
  const circles = [];
  const stormRadius = readRadiusKm(typhoon, ["stormRadius", "wind25mRadius", "violentWindRadius"]);
  const stormCenter = typhoon.stormCenter?.length === 2 ? typhoon.stormCenter : typhoon.center;
  if (stormCenter?.length === 2 && Number.isFinite(stormRadius)) {
    circles.push({ center: stormCenter, radius: stormRadius, label: "暴風域" });
  }

  (typhoon.stormWarningArea ?? []).forEach((circle) => {
    if (!circle?.center || !Number.isFinite(circle.radius)) return;
    const sameAsCurrentCenter = typhoon.center?.length === 2
      && getPointDistanceSq(circle.center, typhoon.center) < 0.0001;
    if (!(sameAsCurrentCenter && Number.isFinite(stormRadius))) circles.push(circle);
  });

  return circles;
}

function hasStormWarningCircleGroups(typhoon) {
  return Array.isArray(typhoon.stormWarningGroups)
    && typhoon.stormWarningGroups.some((group) =>
      Array.isArray(group)
        && group.some((circle) => circle?.center?.length === 2 && Number.isFinite(circle.radius))
    );
}

function createTyphoonStormWarningShapeFeatures(typhoon) {
  // Keep the JMA-published perimeter visible even when its independently
  // rounded arc/line endpoints cannot be assembled into a closed fill ring.
  // In that case the caller sees these official segments and does not replace
  // them with the circle-hull approximation.
  return buildStormWarningAreaFeatures(typhoon.stormWarningAreaShape, {
    color: "#ff2800",
    popup: buildTyphoonPopup(typhoon, "暴風警戒域")
  });
}

function createTyphoonForecastAreaFeatures(typhoon) {
  if (!typhoon.center?.length || !typhoon.forecastCircles?.length) return [];

  const circles = [
    { center: typhoon.center, radius: 0 },
    ...typhoon.forecastCircles
      .filter((circle) => circle?.center?.length === 2 && Number.isFinite(circle.radius))
  ];
  if (circles.length < 2) return [];

  return createOuterTangentAreaFeatures(circles, {
    fillShape: "forecastAreaFill",
    lineShape: "forecastArea",
    color: "#f8fbff",
    popup: buildTyphoonPopup(typhoon, "予報領域"),
    skipEndArc: true
  });
}

function createOuterTangentAreaFeatures(circles, options) {
  const continuousCircles = unwrapTyphoonCircleSequence(circles);
  const ring = options.useAdjacentTangents
    ? createOuterTangentMergedPolygonRing(continuousCircles, options)
    : createCircleHullRing(continuousCircles);
  if (!ring) return [];

  const properties = {
    color: options.color,
    popup: options.popup
  };

  const features = [
    {
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [ring]
      },
      properties: {
        ...properties,
        typhoonShape: options.fillShape
      }
    }
  ];

  if (options.skipEndArc) {
    features.push(...createAdjacentOuterTangentLineFeatures(continuousCircles, options, properties));
    return features;
  }

  features.push(
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: ring
      },
      properties: {
        ...properties,
        typhoonShape: options.lineShape
      }
    }
  );
  return features;
}

function unwrapTyphoonCircleSequence(circles) {
  if (!Array.isArray(circles) || circles.length === 0) return [];
  const centers = unwrapLineAtAntimeridian(circles.map((circle) => circle.center));
  return circles.map((circle, index) => ({ ...circle, center: centers[index] ?? circle.center }));
}

function createCircleHullRing(circles) {
  const points = circles.flatMap((circle, circleIndex) =>
    createCircleHullSamplePoints(circle, circleIndex)
  );
  const hull = convexHull(points);
  if (hull.length < 3) return null;
  return closeLine(hull.map((point) => point.lngLat));
}

function createAdjacentOuterTangentLineFeatures(circles, options, properties) {
  const projectedCircles = createProjectedTangentCircles(circles);
  const features = [];

  for (let index = 0; index < projectedCircles.length - 1; index += 1) {
    const tangents = calcCircleTangents(projectedCircles[index], projectedCircles[index + 1]);
    tangents.forEach((coordinates) => {
      if (coordinates.length < 2) return;
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates
        },
        properties: {
          ...properties,
          typhoonShape: options.lineShape
        }
      });
    });
  }

  return features;
}

function createCircleHullSamplePoints(circle, circleIndex) {
  if (Array.isArray(circle.axes) && circle.axes.length >= 2) {
    return createDirectionalRadiusHullSamplePoints(circle, circleIndex);
  }

  const projected = projectCircleForTangents(circle);
  if (!Number.isFinite(projected.pixelRadius) || projected.pixelRadius <= 0) {
    return [{
      x: projected.pixelCenter.x,
      y: projected.pixelCenter.y,
      lngLat: circle.center,
      circleIndex
    }];
  }

  const steps = 144;
  return Array.from({ length: steps }, (_, index) => {
    const angle = (index / steps) * Math.PI * 2;
    const point = {
      x: projected.pixelCenter.x + projected.pixelRadius * Math.cos(angle),
      y: projected.pixelCenter.y + projected.pixelRadius * Math.sin(angle)
    };
    return {
      ...point,
      lngLat: unprojectMercatorPixel(point),
      circleIndex
    };
  });
}

function createDirectionalRadiusHullSamplePoints(circle, circleIndex) {
  const steps = 144;
  const coordinates = unwrapLineAtAntimeridian(Array.from({ length: steps + 1 }, (_, index) => {
    const bearing = (index / steps) * 360;
    const radius = interpolateDirectionalRadius(circle.axes, bearing, circle.radius);
    return destinationPoint(circle.center, radius, bearing);
  }).slice(0, -1));
  const worldOffset = Math.round((circle.center[0] - coordinates[0]?.[0]) / 360) * 360;
  return coordinates.map(([longitude, latitude]) => {
    const lngLat = [longitude + worldOffset, latitude];
    const point = projectMercatorPixel(lngLat);
    return {
      ...point,
      lngLat,
      circleIndex
    };
  });
}

function interpolateDirectionalRadius(axes, bearing, fallbackRadius) {
  const samples = axes
    .filter((axis) => Number.isFinite(axis.bearing) && Number.isFinite(axis.radius))
    .sort((a, b) => a.bearing - b.bearing);
  if (samples.length === 0) return fallbackRadius;
  if (samples.length === 1) return samples[0].radius;

  const normalizedBearing = ((bearing % 360) + 360) % 360;
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const next = samples[(index + 1) % samples.length];
    const start = current.bearing;
    const end = next.bearing > start ? next.bearing : next.bearing + 360;
    const target = normalizedBearing >= start ? normalizedBearing : normalizedBearing + 360;
    if (target >= start && target <= end) {
      const ratio = (target - start) / Math.max(end - start, 1);
      return current.radius + (next.radius - current.radius) * ratio;
    }
  }

  return fallbackRadius;
}

function convexHull(points) {
  const sorted = [...points]
    .sort((a, b) => a.x === b.x ? a.y - b.y : a.x - b.x)
    .filter((point, index, array) => index === 0 || point.x !== array[index - 1].x || point.y !== array[index - 1].y);
  if (sorted.length <= 1) return sorted;

  const lower = [];
  sorted.forEach((point) => {
    while (lower.length >= 2 && cross(lower.at(-2), lower.at(-1), point) <= 0) lower.pop();
    lower.push(point);
  });

  const upper = [];
  [...sorted].reverse().forEach((point) => {
    while (upper.length >= 2 && cross(upper.at(-2), upper.at(-1), point) <= 0) upper.pop();
    upper.push(point);
  });

  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

function cross(origin, a, b) {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

function hasSelfIntersection(ring) {
  const projected = ring.map((point) => projectMercatorPixel(point));
  for (let i = 0; i < projected.length - 1; i += 1) {
    for (let j = i + 2; j < projected.length - 1; j += 1) {
      if (i === 0 && j === projected.length - 2) continue;
      if (segmentsIntersect(projected[i], projected[i + 1], projected[j], projected[j + 1])) return true;
    }
  }
  return false;
}

function segmentsIntersect(a, b, c, d) {
  const abC = cross(a, b, c);
  const abD = cross(a, b, d);
  const cdA = cross(c, d, a);
  const cdB = cross(c, d, b);
  return abC * abD < 0 && cdA * cdB < 0;
}

function createOuterTangentMergedPolygonRing(circles, options = {}) {
  const parts = createOuterTangentParts(circles, options);
  if (!parts) return null;

  const endArc = options.skipEndArc
    ? [parts.sideA.at(-1), parts.sideB.at(-1)]
    : parts.endArc;
  const sideB = parts.sideB;
  const startArc = parts.startArc;
  const sideA = parts.sideA.slice(1, -1);
  const sideBReverse = sideB.slice(1, -1).reverse();
  let ringPoints = [
    ...startArc,
    ...sideA,
    ...endArc,
    ...sideBReverse
  ];
  if (options.startRingAtEndArc && !options.skipEndArc) {
    ringPoints = rotateOpenLine(ringPoints, startArc.length + sideA.length);
  }
  ringPoints = unwrapLineAtAntimeridian(ringPoints);
  let ring = closeLine(ringPoints);
  if (hasSelfIntersection(ring)) {
    const sideA = parts.straightSideA;
    ringPoints = [
      ...parts.startArc.slice().reverse(),
      ...sideB.slice(1, -1),
      ...endArc.slice().reverse(),
      ...sideA.slice(1, -1).reverse()
    ];
    if (options.startRingAtEndArc && !options.skipEndArc) {
      ringPoints = rotateOpenLine(ringPoints, parts.startArc.length + sideB.slice(1, -1).length);
    }
    ring = closeLine(ringPoints);
  }

  if (hasSelfIntersection(ring)) {
    const hullRing = createCircleHullRing(circles);
    if (hullRing && !hasSelfIntersection(hullRing)) return hullRing;
  }

  return ring.length >= 4 ? ring : null;
}

function rotateOpenLine(points, startIndex) {
  if (!Array.isArray(points) || points.length < 2) return points;
  const index = Math.max(0, Math.min(points.length - 1, startIndex));
  return [
    ...points.slice(index),
    ...points.slice(0, index)
  ];
}

function createOpenOuterTangentLineFeatures(circles, options, properties) {
  const parts = createOuterTangentParts(circles, options);
  if (!parts) return [];

  return [parts.startArc, parts.straightSideA, parts.straightSideB]
    .filter((coordinates) => coordinates.length >= 2)
    .map((coordinates) => ({
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates
      },
      properties: {
        ...properties,
        typhoonShape: options.lineShape
      }
    }));
}

function createOuterTangentParts(circles) {
  if (circles.length < 2) return null;

  const projectedCircles = createProjectedTangentCircles(circles);
  const tangentPairs = [];
  const firstCircle = circles[0];
  const lastCircle = circles.at(-1);

  for (let index = 0; index < projectedCircles.length - 1; index += 1) {
    let tangents = sortTangentsByCenterLineSide(
      calcCircleTangents(projectedCircles[index], projectedCircles[index + 1]),
      projectedCircles[index],
      projectedCircles[index + 1]
    );
    if (tangentPairs.length > 0) {
      tangents = alignTangentPairWithPrevious(tangentPairs.at(-1), tangents);
    }
    if (tangents.length < 2) return null;
    tangentPairs.push(tangents);
  }

  const sideA = buildOuterTangentSide(tangentPairs, circles, 0);
  const sideB = buildOuterTangentSide(tangentPairs, circles, 1);
  const straightSideA = buildOuterTangentStraightSide(tangentPairs, 0);
  const straightSideB = buildOuterTangentStraightSide(tangentPairs, 1);
  const startArc = chooseOuterCircleArc(firstCircle, sideB[0], sideA[0], circles[1].center);
  const endArc = chooseOuterCircleArc(lastCircle, sideA.at(-1), sideB.at(-1), circles.at(-2).center);
  return { sideA, sideB, straightSideA, straightSideB, startArc, endArc };
}

function sortTangentsByCenterLineSide(tangents, circleA, circleB) {
  if (tangents.length < 2) return tangents;
  const a = circleA.pixelCenter;
  const b = circleB.pixelCenter;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const centerMid = {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };

  return [...tangents].sort((left, right) =>
    tangentSideScore(right, centerMid, dx, dy) - tangentSideScore(left, centerMid, dx, dy)
  );
}

function tangentSideScore(tangent, centerMid, dx, dy) {
  const p1 = projectMercatorPixel(tangent[0]);
  const p2 = projectMercatorPixel(tangent[1]);
  const tangentMid = {
    x: (p1.x + p2.x) / 2,
    y: (p1.y + p2.y) / 2
  };
  return dx * (tangentMid.y - centerMid.y) - dy * (tangentMid.x - centerMid.x);
}

function alignTangentPairWithPrevious(previousPair, currentPair) {
  if (previousPair.length < 2 || currentPair.length < 2) return currentPair;

  const keepOrderDistance =
    getMercatorPixelDistanceSq(previousPair[0][1], currentPair[0][0])
    + getMercatorPixelDistanceSq(previousPair[1][1], currentPair[1][0]);
  const swappedOrderDistance =
    getMercatorPixelDistanceSq(previousPair[0][1], currentPair[1][0])
    + getMercatorPixelDistanceSq(previousPair[1][1], currentPair[0][0]);

  return swappedOrderDistance < keepOrderDistance
    ? [currentPair[1], currentPair[0]]
    : currentPair;
}

function buildOuterTangentSide(tangentPairs, circles, tangentIndex) {
  const points = [tangentPairs[0][tangentIndex][0], tangentPairs[0][tangentIndex][1]];

  for (let index = 1; index < tangentPairs.length; index += 1) {
    const previousPoint = tangentPairs[index - 1][tangentIndex][1];
    const nextPoint = tangentPairs[index][tangentIndex][0];
    const oppositePoint = tangentPairs[index][tangentIndex === 0 ? 1 : 0][0];
    const arc = chooseOuterCircleArc(circles[index], previousPoint, nextPoint, oppositePoint);
    points.push(...arc.slice(1), tangentPairs[index][tangentIndex][1]);
  }

  return points;
}

function buildOuterTangentStraightSide(tangentPairs, tangentIndex) {
  return [
    tangentPairs[0][tangentIndex][0],
    ...tangentPairs.map((tangents) => tangents[tangentIndex][1])
  ];
}

function chooseOuterCircleArc(circle, from, to, oppositeCenter) {
  const clockwise = createCircleArc(circle, from, to, true);
  const counterClockwise = createCircleArc(circle, from, to, false);
  return getArcDistanceFromCenter(clockwise, oppositeCenter) > getArcDistanceFromCenter(counterClockwise, oppositeCenter)
    ? clockwise
    : counterClockwise;
}

function createCircleArc(circle, from, to, clockwise) {
  const steps = 32;
  const { pixelCenter, pixelRadius } = projectCircleForTangents(circle);
  const fromPoint = projectMercatorPixel(from);
  const toPoint = projectMercatorPixel(to);
  const start = Math.atan2(fromPoint.y - pixelCenter.y, fromPoint.x - pixelCenter.x);
  let end = Math.atan2(toPoint.y - pixelCenter.y, toPoint.x - pixelCenter.x);

  if (clockwise) {
    while (end > start) end -= Math.PI * 2;
  } else {
    while (end < start) end += Math.PI * 2;
  }

  const points = [];
  for (let index = 0; index <= steps; index += 1) {
    const ratio = index / steps;
    const angle = start + (end - start) * ratio;
    points.push(unprojectMercatorPixel({
      x: pixelCenter.x + pixelRadius * Math.cos(angle),
      y: pixelCenter.y + pixelRadius * Math.sin(angle)
    }));
  }
  return points;
}

function getArcDistanceFromCenter(points, centerLngLat) {
  const target = projectMercatorPixel(centerLngLat);
  const total = points.reduce((sum, point) => {
    const projected = projectMercatorPixel(point);
    const dx = projected.x - target.x;
    const dy = projected.y - target.y;
    return sum + Math.sqrt(dx * dx + dy * dy);
  }, 0);
  return total / Math.max(points.length, 1);
}

function createTyphoonRadiusFeatures(typhoon) {
  const radiusFeatures = [];
  const strongRadius = readRadiusKm(typhoon, ["strongWindRadius", "wind15mRadius", "galeRadius"]);
  const stormRadius = readRadiusKm(typhoon, ["stormRadius", "wind25mRadius", "violentWindRadius"]);
  const strongCenter = typhoon.strongWindCenter?.length === 2 ? typhoon.strongWindCenter : typhoon.center;

  const strongFeature = createTyphoonCircleFeature(strongCenter, strongRadius, {
    color: "#ffeb1a",
    typhoonShape: "windArea",
    fillOpacity: 0.24,
    lineWidth: 1.25,
    popup: buildTyphoonPopup(typhoon, "強風域")
  });
  const stormCenter = typhoon.stormCenter?.length === 2 ? typhoon.stormCenter : typhoon.center;
  const stormFeature = createTyphoonCircleFeature(stormCenter, stormRadius, {
    color: "#ff2800",
    lineColor: "#ff2b12",
    typhoonShape: "windArea",
    fillOpacity: 0.3,
    lineWidth: 1.35,
    popup: buildTyphoonPopup(typhoon, "暴風域")
  });

  if (strongFeature) radiusFeatures.push(strongFeature);
  if (stormFeature) radiusFeatures.push(stormFeature);
  return radiusFeatures;
}

function createTyphoonForecastLabelFeature(circle, typhoon) {
  return {
    type: "Feature",
    geometry: {
      type: "Point",
      coordinates: circle.center
    },
    properties: {
      label: circle.label,
      typhoonShape: "forecastLabel",
      forecastCenter: formatTyphoonForecastCenter(circle.center),
      popup: buildTyphoonPopup(typhoon, `予報円 ${circle.label}`),
      forecastPopup: buildTyphoonForecastCirclePopup(typhoon, circle)
    }
  };
}

function createTyphoonCenterXFeatures(typhoon) {
  const [lng, lat] = typhoon.center;
  const size = 0.13;
  const popup = buildTyphoonPopup(typhoon, "中心位置");
  const properties = {
    color: "#f8fbff",
    typhoonShape: "centerX",
    popup
  };

  return [
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [[lng - size, lat - size], [lng + size, lat + size]]
      },
      properties
    },
    {
      type: "Feature",
      geometry: {
        type: "LineString",
        coordinates: [[lng - size, lat + size], [lng + size, lat - size]]
      },
      properties: {
        ...properties,
        label: typhoon.name
      }
    }
  ];
}

function closeLine(points) {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return points;
  if (first[0] === last[0] && first[1] === last[1]) return points;
  return [...points, first];
}

function hasCircleSet(value) {
  return Array.isArray(value) && value.some((item) =>
    item?.center && Number.isFinite(item.radius)
  );
}

function calcCircleTangents(circleA, circleB) {
  const a = circleA.pixelCenter ?? projectCircleForTangents(circleA).pixelCenter;
  const b = circleB.pixelCenter ?? projectCircleForTangents(circleB).pixelCenter;
  const radiusA = circleA.pixelRadius ?? projectCircleForTangents(circleA).pixelRadius;
  const radiusB = circleB.pixelRadius ?? projectCircleForTangents(circleB).pixelRadius;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const distanceSq = dx * dx + dy * dy;
  const radiusDiff = radiusA - radiusB;
  const tangentSq = distanceSq - radiusDiff * radiusDiff;
  if (distanceSq <= 0 || tangentSq <= 0) return [];

  const distance = Math.sqrt(distanceSq);
  const tangent = Math.sqrt(tangentSq);

  return [-1, 1].map((side) => {
    const normal = {
      x: (dx * radiusDiff - side * dy * tangent) / distanceSq,
      y: (dy * radiusDiff + side * dx * tangent) / distanceSq
    };
    const p1 = {
      x: a.x + normal.x * radiusA,
      y: a.y + normal.y * radiusA
    };
    const p2 = {
      x: b.x + normal.x * radiusB,
      y: b.y + normal.y * radiusB
    };
    return [
      unprojectMercatorPixel(p1),
      unprojectMercatorPixel(p2)
    ];
  });
}

function createProjectedTangentCircles(circles) {
  return circles.map((circle) => ({
    ...circle,
    ...projectCircleForTangents(circle)
  }));
}

function projectCircleForTangents(circle) {
  const pixelCenter = projectMercatorPixel(circle.center);
  const rawEdge = destinationPoint(circle.center, Number(circle.radius) || 0, 90);
  const edge = [unwrapLongitudeNear(rawEdge[0], circle.center[0]), rawEdge[1]];
  const pixelEdge = projectMercatorPixel(edge);
  const dx = pixelEdge.x - pixelCenter.x;
  const dy = pixelEdge.y - pixelCenter.y;
  return {
    pixelCenter,
    pixelRadius: Math.sqrt(dx * dx + dy * dy)
  };
}

function projectMercatorPixel([lng, lat]) {
  const worldSize = 512 * 2 ** 8;
  const clampedLat = Math.max(-85.05112878, Math.min(85.05112878, lat));
  const sin = Math.sin(clampedLat * Math.PI / 180);
  return {
    x: (lng + 180) / 360 * worldSize,
    y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * worldSize
  };
}

function unprojectMercatorPixel(point) {
  const worldSize = 512 * 2 ** 8;
  const lng = point.x / worldSize * 360 - 180;
  const y = 0.5 - point.y / worldSize;
  const lat = 90 - 360 * Math.atan(Math.exp(-y * 2 * Math.PI)) / Math.PI;
  return [lng, lat];
}

function getPointDistanceSq(a, b) {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  return dx * dx + dy * dy;
}

function getMercatorPixelDistanceSq(a, b) {
  const pointA = projectMercatorPixel(a);
  const pointB = projectMercatorPixel(b);
  const dx = pointA.x - pointB.x;
  const dy = pointA.y - pointB.y;
  return dx * dx + dy * dy;
}

function readRadiusKm(typhoon, keys) {
  for (const key of keys) {
    const value = Number(typhoon?.[key]);
    if (Number.isFinite(value)) return value > 1000 ? value / 1000 : value;
  }
  return null;
}

export {
  formatTyphoonForecastCenter,
  buildTyphoonPopup,
  buildTyphoonForecastCirclePopup,
  createTyphoonCircleFeature,
  createTyphoonStormWarningFeatures,
  hasStormWarningCircleGroups,
  createTyphoonStormWarningShapeFeatures,
  createTyphoonForecastAreaFeatures,
  createTyphoonRadiusFeatures,
  createTyphoonForecastLabelFeature,
  createTyphoonCenterXFeatures,
  closeLine,
  hasCircleSet
};
