// Reference-ground calculation, not an official surface-intensity forecast.
// Si & Midorikawa (1999), PGV600 -> PGV400 x1.31; Midorikawa et al. (1999).
// https://www.j-map.bosai.go.jp/j-map/result/tn_246/html/html/2-4-1.html
// Mw8.3 saturation is the basic-model assumption documented for giant events:
// https://www.j-shis.bosai.go.jp/j-map/result/tn_257/html/html/2-4-1.html
// JMA does not apply this hypocenter-based intensity method beyond 150 km.
// https://www.data.jma.go.jp/eew/data/nc/katsuyou/reference.pdf
export const MAX_REFERENCE_INTENSITY_DEPTH_KM = 150;
export const DEEP_PATH_BLEND_END_KM = MAX_REFERENCE_INTENSITY_DEPTH_KM + 5;

export function estimateReferenceIntensity({ magnitude, depthKm, ruptureDistanceKm, interplate = false, groundArv = 1 }) {
  if (![magnitude, depthKm, ruptureDistanceKm].every(Number.isFinite) || depthKm < 0 || ruptureDistanceKm < 0) throw new RangeError("Invalid reference intensity parameters");
  if (!Number.isFinite(groundArv) || groundArv <= 0) throw new RangeError("Invalid ground amplification");
  if (depthKm > MAX_REFERENCE_INTENSITY_DEPTH_KM) return null;
  const mw = Math.min(magnitude, 8.3);
  const distance = Math.max(ruptureDistanceKm, 1);
  return velocityToIntensity(logVelocity600(mw, depthKm, distance, interplate ? -.02 : 0), groundArv);
}

// Explicit educational extrapolation, not a validated deep-earthquake forecast.
// Keep the actual hypocentral distance, bound the depth amplification at the
// standard method's limit, and use the published V1/V2 terms with the same bound.
// https://www.j-map.bosai.go.jp/j-map/result/tn_246/html/html/2-4-1.html
export function estimateSimulationIntensity(parameters) {
  const standard = estimateReferenceIntensity(parameters);
  if (standard !== null && !parameters.deepApproximation) return standard;
  const { magnitude, depthKm, ruptureDistanceKm, trenchDistanceKm, groundArv = 1, interplate = false } = parameters;
  if (!Number.isFinite(trenchDistanceKm) || trenchDistanceKm < 0) return null;
  const distance = Math.max(ruptureDistanceKm, 1);
  const boundedDepth = Math.min(depthKm, MAX_REFERENCE_INTENSITY_DEPTH_KM);
  // A user changing depth through 150 km should not trigger an intensity jump.
  const transition = Math.max(0, Math.min(1, (depthKm - MAX_REFERENCE_INTENSITY_DEPTH_KM) / 50));
  const logV1 = (-4.021e-5 * trenchDistanceKm + 9.905e-3) * (boundedDepth - 30);
  const logV2 = Math.max(0, 2.064 * Math.log10(distance / 300) - .012);
  const baseType = interplate ? -.02 : 0;
  const type = baseType + (.12 - baseType) * transition;
  // Bounded educational residual adjustment, evaluated against JMA observed
  // station classes with CMT Mw (see the checked-in validation fixture/report).
  // It reduces widespread overestimation in moderate deep events; it is not a
  // published GMPE term or a guarantee for individual sites such as Ninomiya.
  // The moderate-event bias must not be extended unchanged to weak Mw5 events.
  const adjustmentWeight = Math.max(0, Math.min(1, (magnitude - 5) / .5));
  const magnitudeAdjustment = adjustmentWeight * Math.max(-.65, Math.min(.25, .35 * (Math.min(magnitude, 8.3) - 7.5)));
  // The old 50 km blend left back-arc attenuation almost absent at 156-175 km
  // and painted much of Kinki as felt. Apply the negative path term over a
  // shorter continuous blend, checked against the 2007/2014 regional records.
  // Positive amplification keeps the slower blend; no region is forced to zero.
  const negativeTransition = Math.max(0, Math.min(1, (depthKm - MAX_REFERENCE_INTENSITY_DEPTH_KM) / (DEEP_PATH_BLEND_END_KM - MAX_REFERENCE_INTENSITY_DEPTH_KM)));
  const pathTerm = (logV1 < 0 ? negativeTransition : transition) * logV1;
  return velocityToIntensity(logVelocity600(Math.min(magnitude, 8.3), boundedDepth, distance, type) + pathTerm + transition * (logV2 + magnitudeAdjustment), groundArv);
}

function logVelocity600(mw, depth, distance, type) {
  return .58 * mw + .0038 * depth + type - 1.29
    - Math.log10(distance + .0028 * 10 ** (.5 * mw)) - .002 * distance;
}

function velocityToIntensity(logVelocity, groundArv) {
  return Math.max(0, Math.min(7, 2.68 + 1.72 * (logVelocity + Math.log10(1.31) + Math.log10(groundArv))));
}
