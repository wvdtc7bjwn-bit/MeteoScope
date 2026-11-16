// Utsu (1977) finite-source sphere used in JMA's reference method.
// https://www.jma.go.jp/jma/kishou/know/jishin/eew/katsuyou/reference.pdf
// This teaching approximation does not infer a real fault's strike or dip.
export function pointSourceFaultDistance(magnitude, depthKm, hypocentralDistanceKm) {
  if (![magnitude, depthKm, hypocentralDistanceKm].every(Number.isFinite)
      || depthKm < 0 || hypocentralDistanceKm < 0) throw new RangeError("Invalid source distance");
  // Keep the existing deep approximation unchanged and continuous at 150 km.
  const weight = Math.max(0, Math.min(1, (150 - depthKm) / 50));
  // The reference PGV model saturates at Mw8.3. Apply the same conservative
  // bound to an unknown source's radius, rather than painting a huge sphere
  // as equally near-fault. Known source geometries do not use this sphere.
  const radius = 10 ** (.5 * Math.min(magnitude, 8.3) - 1.85) / 2;
  return weight === 0 ? hypocentralDistanceKm : Math.max(3, hypocentralDistanceKm - weight * radius);
}

// Surface point -> rectangular plane in local east/north/down coordinates.
// The origin is the upper corner, strike clockwise from north, dip to its right.
export function rectangularFaultDistance(point, fault, depthShiftKm = 0, alongRange = [0, fault.LEN]) {
  const rad = Math.PI / 180;
  const east = (point[0] - fault.LON) * rad * 6371 * Math.cos((point[1] + fault.LAT) / 2 * rad);
  const north = (point[1] - fault.LAT) * rad * 6371;
  const down = -Math.max(0, fault.DEP + depthShiftKm);
  const strike = fault.STR * rad, dip = fault.DIP * rad;
  const along = Math.max(alongRange[0], Math.min(alongRange[1], east * Math.sin(strike) + north * Math.cos(strike)));
  const across = Math.max(0, Math.min(fault.WID,
    east * Math.cos(strike) * Math.cos(dip) - north * Math.sin(strike) * Math.cos(dip) + down * Math.sin(dip)));
  return Math.hypot(east - along * Math.sin(strike) - across * Math.cos(strike) * Math.cos(dip),
    north - along * Math.cos(strike) + across * Math.sin(strike) * Math.cos(dip), down - across * Math.sin(dip));
}

export function activeFaultSourceDistances(point, fault, sources, depthShiftKm = 0) {
  const positions = sources.map(source => source.faultAlongKm);
  return positions.map((along, i) => rectangularFaultDistance(point, fault, depthShiftKm,
    [i ? (positions[i - 1] + along) / 2 : 0,
      i + 1 < positions.length ? (along + positions[i + 1]) / 2 : fault.LEN]));
}

// Fade the shallow rectangular-source correction before the deep model starts.
// Propagation still uses the unchanged source-line distances.
export function simulationActiveFaultDistances(point, fault, sources, depthKm, referenceDepthKm, surfaceDistances) {
  const weight = Math.max(0, Math.min(1, (150 - depthKm) / 50));
  if (!weight) return null;
  return activeFaultSourceDistances(point, fault, sources, depthKm - referenceDepthKm).map((distance, index) =>
    weight * distance + (1 - weight) * Math.hypot(surfaceDistances[index], depthKm));
}
