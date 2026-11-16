import { classifyIntensity, getSimulationMagnitudeDurationSec } from "./weSimulatorModel.js";
import { getEarthquakeIntensityRank } from "../earthquakeIntensity.js";
import { estimateSimulationIntensity, MAX_REFERENCE_INTENSITY_DEPTH_KM, DEEP_PATH_BLEND_END_KM } from "./intensityModel.js";
import {isInterplateSimulation} from "./activeFault.js";
import {buildSimulationReviewTimes} from "./reportTiming.js";

// Bounded revisions of the initial analysis, not measured forecast errors.
// Shared progress knots keep revisions correlated rather than random per frame.
const ESTIMATE_REVISIONS = [
  [0, 0, 0], [.16, 1, -1], [.32, -.8, .9], [.5, .6, -.6],
  [.7, -.35, .4], [.86, .15, -.2], [1, 0, 0]
];

function getEstimateRevision(progress) {
  const upper = ESTIMATE_REVISIONS.findIndex(([time]) => time >= progress);
  const right = ESTIMATE_REVISIONS[Math.max(0, upper)];
  const left = ESTIMATE_REVISIONS[Math.max(0, upper - 1)];
  const fraction = right[0] > left[0] ? (progress - left[0]) / (right[0] - left[0]) : 0;
  const decay = (1 - progress) ** 1.2;
  return [1, 2].map(index => (left[index] + (right[index] - left[index]) * fraction) * decay);
}

// A deterministic teaching scenario, not a reproduction of JMA's EEW analysis.
// Only bulletin estimates change; the configured source and wave clock stay fixed.
export function buildSimulationEewReports({ options, stations, sources = [], schedule, ruptureCompleteSec, intensityEstimateAvailable = options.depthKm <= MAX_REFERENCE_INTENSITY_DEPTH_KM, getObservedIntensity = () => 0 }) {
  if (!schedule.length) return [];
  const firstTime = schedule[0].elapsedSec;
  const originalEnd = schedule.at(-1).elapsedSec;
  // A giant event cannot be considered settled after the short initial analysis.
  // Follow its magnitude-duration envelope from the first P detection, then
  // allow 8 s for review. Explicit fault rupture must also have completed.
  const detectedAtSec = schedule[0].detectedAtSec ?? firstTime;
  const confirmationEnd = options.magnitude > 7
    ? detectedAtSec + getSimulationMagnitudeDurationSec(options.magnitude) + 8 : originalEnd;
  const finalTime = Math.max(originalEnd, ruptureCompleteSec + 2, confirmationEnd);
  const timeline = schedule.map(report => ({ ...report }));
  // Extend reviews after the fast initial analysis; never stretch earlier bulletins.
  if (finalTime > originalEnd) {
    const reviewTimes = buildSimulationReviewTimes(originalEnd, finalTime, Math.ceil((finalTime - originalEnd) / 2.5) + 1,
      stations.flatMap(station => [station.pArrivalSec, station.sArrivalSec]));
    timeline.push(...reviewTimes.slice(1).map(elapsedSec => ({elapsedSec, detectedAtSec})));
  }
  const initialMagnitude = Math.max(1, Math.min(6.8, options.magnitude - .35 - .12 * Math.max(0, options.magnitude - 5)));
  // Keep synthetic early estimates in the configured deep model's domain.
  // A fabricated 130 km estimate for a 172 km event disables path attenuation
  // and creates broad warnings that disappear as the reported depth converges.
  // The final bulletin still uses the exact configured depth, including 151 km.
  const minimumEstimatedDepth = options.depthKm > MAX_REFERENCE_INTENSITY_DEPTH_KM ? DEEP_PATH_BLEND_END_KM : 0;
  const maximumEstimatedDepth = minimumEstimatedDepth ? 700 : MAX_REFERENCE_INTENSITY_DEPTH_KM;
  const initialDepth = Math.max(minimumEstimatedDepth, Math.min(700, Math.round((options.depthKm + (options.depthKm < 70 ? 10 : -Math.min(80, options.depthKm * .25))) / 10) * 10));
  const magnitudeError = .8 + Math.max(0, options.magnitude - 6) * .15;
  const depthError = Math.min(80, 18 + options.depthKm * .15);
  return timeline.map((report, index) => {
    const isFinal = index === timeline.length - 1;
    const progress = originalEnd > firstTime ? Math.min(1, (report.elapsedSec - firstTime) / (originalEnd - firstTime)) : 1;
    const remaining = (1 - progress) ** 2.4;
    const [magnitudeRevision, depthRevision] = getEstimateRevision(progress);
    const magnitude = isFinal ? options.magnitude : Number(Math.max(1, Math.min(9.5,
      options.magnitude + (initialMagnitude - options.magnitude) * remaining + magnitudeRevision * magnitudeError)).toFixed(1));
    const depth = isFinal ? options.depthKm : Math.max(minimumEstimatedDepth, Math.min(maximumEstimatedDepth,
      Math.round((options.depthKm + (initialDepth - options.depthKm) * remaining + depthRevision * depthError) / 5) * 5));
    const elapsedSec = report.elapsedSec;
    const activeSourceIndices = sources.flatMap((source, index) => source.ruptureDelaySec <= elapsedSec ? [index] : []);
    const predictions = intensityEstimateAvailable ? stations.map(station => {
      const distance = activeSourceIndices.length && station.sourceDistancesKm
        ? Math.min(...activeSourceIndices.map(index => station.sourceDistancesKm[index])) : station.epicentralDistanceKm;
      const predicted = estimateSimulationIntensity({ magnitude, depthKm: depth, ruptureDistanceKm: Math.hypot(distance, depth), interplate: isInterplateSimulation(options), groundArv: station.groundArv ?? 1, trenchDistanceKm: station.trenchDistanceKm, deepApproximation: options.depthKm > MAX_REFERENCE_INTENSITY_DEPTH_KM });
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
