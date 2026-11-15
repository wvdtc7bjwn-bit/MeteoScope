import { FAULT_MODEL_PRESETS, NANKAI_RUPTURE_CASES } from "./faultPresets.js";
import { classifyIntensity, createWeSimulatorModel } from "./weSimulatorModel.js";
import { getTravelTimesByJma2001 } from "../eew/jma2001TravelTime.js";
import { getDistanceKm } from "../location/distance.js";
import { getEarthquakeIntensityRank } from "../earthquakeIntensity.js";
import { estimateReferenceIntensity } from "./intensityModel.js";

export { FAULT_MODEL_PRESETS };
export const SIMULATION_DEFAULTS = Object.freeze({ model: "point", nankaiCase: "full", longitude: 139.76, latitude: 35.68, magnitude: 5.5, depthKm: 10, ruptureOrigin: "center", ruptureSpeed: 2.8 });

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

export async function prepareEarthquakeSimulation(input, rawStations, { signal, yieldTask = () => new Promise(resolve => setTimeout(resolve, 0)) } = {}) {
  const options = normalizeSimulationOptions(input);
  const sources = buildSimulationSources(options);
  const model = createWeSimulatorModel({ magnitude: options.magnitude, latitude: options.latitude, longitude: options.longitude, offshore: options.model !== "point" });
  const stations = [];
  const entries = Object.entries(rawStations ?? {});
  for (let index = 0; index < entries.length; index++) {
    if (index % 256 === 0) { await yieldTask(); signal?.throwIfAborted(); }
    const [key, raw] = entries[index];
    const coordinates = [raw?.longitude, raw?.latitude];
    if (coordinates.some(v => v == null || String(v).trim() === "" || !Number.isFinite(Number(v)))) continue;
    const point = coordinates.map(Number);
    if (Math.abs(point[0]) > 180 || Math.abs(point[1]) > 85) continue;
    let distance = Infinity;
    let pArrivalSec = Infinity;
    let sArrivalSec = Infinity;
    for (const source of sources) {
      const surfaceDistance = getDistanceKm(source.coordinates, point);
      const arrival = getTravelTimesByJma2001(options.depthKm, surfaceDistance);
      distance = Math.min(distance, surfaceDistance);
      pArrivalSec = Math.min(pArrivalSec, arrival.pArrivalSec + source.ruptureDelaySec);
      sArrivalSec = Math.min(sArrivalSec, arrival.sArrivalSec + source.ruptureDelaySec);
    }
    const predictedIntensityValue = estimateReferenceIntensity({ magnitude: options.magnitude, depthKm: options.depthKm, ruptureDistanceKm: Math.hypot(distance, options.depthKm), interplate: options.model !== "point" });
    stations.push({
      id: String(raw.code || key), name: String(raw.name || raw.code || key), coordinates: point,
      epicentralDistanceKm: distance, pArrivalSec, sArrivalSec, predictedIntensityValue,
      ...model.getStationWaveResponseProperties(key, predictedIntensityValue)
    });
  }
  signal?.throwIfAborted();
  if (!stations.length) throw new Error("観測点データが空です。再読み込みしてください。");
  const affected = stations.filter(s => s.predictedIntensityValue >= .5 && Number.isFinite(s.sArrivalSec));
  const duration = Math.max(60, ...affected.map(s => s.sArrivalSec + 30), ...sources.map(s => s.ruptureDelaySec + 45));
  const maxIntensity = classifyIntensity(Math.max(...stations.map(s => s.predictedIntensityValue))).label;
  const origin = sources.find(s => s.ruptureDelaySec === 0) ?? sources[0];
  const name = getFaultModelPreset(options)?.name ?? "任意震源";
  const reports = model.buildSyntheticSimulationMagnitudeReports(options.magnitude, stations, duration);
  const ruptureComplete = Math.max(...sources.map(source => source.ruptureDelaySec));
  const baseEvent = {
    eventId: "METEOSCOPE-SIMULATION", source: "WE-Simulator / MeteoScope", isSimulation: true,
    hypocenter: name, coordinates: origin.coordinates, depth: options.depthKm, magnitude: options.magnitude,
    maxIntensity, serial: 1, isWarn: getEarthquakeIntensityRank(maxIntensity) >= 5,
    canRenderWaves: true, isCancel: false, isFinal: false, warnAreas: [], hypocenterReliability: "simulation"
  };
  return {
    options, sources, stations, duration, name,
    frame(elapsedSeconds) {
      const elapsed = Math.max(0, Math.min(duration, elapsedSeconds));
      const features = stations.map(station => {
        const shaking = model.getCurrentIntensityProperties(station, elapsed);
        const active = shaking.observed && elapsed <= station.sArrivalSec + 16 + Math.max(0, options.magnitude - 6) * 5;
        return { type: "Feature", geometry: { type: "Point", coordinates: station.coordinates }, properties: {
          id: station.id, name: station.name,
          intensity: shaking.observed ? shaking.intensityLabel : "0",
          color: shaking.observed ? shaking.intensityColor : "#8c9dad",
          textColor: shaking.intensityTextColor, active: active && shaking.intensityRank > 0,
          arrived: shaking.observed, wave: shaking.observed ? shaking.waveState.toUpperCase() : "",
          pArrivalSec: Number.isFinite(station.pArrivalSec) ? station.pArrivalSec : null,
          sArrivalSec: Number.isFinite(station.sArrivalSec) ? station.sArrivalSec : null,
          predictedIntensity: classifyIntensity(station.predictedIntensityValue).label
        } };
      });
      return {
        elapsed, stations: { type: "FeatureCollection", features },
        event: { ...baseEvent, serial: reports.findLast(report => report.elapsedSec <= elapsed)?.reportNumber ?? 0,
          waitingForDetection: elapsed < (reports[0]?.elapsedSec ?? Infinity),
          isFinal: reports.length > 0 && elapsed >= reports.at(-1).elapsedSec && elapsed >= ruptureComplete,
          simulationElapsedSeconds: elapsed, simulationWaveSources: sources },
        fault: createFaultFeatures(options, sources, elapsed)
      };
    }
  };
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
