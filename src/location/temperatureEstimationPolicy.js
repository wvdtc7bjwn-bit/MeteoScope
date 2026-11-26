// Conservative operating limits, not validated error bounds. Tune with held-out data.
export const TEMPERATURE_ESTIMATION = Object.freeze({
  radiusKm: 50, maxStations: 8, minStations: 3, power: 2, lapseRate: .0065,
  coincidentKm: .1, minDistanceKm: .2, maxAgeMs: 30 * 60 * 1000,
  futureToleranceMs: 2 * 60 * 1000, maxNearestKm: 100,
  maxStationHeightDifference: 1200, maxHeightExtrapolation: 300,
  maxMedianHeightDifference: 600, maxSpreadC: 4,
  warningSpreadC: 2, warningHeightDifference: 300, distantKm: 15,
  highConfidenceNearestKm: 5, highConfidenceStations: 5,
  warningBearingGap: 240, rejectBearingGap: 300,
  dynamicEnabled: false, // No release adoption before independent multi-period validation.
  environmentStrength: 2, // Earlier-time selection + held-out comparison: docs/data/temperature-environment-validation.json.
  environmentLandWeight: 1, environmentTerrainWeight: .5, environmentMinWeight: .2,
  heightSimilarityScaleM: 200, // Separated LOO + unseen next-frame check; scale is empirical, not an error bound.
  directionalReachRatio: 0, // Tested alternative remains disabled.
  regressionMinStations: 6, regressionHeightRange: 150, regressionMinR2: .35,
  maxAbsLapseRate: .015, maxLapseStd: .003, dynamicMinImprovementC: .15,
  dynamicMinImprovementRatio: .1, elevationMoveKm: .1, failureTtlMs: 15 * 60 * 1000
});

const KEY = "meteoscope.localTemperature.v1";
export function loadTemperatureEstimationEnabled(storage) {
  try { return (storage ?? globalThis.localStorage)?.getItem(KEY) === "true"; } catch { return false; }
}
export function saveTemperatureEstimationEnabled(value, storage) {
  const enabled = value === true;
  try { (storage ?? globalThis.localStorage)?.setItem(KEY, String(enabled)); } catch { /* Private browsing may deny storage. */ }
  return enabled;
}
