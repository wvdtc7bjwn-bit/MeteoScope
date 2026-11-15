// Reference-ground calculation, not an official surface-intensity forecast.
// Si & Midorikawa (1999), PGV600 -> PGV400 x1.31; Midorikawa et al. (1999).
// https://www.j-map.bosai.go.jp/j-map/result/tn_246/html/html/2-4-1.html
// Mw8.3 saturation is the basic-model assumption documented for giant events:
// https://www.j-shis.bosai.go.jp/j-map/result/tn_257/html/html/2-4-1.html
export function estimateReferenceIntensity({ magnitude, depthKm, ruptureDistanceKm, interplate = false, groundArv = 1 }) {
  if (![magnitude, depthKm, ruptureDistanceKm].every(Number.isFinite) || depthKm < 0 || ruptureDistanceKm < 0) throw new RangeError("Invalid reference intensity parameters");
  if (!Number.isFinite(groundArv) || groundArv <= 0) throw new RangeError("Invalid ground amplification");
  const mw = Math.min(magnitude, 8.3);
  const distance = Math.max(ruptureDistanceKm, 1);
  const logVelocity600 = .58 * mw + .0038 * depthKm + (interplate ? -.02 : 0) - 1.29
    - Math.log10(distance + .0028 * 10 ** (.5 * mw)) - .002 * distance;
  const logSurfaceVelocity = logVelocity600 + Math.log10(1.31) + Math.log10(groundArv);
  return Math.max(0, Math.min(7, 2.68 + 1.72 * logSurfaceVelocity));
}
