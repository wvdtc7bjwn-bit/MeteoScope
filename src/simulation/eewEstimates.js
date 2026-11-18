import { classifyIntensity, getSimulationMagnitudeDurationSec } from "./weSimulatorModel.js";
import { getEarthquakeIntensityRank } from "../earthquakeIntensity.js";
import { estimateSimulationIntensity, MAX_REFERENCE_INTENSITY_DEPTH_KM, DEEP_PATH_BLEND_END_KM } from "./intensityModel.js";
import {isInterplateSimulation, buildActiveFaultPreset} from "./activeFault.js";
import {simulationActiveFaultDistances} from "./sourceDistance.js";
import {createSimulationObservationStream, SIMULATION_ANALYSIS_MIN_INTERVAL_SEC} from "./reportTiming.js";
import {simulationEarthquakeType} from "./earthquakeType.js";

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
export function buildSimulationEewReports({ options, stations, sources = [], schedule, detectionStations = [], ruptureCompleteSec = 0, intensityEstimateAvailable = options.depthKm <= MAX_REFERENCE_INTENSITY_DEPTH_KM, getObservedIntensity = () => 0 }) {
  if (!schedule.length) return [];
  const firstTime = schedule[0].elapsedSec;
  const detectedAtSec = schedule[0].detectedAtSec ?? firstTime;
  const observations = createSimulationObservationStream([...stations, ...detectionStations], sources);
  // The configured source duration supplies a synthetic signal window, not a
  // bulletin count. Arrival coverage and later estimate stability decide when
  // this scene can finish. These coefficients are educational assumptions.
  const sourceDuration = getSimulationMagnitudeDurationSec(options.magnitude);
  // A bounded safeguard based on the configured scene, never future data.
  // Artificially slow ruptures may run beyond 600 s; allow their final signal
  // to propagate. Reaching this bound is not a stable final bulletin.
  const horizon = Math.max(firstTime + sourceDuration + 120, ruptureCompleteSec + 600);
  const initialMagnitude = Math.max(1, Math.min(6.8, options.magnitude - .35 - .12 * Math.max(0, options.magnitude - 5)));
  // Keep synthetic early estimates in the configured deep model's domain.
  // A fabricated 130 km estimate for a 172 km event disables path attenuation
  // and creates broad warnings that disappear as the reported depth converges.
  // Internal intensity calculations retain the exact configured depth once
  // mature. Bulletin depths are separately quantized to 10 km below.
  const minimumEstimatedDepth = options.depthKm > MAX_REFERENCE_INTENSITY_DEPTH_KM ? DEEP_PATH_BLEND_END_KM : 0;
  const maximumEstimatedDepth = minimumEstimatedDepth ? 700 : MAX_REFERENCE_INTENSITY_DEPTH_KM;
  const initialDepth = Math.max(minimumEstimatedDepth, Math.min(700, Math.round((options.depthKm + (options.depthKm < 70 ? 10 : -Math.min(80, options.depthKm * .25))) / 10) * 10));
  // Small synthetic analysis revisions, not a model of actual EEW errors.
  // The old 0.8..1.325 amplitude made a smooth source-growth trend reverse by
  // about a full magnitude, amplified further by the display-only M conversion.
  // Keep initial underestimation/source growth separate from this residual.
  const magnitudeError = .18 + Math.max(0, options.magnitude - 6) * .025;
  const depthError = Math.min(80, 18 + options.depthKm * .15);
  let predictionKey = "", basePredictions = [];
  const activeFaultPreset = options.model === "active-fault" ? buildActiveFaultPreset(options.activeFault) : null;
  // Geometry depends on depth, not on magnitude or the set already ruptured.
  // Reuse the same distances across revisions; keep temporary memory bounded.
  const distancesByDepth=new Map();
  const faultDistancesAt=depth=>{
    if(options.jshisGeometry)return stations.map(station=>station.sourceRuptureDistancesKm);
    if(!activeFaultPreset)return null;
    if(depth===options.depthKm)return stations.map(station=>station.sourceRuptureDistancesKm);
    if(!distancesByDepth.has(depth)){
      const distances=stations.map(station=>station.sourceDistancesKm
        ? simulationActiveFaultDistances(station.coordinates,options.activeFault,sources,depth,activeFaultPreset.depthKm,station.sourceDistancesKm):null);
      if(distancesByDepth.size>=4)distancesByDepth.delete(distancesByDepth.keys().next().value);
      distancesByDepth.set(depth,distances);
    }
    return distancesByDepth.get(depth);
  };
  const evaluate = (elapsedSec, progress) => {
    const remaining = (1 - progress) ** 2.4;
    const [magnitudeRevision, depthRevision] = getEstimateRevision(progress);
    const magnitude = progress >= 1 ? options.magnitude : Number(Math.max(1, Math.min(9.5,
      options.magnitude + (initialMagnitude - options.magnitude) * remaining + magnitudeRevision * magnitudeError)).toFixed(1));
    const depth = progress >= 1 ? options.depthKm : Math.max(minimumEstimatedDepth, Math.min(maximumEstimatedDepth,
      Math.round((options.depthKm + (initialDepth - options.depthKm) * remaining + depthRevision * depthError) / 5) * 5));
    const activeSourceIndices = sources.flatMap((source, index) => source.ruptureDelaySec <= elapsedSec ? [index] : []);
    const nextKey = `${magnitude}|${depth}|${activeSourceIndices.join(",")}`;
    if (nextKey !== predictionKey) {
      const faultDistancesForDepth=intensityEstimateAvailable?faultDistancesAt(depth):null;
      basePredictions = intensityEstimateAvailable ? stations.map((station,stationIndex) => {
        const distance = activeSourceIndices.length && station.sourceDistancesKm
          ? Math.min(...activeSourceIndices.map(index => station.sourceDistancesKm[index])) : station.epicentralDistanceKm;
        const faultDistances = faultDistancesForDepth?.[stationIndex] ?? null;
        const ruptureDistanceKm = faultDistances && activeSourceIndices.length
          ? Math.min(...activeSourceIndices.map(index => faultDistances[index])) : Math.hypot(distance, depth);
        const calculated = estimateSimulationIntensity({ magnitude, depthKm: depth, ruptureDistanceKm,
          pointSource: options.model === "point", simulationCalibration: true,
          interplate: isInterplateSimulation(options),earthquakeType:simulationEarthquakeType(options), groundArv: station.groundArv ?? 1, trenchDistanceKm: station.trenchDistanceKm, deepApproximation: options.depthKm > MAX_REFERENCE_INTENSITY_DEPTH_KM });
        if (station.scenarioIntensityValue == null) return calculated;
        if (progress >= 1 || calculated === null || station.calculatedIntensityValue == null) return station.scenarioIntensityValue;
        return Math.max(0, Math.min(7, station.scenarioIntensityValue + calculated - station.calculatedIntensityValue));
      }) : [];
      predictionKey = nextKey;
    }
    // Reuse the source estimate while still checking newly observed shaking.
    const predictions = basePredictions.map((predicted, index) => {
      const station = stations[index];
      return predicted === null ? null : Math.max(getObservedIntensity(station, elapsedSec) ?? 0, predicted);
    });
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
    // JMA EEW bulletin depths use 10 km units; very shallow sources are
    // announced as 10 km. Do not round the physical source or deep-model input.
    const bulletinDepth = Math.max(10, Math.round(depth / 10) * 10);
    return { magnitude, depth: bulletinDepth, maxIntensity, isWarn, warnAreas: [...areas.values()] };
  };
  const signature = value => `${value.magnitude}|${value.depth}|${value.maxIntensity}|${value.warnAreas.map(area => `${area.code}:${area.from}:${area.to}`).sort().join(",")}`;
  const reports = [];
  let elapsed = firstTime, previousEvidence = "", previousEstimate = "", stableSince = firstTime, readySince = null;
  let publishedSignature = "", publishedCounts = {pCount:0,sCount:0,sourceSeen:0};
  while (elapsed <= horizon) {
    const counts = observations.advance(elapsed);
    const evidenceKey = `${counts.pCount}|${counts.sCount}|${counts.sourceSeen}`;
    const qualitySpan = 8 + 18 / Math.sqrt(1 + counts.pCount) + (counts.sCount ? 0 : 8);
    const progress = Math.min(1, Math.max(0, (elapsed - firstTime) / (sourceDuration + qualitySpan)),
      .25 + .75 * counts.sourceSeen / observations.sourceCount);
    const estimate = evaluate(elapsed, progress);
    const estimateKey = signature(estimate);
    if (evidenceKey !== previousEvidence || estimateKey !== previousEstimate) stableSince = elapsed;
    previousEvidence = evidenceKey; previousEstimate = estimateKey;
    const stableForSec = elapsed - stableSince;
    const confirmationSec = 15 + (counts.pCount < 3 ? 10 : 0) + (counts.sCount ? 0 : 5);
    const ready = progress >= 1 && counts.sourceSeen === observations.sourceCount
      && elapsed >= ruptureCompleteSec + 2 && elapsed >= detectedAtSec + sourceDuration;
    if (ready) readySince ??= elapsed; else readySince = null;
    const confirmationForSec = ready ? elapsed - Math.max(stableSince, readySince) : 0;
    const isFinal = ready && confirmationForSec >= confirmationSec - .001;
    const dataGrowth = counts.pCount - publishedCounts.pCount >= Math.max(1,Math.ceil(publishedCounts.pCount * .2))
      || counts.sCount - publishedCounts.sCount >= Math.max(1,Math.ceil(publishedCounts.sCount * .2))
      || counts.sourceSeen > publishedCounts.sourceSeen;
    const heartbeatSec = Math.min(20, 6 + stableForSec * .3);
    const periodic = reports.length && elapsed - reports.at(-1).elapsedSec >= heartbeatSec;
    if (!reports.length || estimateKey !== publishedSignature || dataGrowth || periodic || isFinal || elapsed === horizon) {
      reports.push({reportNumber:reports.length+1,elapsedSec:elapsed,detectedAtSec,...estimate,isFinal,
        observationCount:counts.pCount,sObservationCount:counts.sCount,observedSourceCount:counts.sourceSeen,
        analysisProgress:Number(progress.toFixed(3)),analysisMature:ready,stableForSec:Number(stableForSec.toFixed(2)),confirmationForSec:Number(confirmationForSec.toFixed(2)),
        finalReason:isFinal ? "stable" : elapsed === horizon ? "insufficient-observations" : null});
      publishedSignature = estimateKey; publishedCounts = counts;
    }
    if (isFinal || elapsed === horizon) break;
    const interval = progress < 1 ? .7 + 1.8 * progress ** 2 : Math.min(10, 2 + stableForSec * .35);
    const stableDeadline = ready ? Math.max(stableSince, readySince) + confirmationSec : Infinity;
    const next = Math.min(elapsed + interval, observations.nextTime(), stableDeadline);
    elapsed = Math.min(horizon, Number(Math.max(elapsed + SIMULATION_ANALYSIS_MIN_INTERVAL_SEC, next).toFixed(2)));
  }
  return reports;
}
