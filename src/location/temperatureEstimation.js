import { getDistanceKm } from "./distance.js";
import { temperatureObservationTime } from "./temperatureObservation.js";
export { temperatureObservationTime } from "./temperatureObservation.js";
import { TEMPERATURE_ESTIMATION } from "./temperatureEstimationPolicy.js";
import { environmentDifference, environmentSimilarity } from "./environmentProfile.js";
import { temperatureWeatherContext, applyTemperatureWeather } from "./temperatureWeather.js";

const finite = value => typeof value === "number" && Number.isFinite(value);
const median = values => { const sorted = [...values].sort((a, b) => a - b); const i = Math.floor(sorted.length / 2); return sorted.length % 2 ? sorted[i] : (sorted[i - 1] + sorted[i]) / 2; };
const mean = values => values.reduce((a, b) => a + b, 0) / values.length;
export function temperatureErrorMetrics(errors, total = errors.length) {
  return { count: errors.length, total, coverage: total ? errors.length / total : 0,
    mae: errors.length ? mean(errors.map(Math.abs)) : null,
    rmse: errors.length ? Math.sqrt(mean(errors.map(x => x * x))) : null,
    bias: errors.length ? mean(errors) : null,
    maxAbsoluteError: errors.length ? Math.max(...errors.map(Math.abs)) : null };
}
function validCoordinate(coordinates) {
  return Array.isArray(coordinates) && finite(coordinates[0]) && finite(coordinates[1])
    && Math.abs(coordinates[0]) <= 180 && Math.abs(coordinates[1]) <= 90;
}
function localPosition(origin, coordinates) {
  const y = (coordinates[1] - origin[1]) * 111.195;
  const x = (coordinates[0] - origin[0]) * 111.195 * Math.cos(origin[1] * Math.PI / 180);
  return { x, y, bearing: (Math.atan2(x, y) * 180 / Math.PI + 360) % 360 };
}

export function selectTemperatureStations({ points = [], coordinates, observationTime, now = Date.now(), config = {} }) {
  const policy = { ...TEMPERATURE_ESTIMATION, ...config };
  const stamp = temperatureObservationTime(observationTime), time = Date.parse(stamp);
  if (!validCoordinate(coordinates) || !Number.isFinite(time)
    || now - time > policy.maxAgeMs || time - now > policy.futureToleranceMs) return [];
  const seen = new Set();
  return points.flatMap(point => {
    const value = point.values?.temperature;
    if (!point.id || seen.has(String(point.id)) || !finite(value) || value < -90 || value > 60
      || point.temperatureQuality !== 0 || !validCoordinate(point.coordinates)
      || (point.observationTime != null && point.observationTime !== observationTime && point.observationTime !== stamp
        && temperatureObservationTime(point.observationTime) !== stamp)) return [];
    seen.add(String(point.id));
    const distanceKm = getDistanceKm(coordinates, point.coordinates);
    return distanceKm <= policy.maxNearestKm ? [{ ...point, value, distanceKm,
      elevation: finite(point.elevation) ? point.elevation : null,
      ...localPosition(coordinates, point.coordinates) }] : [];
  }).sort((a, b) => a.distanceKm - b.distanceKm);
}

// Reserve representatives in different quadrants, then fill remaining places by distance.
function balancedSelection(points, maximum, reachRatio = 0) {
  const selected = [], quadrants = new Set();
  const directionalLimit = reachRatio > 0 ? Math.min(...points.map(p=>p.distanceKm)) * reachRatio : Infinity;
  for (const point of points) {
    if (point.distanceKm > directionalLimit) continue;
    const quadrant = Math.floor(point.bearing / 90);
    if (!quadrants.has(quadrant) && selected.length < maximum) { selected.push(point); quadrants.add(quadrant); }
  }
  for (const point of points) if (selected.length < maximum && !selected.includes(point)) selected.push(point);
  return selected.sort((a, b) => a.distanceKm - b.distanceKm);
}
function heightSimilarity(point, elevation, policy) {
  if (!(policy.heightSimilarityScaleM > 0) || !finite(elevation) || !finite(point.elevation)) return 1;
  return 1 / (1 + ((point.elevation-elevation) / policy.heightSimilarityScaleM) ** 2);
}
function idw(points, target, elevation, lapse, policy, environment = null, weatherInput = null) {
  let values = points.map(point => {
    const distance = getDistanceKm(target, point.coordinates);
    const similarity = environment ? environmentSimilarity(environment, point.environment, elevation, point.elevation, policy) : 1;
    const weight = similarity * heightSimilarity(point,elevation,policy) / Math.max(policy.minDistanceKm, distance) ** policy.power;
    const corrected = point.value - (finite(elevation) && finite(point.elevation) ? lapse * (elevation - point.elevation) : 0);
    return { point, weight, corrected };
  });
  let weather = null;
  if (weatherInput && policy.weatherEnabled) {
    const context = temperatureWeatherContext({ entries: values, coordinates: target, elevation, environment, ...weatherInput });
    const adjusted = applyTemperatureWeather(values, context, policy);
    const changed = adjusted.some((entry, i) => Math.abs(entry.weight - values[i].weight) > 1e-12 || Math.abs(entry.corrected - values[i].corrected) > 1e-12);
    if (changed) {
      values = adjusted;
      weather = { previousTime: context.previousTime, meanWindSpeed: context.regional.speed,
        windAdjusted: true };
    }
  }
  const sum = values.reduce((sum, entry) => sum + entry.weight, 0);
  const value = values.reduce((sum, entry) => sum + entry.weight * entry.corrected, 0) / sum;
  const spread = Math.sqrt(values.reduce((sum, entry) => sum + entry.weight * (entry.corrected - value) ** 2, 0) / sum);
  return { value, spread, weather, contributions: values.map(entry => ({ id: entry.point.id, name: entry.point.name,
    value: entry.point.value, elevation: entry.point.elevation, distanceKm: getDistanceKm(target, entry.point.coordinates),
    corrected: entry.corrected, weight: entry.weight / sum })) };
}

// Small pivoted normal-equation solve on standardized predictors; reject ill-conditioned geometry.
function solve(matrix, vector) {
  const rows = matrix.map((row, i) => [...row, vector[i]]), size = vector.length;
  let largest = 0, smallest = Infinity;
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let row = col + 1; row < size; row++) if (Math.abs(rows[row][col]) > Math.abs(rows[pivot][col])) pivot = row;
    [rows[col], rows[pivot]] = [rows[pivot], rows[col]];
    const value = rows[col][col]; largest = Math.max(largest, Math.abs(value)); smallest = Math.min(smallest, Math.abs(value));
    if (!finite(value) || Math.abs(value) < 1e-8 || largest / smallest > 1e5) return null;
    for (let j = col; j <= size; j++) rows[col][j] /= value;
    for (let row = 0; row < size; row++) if (row !== col) {
      const scale = rows[row][col]; for (let j = col; j <= size; j++) rows[row][j] -= scale * rows[col][j];
    }
  }
  return rows.map(row => row[size]);
}
export function fitTemperatureLapse(points, { plane = false, config = {} } = {}) {
  const p = { ...TEMPERATURE_ESTIMATION, ...config };
  if (points.length < (plane ? 7 : p.regressionMinStations) || points.some(s => !finite(s.elevation))) return null;
  const heights = points.map(s => s.elevation);
  if (Math.max(...heights) - Math.min(...heights) < p.regressionHeightRange) return null;
  const hCenter = mean(heights), hScale = Math.sqrt(mean(heights.map(h => (h - hCenter) ** 2)));
  const xCenter = mean(points.map(s => s.x)), yCenter = mean(points.map(s => s.y));
  const xScale = Math.sqrt(mean(points.map(s => (s.x - xCenter) ** 2))), yScale = Math.sqrt(mean(points.map(s => (s.y - yCenter) ** 2)));
  if (plane && (xScale < 1 || yScale < 1)) return null;
  const rows = points.map(s => plane ? [1, (s.x - xCenter) / xScale, (s.y - yCenter) / yScale, (s.elevation - hCenter) / hScale]
    : [1, (s.elevation - hCenter) / hScale]);
  const weights = points.map(s => 1 / Math.max(p.minDistanceKm, s.distanceKm) ** p.power), n = rows[0].length;
  const matrix = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => rows.reduce((sum, row, i) => sum + weights[i] * row[a] * row[b], 0)));
  const beta = solve(matrix, Array.from({ length: n }, (_, a) => rows.reduce((sum, row, i) => sum + weights[i] * row[a] * points[i].value, 0)));
  if (!beta) return null;
  const lapse = -beta.at(-1) / hScale;
  if (!finite(lapse) || Math.abs(lapse) > p.maxAbsLapseRate) return null;
  const residuals = rows.map((row, i) => points[i].value - row.reduce((sum, x, j) => sum + x * beta[j], 0));
  const totalWeight = weights.reduce((a, b) => a + b, 0), center = points.reduce((sum, s, i) => sum + weights[i] * s.value, 0) / totalWeight;
  const sse = residuals.reduce((sum, r, i) => sum + weights[i] * r * r, 0);
  const sst = points.reduce((sum, s, i) => sum + weights[i] * (s.value - center) ** 2, 0);
  const r2 = sst > 1e-8 ? 1 - sse / sst : 0;
  const mad = median(residuals.map(r => Math.abs(r - median(residuals))));
  if (r2 < p.regressionMinR2 || Math.max(...residuals.map(Math.abs)) > Math.max(2.5, 3 * 1.4826 * mad)) return null;
  return { lapse, r2, plane };
}

// Inner station-wise cross-validation; the target is never used for fitting.
export function validatedDynamicLapse(points, target, policy = TEMPERATURE_ESTIMATION) {
  const candidates = [];
  for (const plane of [false, true]) {
    const fit = fitTemperatureLapse(points, { plane, config: policy });
    if (!fit) continue;
    const fixedErrors = [], errors = [], rates = [];
    for (let i = 0; i < points.length; i++) {
      const held = points[i], train = points.filter((_, j) => j !== i);
      const local = train.map(s => ({ ...s, distanceKm: getDistanceKm(held.coordinates, s.coordinates), ...localPosition(held.coordinates, s.coordinates) }));
      const fold = fitTemperatureLapse(local, { plane, config: policy });
      if (!fold) break;
      errors.push(idw(train, held.coordinates, held.elevation, fold.lapse, policy).value - held.value);
      fixedErrors.push(idw(train, held.coordinates, held.elevation, policy.lapseRate, policy).value - held.value);
      rates.push(fold.lapse);
    }
    if (errors.length !== points.length) continue;
    const dynamic = temperatureErrorMetrics(errors), fixed = temperatureErrorMetrics(fixedErrors);
    const rateStd = Math.sqrt(mean(rates.map(r => (r - mean(rates)) ** 2)));
    if (rateStd > policy.maxLapseStd || fixed.mae - dynamic.mae < policy.dynamicMinImprovementC
      || dynamic.mae > fixed.mae * (1 - policy.dynamicMinImprovementRatio)
      || dynamic.maxAbsoluteError > fixed.maxAbsoluteError * 1.1) continue;
    candidates.push({ ...fit, validation: { dynamic, fixed, rateStd } });
  }
  return candidates.sort((a, b) => a.validation.dynamic.mae - b.validation.dynamic.mae)[0] ?? null;
}

export function estimateLocalTemperature({ points = [], coordinates, elevation = null, observationTime,
  now = Date.now(), config = {}, method = "auto", environment = null, history = [] }) {
  const policy = { ...TEMPERATURE_ESTIMATION, ...config };
  const valid = selectTemperatureStations({ points, coordinates, observationTime, now, config: policy });
  const nearest = valid[0] ?? null, stamp = temperatureObservationTime(observationTime);
  const base = { nearestUsed: null, diagnostics: {nearestUsedDistanceKm:null,maximumContribution:nearest?1:null,effectiveStationCount:nearest?1:0}, nearest: nearest ? { id: nearest.id, name: nearest.name, value: nearest.value, elevation: nearest.elevation, distanceKm: nearest.distanceKm } : null,
    observationTime: stamp, targetElevation: finite(elevation) ? elevation : null, confidence: "unavailable", flags: [], stationCount: 0 };
  const fallback = reason => ({ ...base, kind: nearest ? "observed" : "unavailable", method: nearest ? "nearest" : "unavailable",
    value: nearest?.value ?? null, flags: [reason], confidence: nearest ? "low" : "unavailable", stationCount: nearest ? 1 : 0, stations: [] });
  if (!nearest) return fallback("no-valid-observations");
  if (nearest.distanceKm <= policy.coincidentKm || method === "nearest") return { ...fallback("station-observation"), confidence: "high" };
  const eligible = valid.filter(s => s.distanceKm <= policy.radiusKm && s.landConnected !== false);
  let candidates = eligible;
  const heightAvailable = finite(elevation) && eligible.filter(s => finite(s.elevation)).length >= policy.minStations;
  if (heightAvailable && method !== "idw") candidates = eligible.filter(s => finite(s.elevation) && Math.abs(s.elevation - elevation) <= policy.maxStationHeightDifference);
  const environmentAvailable = heightAvailable && environment && candidates.length >= policy.minStations
    && candidates.every(s=>environmentDifference(environment,s.environment,elevation,s.elevation));
  const useEnvironment = environmentAvailable && policy.environmentStrength > 0 && (method === "auto" || method === "environment");
  const heightWeighted = heightAvailable && method !== "idw" && policy.heightSimilarityScaleM > 0;
  const weightingPolicy = heightWeighted ? policy : {...policy,heightSimilarityScaleM:0};
  const influence = point => heightSimilarity(point,elevation,weightingPolicy)
    * (useEnvironment ? environmentSimilarity(environment,point.environment,elevation,point.elevation,policy) : 1);
  if (useEnvironment || heightWeighted) candidates = [...candidates].sort((a,b)=>
    a.distanceKm / influence(a) ** (1/policy.power) - b.distanceKm / influence(b) ** (1/policy.power));
  const selected = balancedSelection(candidates, policy.maxStations, policy.directionalReachRatio);
  if (selected.length < policy.minStations) return fallback("too-few-stations");
  const nearestUsed = selected[0];
  const bearing = selected.map(s => s.bearing).sort((a, b) => a - b);
  const maxGap = Math.max(...bearing.map((b, i) => (i === bearing.length - 1 ? bearing[0] + 360 : bearing[i + 1]) - b));
  const outsideHull = maxGap > 180 + 1e-6;
  if (maxGap > policy.rejectBearingGap && nearestUsed.distanceKm > policy.distantKm) return fallback("unsupported-extrapolation");
  if (heightAvailable && method !== "idw") {
    const heights = selected.map(s => s.elevation);
    if (elevation > Math.max(...heights) + policy.maxHeightExtrapolation || elevation < Math.min(...heights) - policy.maxHeightExtrapolation
      || Math.abs(elevation - median(heights)) > policy.maxMedianHeightDifference) return fallback("height-extrapolation");
  }
  let chosen = heightAvailable && method !== "idw" ? "fixed-idw" : "idw", lapse = chosen === "idw" ? 0 : policy.lapseRate;
  const dynamic = chosen !== "idw" && (method === "dynamic" || (method === "auto" && policy.dynamicEnabled))
    ? validatedDynamicLapse(selected, coordinates, policy) : null;
  if (dynamic) { chosen = "dynamic-idw"; lapse = dynamic.lapse; }
  const result = idw(selected, coordinates, elevation, lapse, weightingPolicy, useEnvironment ? environment : null,
    method === "auto" ? { timeMs: Date.parse(stamp), history } : null);
  const flags = [];
  if (chosen === "idw") flags.push("no-height-correction");
  if (outsideHull) flags.push("outside-station-hull");
  if (maxGap > policy.warningBearingGap) flags.push("directional-imbalance");
  if (result.spread > policy.warningSpreadC) flags.push("temperature-spread");
  if (nearestUsed.distanceKm > policy.distantKm) flags.push("distant-stations");
  if (now - Date.parse(stamp) > policy.maxAgeMs / 2) flags.push("aging-observations");
  if (chosen !== "idw" && Math.abs(elevation - mean(selected.map(s => s.elevation))) > policy.warningHeightDifference) flags.push("large-height-correction");
  if (method === "dynamic" && !dynamic) flags.push("dynamic-not-validated");
  if (result.spread > policy.maxSpreadC) return fallback("excessive-temperature-spread");
  return { ...base, kind: "estimated", method: chosen, value: result.value, lapseRate: lapse,
    weatherAdjusted: Boolean(result.weather),
    environment: environment ?? null, environmentAdjusted: Boolean(useEnvironment), heightWeighted,
    stationCount: selected.length, stations: result.contributions, flags,
    nearestUsed: {id:nearestUsed.id,name:nearestUsed.name,distanceKm:nearestUsed.distanceKm,elevation:nearestUsed.elevation,value:nearestUsed.value},
    confidence: flags.length ? "low" : selected.length >= policy.highConfidenceStations && nearestUsed.distanceKm < policy.highConfidenceNearestKm ? "high" : "medium",
    diagnostics: { nearestUsedDistanceKm:nearestUsed.distanceKm,
      maximumContribution:Math.max(...result.contributions.map(s=>s.weight)),
      effectiveStationCount:1/result.contributions.reduce((sum,s)=>sum+s.weight*s.weight,0), outsideHull, maximumBearingGap: maxGap, meanDistanceKm: mean(selected.map(s => s.distanceKm)),
      correctedSpreadC: result.spread, ageMs: now - Date.parse(stamp), dynamic, weather: result.weather } };
}
