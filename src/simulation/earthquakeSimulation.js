import { FAULT_MODEL_PRESETS, NANKAI_RUPTURE_CASES } from "./faultPresets.js";
import { classifyIntensity, createWeSimulatorModel } from "./weSimulatorModel.js";
import { getTravelTimesByJma2001 } from "../eew/jma2001TravelTime.js";
import { getDistanceKm } from "../location/distance.js";
import { estimateSimulationIntensity, MAX_REFERENCE_INTENSITY_DEPTH_KM } from "./intensityModel.js";
import { createDeepTrenchLookup } from "./deepEarthquake.js";
export { MAX_REFERENCE_INTENSITY_DEPTH_KM } from "./intensityModel.js";
import { buildSimulationEewReports } from "./eewEstimates.js";
import { getSimulationGround } from "./groundModel.js";
import { findSimulationEpicenterName, createSimulationRegionLookup } from "./epicenterRegion.js";
export { loadSimulationGroundModel } from "./groundModel.js";
export { loadSimulationDetectionStations } from "./detectionStations.js";

export { FAULT_MODEL_PRESETS };
export const SIMULATION_DEFAULTS = Object.freeze({ model: "point", nankaiCase: "full", longitude: 139.76, latitude: 35.68, magnitude: 5.5, depthKm: 10, ruptureOrigin: "center", ruptureSpeed: 2.8, groundCorrection: "none" });

export function normalizeSimulationOptions(input = {}) {
  const options = { ...SIMULATION_DEFAULTS, ...input };
  if (options.model !== "point" && !Object.hasOwn(FAULT_MODEL_PRESETS, options.model)) throw new RangeError("Unknown simulation model");
  if (!Object.hasOwn(NANKAI_RUPTURE_CASES, options.nankaiCase)) throw new RangeError("Invalid Nankai rupture case");
  for (const [key, min, max] of [["longitude", -180, 180], ["latitude", -85, 85], ["magnitude", 1, 9.5], ["depthKm", 0, 700], ["ruptureSpeed", 0.5, 4]]) {
    if (options[key] == null || String(options[key]).trim() === "") throw new RangeError(`Missing ${key}`);
    const value = Number(options[key]);
    if (!Number.isFinite(value) || value < min || value > max) throw new RangeError(`Invalid ${key}`);
    options[key] = value;
  }
  if (!["start", "center", "end"].includes(options.ruptureOrigin)) throw new RangeError("Invalid rupture origin");
  if (!["none", "jshis-1km"].includes(options.groundCorrection)) throw new RangeError("Invalid ground correction");
  return options;
}

export function getFaultModelPreset(options) {
  const preset = FAULT_MODEL_PRESETS[options.model];
  if (!preset || options.model !== "nankai-trough" || options.nankaiCase === "full") return preset;
  const variant = NANKAI_RUPTURE_CASES[options.nankaiCase];
  if (!variant) throw new RangeError("Invalid Nankai rupture case");
  return { ...preset, ...variant, path: preset.path.slice(...variant.pathRange.map(value => value ?? undefined)), areaSides: {
    left: preset.areaSides.left.slice(...variant.areaRange.map(value => value ?? undefined)),
    right: preset.areaSides.right.slice(...variant.areaRange.map(value => value ?? undefined))
  } };
}

// Adapted from WE-Simulator getFaultSourceSamples / getPointAlongFaultPath.
// Sample spacing and propagation delay preserve its finite-source approach.
export function buildSimulationSources(input) {
  const options = normalizeSimulationOptions(input);
  const preset = getFaultModelPreset(options);
  if (!preset) return [{ coordinates: [options.longitude, options.latitude], ruptureDelaySec: 0 }];
  const path = preset.path;
  const lengths = path.slice(1).map((point, index) => getDistanceKm(path[index], point));
  const length = lengths.reduce((a, b) => a + b, 0);
  const origin = options.ruptureOrigin === "start" ? 0 : options.ruptureOrigin === "end" ? length : length / 2;
  const intervals = Math.max(1, Math.ceil(length / Math.max(length / 16, 12)));
  const positions = Array.from({ length: intervals + 1 }, (_, i) => length * i / intervals);
  if (!positions.some(value => Math.abs(value - origin) < .01)) positions.push(origin);
  return positions.sort((a, b) => a - b).map(along => {
    let traversed = 0;
    let index = 0;
    while (index < lengths.length - 1 && traversed + lengths[index] < along) traversed += lengths[index++];
    const ratio = lengths[index] > 0 ? (along - traversed) / lengths[index] : 0;
    return {
      coordinates: path[index].map((value, dimension) => value + (path[index + 1][dimension] - value) * ratio),
      ruptureDelaySec: Math.abs(along - origin) / options.ruptureSpeed
    };
  });
}

export function getSimulationPresetOptions(model, nankaiCase = "full") {
  const preset = getFaultModelPreset({ model, nankaiCase });
  if (!preset) return { ...SIMULATION_DEFAULTS };
  const middle = preset.path[Math.floor(preset.path.length / 2)];
  return { ...SIMULATION_DEFAULTS, model, nankaiCase, longitude: middle[0], latitude: middle[1], magnitude: preset.magnitudeValue, depthKm: preset.depthKm };
}

export async function prepareEarthquakeSimulation(input, rawStations, { signal, groundModel, epicenterRegions, forecastAreas, detectionStations = [], plateBoundaries, yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  const options = normalizeSimulationOptions(input);
  const deepApproximation = options.depthKm > MAX_REFERENCE_INTENSITY_DEPTH_KM;
  const inJapanRegion = options.longitude >= 120 && options.longitude <= 170 && options.latitude >= 20 && options.latitude <= 60;
  const trenchDistance = deepApproximation && inJapanRegion ? createDeepTrenchLookup(plateBoundaries) : null;
  const intensityEstimateAvailable = !deepApproximation || Boolean(trenchDistance);
  if (intensityEstimateAvailable && options.groundCorrection !== "none" && !groundModel) throw new Error("Ground model is required");
  const sources = buildSimulationSources(options);
  const model = createWeSimulatorModel({ magnitude: options.magnitude, depthKm: options.depthKm, latitude: options.latitude, longitude: options.longitude, offshore: options.model !== "point" });
  const stations = [];
  const findForecastArea = createSimulationRegionLookup(forecastAreas);
  const entries = Object.entries(rawStations ?? {});
  for (let index = 0; index < entries.length; index++) {
    if (index % 256 === 0) { await yieldTask(); signal?.throwIfAborted(); }
    const [key, raw] = entries[index];
    const coordinates = [raw?.longitude, raw?.latitude];
    if (coordinates.some(v => v == null || String(v).trim() === "" || !Number.isFinite(Number(v)))) continue;
    const point = coordinates.map(Number);
    if (Math.abs(point[0]) > 180 || Math.abs(point[1]) > 85) continue;
    const { distance, pArrivalSec, sArrivalSec, sourceDistancesKm, sourceSArrivalSecs } = calculateTravelMetrics(point, options, sources);
    const ground = intensityEstimateAvailable && options.groundCorrection !== "none" ? getSimulationGround(groundModel, point) : null;
    const area = findForecastArea(point);
    const trenchDistanceKm = trenchDistance?.(point) ?? null;
    const predictedIntensityValue = estimateSimulationIntensity({ magnitude: options.magnitude, depthKm: options.depthKm, ruptureDistanceKm: Math.hypot(distance, options.depthKm), interplate: options.model !== "point", groundArv: ground?.arv ?? 1, trenchDistanceKm });
    const groundResponse = ground ? { groundAvs: ground.avs ?? 400, groundAmplification: 1.72 * Math.log10(ground.arv) } : {};
    const strongThreshold = Math.max(.5, predictedIntensityValue - 1);
    const lastStrongSArrivalSec = Math.max(sArrivalSec, ...sourceDistancesKm.flatMap((sourceDistance, sourceIndex) => {
      const intensity = estimateSimulationIntensity({ magnitude: options.magnitude, depthKm: options.depthKm, ruptureDistanceKm: Math.hypot(sourceDistance, options.depthKm), interplate: options.model !== "point", groundArv: ground?.arv ?? 1, trenchDistanceKm });
      return Number.isFinite(sourceSArrivalSecs[sourceIndex]) && intensity >= strongThreshold ? [sourceSArrivalSecs[sourceIndex]] : [];
    }));
    const station = {
      id: String(raw.code || key), name: String(raw.name || raw.code || key), coordinates: point,
      epicentralDistanceKm: distance, sourceDistancesKm, pArrivalSec, sArrivalSec, lastStrongSArrivalSec, predictedIntensityValue,
      groundArv: ground?.arv ?? null, groundMeshCode: ground?.code ?? null, trenchDistanceKm, ...groundResponse,
      forecastAreaCode: area?.code ?? "", forecastAreaName: area?.name ?? "",
      ...model.getStationWaveResponseProperties(key, predictedIntensityValue, groundResponse)
    };
    stations.push({ ...station, ...model.getStationShakingTiming(station) });
  }
  signal?.throwIfAborted();
  if (!stations.length) throw new Error("観測点データが空です。再読み込みしてください。");
  const affected = stations.filter(s => (!intensityEstimateAvailable || s.predictedIntensityValue >= .5) && Number.isFinite(s.sArrivalSec));
  const physicalDuration = Math.max(60, ...affected.map(s => intensityEstimateAvailable ? s.shakingEndSec + 2 : s.sArrivalSec + 30), ...sources.map(s => s.ruptureDelaySec + 45));
  const origin = sources.find(s => s.ruptureDelaySec === 0) ?? sources[0];
  const name = getFaultModelPreset(options)?.name ?? (findSimulationEpicenterName(epicenterRegions, origin.coordinates) || "震源地名不明");
  const groundCoverage = { corrected: stations.filter(station => station.groundArv !== null).length, total: stations.length };
  const offshoreDetectors = detectionStations.filter(station => Array.isArray(station.coordinates) && station.coordinates.length === 2 && station.coordinates.every(Number.isFinite)
    && Math.abs(station.coordinates[0]) <= 180 && Math.abs(station.coordinates[1]) <= 85).map(station => {
    const metrics = calculateTravelMetrics(station.coordinates, options, sources);
    return { ...metrics, predictedIntensityValue: estimateSimulationIntensity({ magnitude: options.magnitude, depthKm: options.depthKm, ruptureDistanceKm: Math.hypot(metrics.distance, options.depthKm), interplate: options.model !== "point", trenchDistanceKm: trenchDistance?.(station.coordinates) ?? null }) };
  });
  const ruptureComplete = Math.max(...sources.map(source => source.ruptureDelaySec));
  const schedule = model.buildSyntheticSimulationMagnitudeReports(options.magnitude, [...stations, ...offshoreDetectors], Infinity);
  const reports = buildSimulationEewReports({ options, stations, sources, schedule, ruptureCompleteSec: ruptureComplete, intensityEstimateAvailable,
    getObservedIntensity: (station, elapsed) => { const value = model.getCurrentIntensityProperties(station, elapsed); return value.observed ? value.recordedIntensityValue : 0; } });
  // Distant/deep instrumental detections can occur after the felt-shaking timeline.
  const duration = Math.max(physicalDuration, (reports.at(-1)?.elapsedSec ?? 0) + 8);
  const baseEvent = {
    eventId: "METEOSCOPE-SIMULATION", source: "WE-Simulator / MeteoScope", isSimulation: true,
    hypocenter: name, coordinates: origin.coordinates,
    intensityEstimateAvailable,
    deepApproximation,
    uncertaintyLabel: !intensityEstimateAvailable ? "深発近似データ未取得：震度推定なし" : deepApproximation ? "深発近似（学習用・異常震域は概算）" : "",
    canRenderWaves: true, isCancel: false, isFinal: false, hypocenterReliability: "simulation"
  };
  const renderCache = new Map();
  const staticProperties = stations.map(station => ({ id: station.id, name: station.name,
    intensityEstimateAvailable: Number.isFinite(station.predictedIntensityValue), deepApproximation,
    pArrivalSec: Number.isFinite(station.pArrivalSec) ? station.pArrivalSec : null,
    sArrivalSec: Number.isFinite(station.sArrivalSec) ? station.sArrivalSec : null,
    predictedIntensity: Number.isFinite(station.predictedIntensityValue) ? classifyIntensity(station.predictedIntensityValue).label : null,
    groundArv: station.groundArv, groundMeshCode: station.groundMeshCode }));
  return {
    options, sources, stations, duration, name, reports, groundCoverage, intensityEstimateAvailable, deepApproximation, detectionStationCount: offshoreDetectors.length,
    frame(elapsedSeconds, { intensityDisplay = "current", renderOnly = false } = {}) {
      const elapsed = Math.max(0, Math.min(duration, elapsedSeconds));
      const features = stations.map((station, index) => {
        const shaking = model.getCurrentIntensityProperties(station, elapsed);
        const recordedIntensity = Number.isFinite(station.predictedIntensityValue) ? classifyIntensity(shaking.recordedIntensityValue).label : null;
        const display = intensityDisplay === "maximum" && shaking.observed
          ? classifyIntensity(shaking.recordedIntensityValue) : { label: shaking.intensityLabel, rank: shaking.intensityRank, color: shaking.intensityColor, textColor: shaking.intensityTextColor };
        const dynamic = {
          intensity: shaking.observed ? display.label : "0", currentIntensity: shaking.observed ? shaking.intensityLabel : "0",
          color: display.rank > 0 ? display.color : "#8c9dad",
          textColor: display.textColor, active: shaking.observed && !shaking.settled && shaking.intensityRank > 0,
          arrived: shaking.observed, settled: shaking.settled, wave: shaking.observed ? shaking.waveState.toUpperCase() : "",
          recordedIntensity, intensityRank: display.rank
        };
        const previous = renderCache.get(station.id);
        if (renderOnly && previous && Object.keys(dynamic).every(key => previous.properties[key] === dynamic[key])) return previous;
        const feature = { type: "Feature", geometry: { type: "Point", coordinates: station.coordinates }, properties: {
          ...staticProperties[index], ...dynamic, ...(!renderOnly ? { currentIntensityValue: shaking.currentIntensityValue } : {})
        } };
        if (renderOnly) renderCache.set(station.id, feature);
        return feature;
      });
      const report = reports.findLast(report => report.elapsedSec <= elapsed);
      return {
        elapsed, stations: { type: "FeatureCollection", features },
        event: { ...baseEvent, serial: report?.reportNumber ?? 0,
          magnitude: report?.magnitude ?? null, depth: report?.depth ?? null, maxIntensity: report?.maxIntensity ?? null,
          isWarn: report?.isWarn ?? false, waitingForDetection: !report, isFinal: report?.isFinal ?? false,
          warnAreas: report?.warnAreas ?? [],
          simulationDetecting: elapsed < (reports[0]?.detectedAtSec ?? Infinity),
          simulationElapsedSeconds: elapsed, simulationWaveSources: sources, simulationWaveDepthKm: options.depthKm },
        fault: createFaultFeatures(options, sources, elapsed)
      };
    }
  };
}

function calculateTravelMetrics(point, options, sources) {
  let distance = Infinity;
  let pArrivalSec = Infinity;
  let sArrivalSec = Infinity;
  const sourceDistancesKm = [];
  const sourceSArrivalSecs = [];
  for (const source of sources) {
    const surfaceDistance = getDistanceKm(source.coordinates, point);
    sourceDistancesKm.push(surfaceDistance);
    const arrival = getTravelTimesByJma2001(options.depthKm, surfaceDistance);
    sourceSArrivalSecs.push(arrival.sArrivalSec + source.ruptureDelaySec);
    distance = Math.min(distance, surfaceDistance);
    pArrivalSec = Math.min(pArrivalSec, arrival.pArrivalSec + source.ruptureDelaySec);
    sArrivalSec = Math.min(sArrivalSec, arrival.sArrivalSec + source.ruptureDelaySec);
  }
  return { distance, pArrivalSec, sArrivalSec, sourceDistancesKm, sourceSArrivalSecs };
}

function createFaultFeatures(options, sources, elapsed) {
  const preset = getFaultModelPreset(options);
  if (!preset) return { type: "FeatureCollection", features: [] };
  const ring = [...preset.areaSides.left, ...preset.areaSides.right.toReversed(), preset.areaSides.left[0]];
  return { type: "FeatureCollection", features: [
    { type: "Feature", properties: { kind: "area" }, geometry: { type: "Polygon", coordinates: [ring] } },
    ...sources.map(s => ({ type: "Feature", properties: { kind: "rupture", ruptured: elapsed >= s.ruptureDelaySec }, geometry: { type: "Point", coordinates: s.coordinates } }))
  ] };
}
