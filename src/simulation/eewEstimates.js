import { classifyIntensity } from "./weSimulatorModel.js";
import { getEarthquakeIntensityRank } from "../earthquakeIntensity.js";
import { estimateSimulationIntensity, MAX_REFERENCE_INTENSITY_DEPTH_KM, DEEP_PATH_BLEND_END_KM } from "./intensityModel.js";

// A deterministic teaching scenario, not a reproduction of JMA's EEW analysis.
// Only bulletin estimates change; the configured source and wave clock stay fixed.
export function buildSimulationEewReports({ options, stations, sources = [], schedule, ruptureCompleteSec, intensityEstimateAvailable = options.depthKm <= MAX_REFERENCE_INTENSITY_DEPTH_KM, getObservedIntensity = () => 0 }) {
  if (!schedule.length) return [];
  const firstTime = schedule[0].elapsedSec;
  const originalEnd = schedule.at(-1).elapsedSec;
  const finalTime = Math.max(originalEnd, ruptureCompleteSec + 2);
  const timeline = schedule.map(report => ({ ...report }));
  // Extend reviews after the fast initial analysis; never stretch earlier bulletins.
  while (timeline.at(-1).elapsedSec < finalTime) timeline.push({ elapsedSec: Math.min(finalTime, Number((timeline.at(-1).elapsedSec + 3).toFixed(2))), detectedAtSec: schedule[0].detectedAtSec });
  const initialMagnitude = Math.max(1, Math.min(6.8, options.magnitude - .35 - .12 * Math.max(0, options.magnitude - 5)));
  // Keep synthetic early estimates in the configured deep model's domain.
  // A fabricated 130 km estimate for a 172 km event disables path attenuation
  // and creates broad warnings that disappear as the reported depth converges.
  // The final bulletin still uses the exact configured depth, including 151 km.
  const minimumEstimatedDepth = options.depthKm > MAX_REFERENCE_INTENSITY_DEPTH_KM ? DEEP_PATH_BLEND_END_KM : 0;
  const initialDepth = Math.max(minimumEstimatedDepth, Math.min(700, Math.round((options.depthKm + (options.depthKm < 70 ? 10 : -Math.min(80, options.depthKm * .25))) / 10) * 10));
  return timeline.map((report, index) => {
    const isFinal = index === timeline.length - 1;
    const progress = originalEnd > firstTime ? Math.min(1, (report.elapsedSec - firstTime) / (originalEnd - firstTime)) : 1;
    const remaining = (1 - progress) ** 2.4;
    const magnitude = isFinal ? options.magnitude : Number((options.magnitude + (initialMagnitude - options.magnitude) * remaining).toFixed(1));
    const depth = isFinal ? options.depthKm : Math.max(minimumEstimatedDepth, Math.min(700, Math.round((options.depthKm + (initialDepth - options.depthKm) * remaining) / 5) * 5));
    const elapsedSec = report.elapsedSec;
    const activeSourceIndices = sources.flatMap((source, index) => source.ruptureDelaySec <= elapsedSec ? [index] : []);
    const predictions = intensityEstimateAvailable ? stations.map(station => {
      const distance = activeSourceIndices.length && station.sourceDistancesKm
        ? Math.min(...activeSourceIndices.map(index => station.sourceDistancesKm[index])) : station.epicentralDistanceKm;
      const predicted = estimateSimulationIntensity({ magnitude, depthKm: depth, ruptureDistanceKm: Math.hypot(distance, depth), interplate: options.model !== "point", groundArv: station.groundArv ?? 1, trenchDistanceKm: station.trenchDistanceKm, deepApproximation: options.depthKm > MAX_REFERENCE_INTENSITY_DEPTH_KM });
      return predicted === null ? null : Math.max(getObservedIntensity(station, elapsedSec) ?? 0, predicted);
    }) : [];
    const maxIntensity = intensityEstimateAvailable ? classifyIntensity(Math.max(...predictions)).label : null;
    const isWarn = getEarthquakeIntensityRank(maxIntensity) >= 5;
    const areas = new Map();
    // Deep intensities are educational approximations, not regional EEW forecasts.
    // Use configured depth so coarse early bulletin estimates cannot enable areas.
    if (isWarn && options.depthKm <= MAX_REFERENCE_INTENSITY_DEPTH_KM) stations.forEach((station, index) => {
      if (!station.forecastAreaCode || !station.forecastAreaName) return;
      const intensity = classifyIntensity(predictions[index]);
      if (intensity.rank < 4 || (areas.get(station.forecastAreaCode)?.rank ?? -1) >= intensity.rank) return;
      areas.set(station.forecastAreaCode, { code: station.forecastAreaCode, name: station.forecastAreaName, from: intensity.label, to: intensity.label, rank: intensity.rank, isWarning: true, intensityMethod: "simulation", source: "MeteoScope simulation" });
    });
    return { reportNumber: index + 1, elapsedSec, detectedAtSec: report.detectedAtSec, magnitude, depth, maxIntensity, isWarn, warnAreas: [...areas.values()], isFinal };
  });
}
