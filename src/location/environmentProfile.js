const finite = value => typeof value === "number" && Number.isFinite(value);
const clamp = value => Math.min(1, Math.max(0, value));

// Similarity changes station influence, never adds an assumed urban warming in degrees.
export function environmentDifference(target, station, targetElevation, stationElevation) {
  if (!target || !station) return null;
  const cover = ["urban", "forest", "farm", "water", "sea"];
  let land = null;
  if (cover.every(key => finite(target[key]) && finite(station[key]))) {
    const left = cover.map(key => clamp(target[key])), right = cover.map(key => clamp(station[key]));
    left.push(Math.max(0, 1-left.reduce((a,b)=>a+b,0))); right.push(Math.max(0, 1-right.reduce((a,b)=>a+b,0)));
    land = Math.min(1, left.reduce((sum,value,i)=>sum+Math.abs(value-right[i]),0)/2);
  }
  const terrain = [];
  if (finite(target.relief) && finite(station.relief)) terrain.push(clamp(Math.abs(target.relief-station.relief)/500));
  if (finite(target.slope) && finite(station.slope)) terrain.push(clamp(Math.abs(target.slope-station.slope)/30));
  if ([targetElevation,stationElevation,target.meanElevation,station.meanElevation].every(finite)) {
    terrain.push(clamp(Math.abs((targetElevation-target.meanElevation)-(stationElevation-station.meanElevation))/300));
  }
  if (land == null || !terrain.length) return null; // Partial/missing data retains the baseline method.
  return { land, terrain: terrain.reduce((a,b)=>a+b,0)/terrain.length };
}
export function environmentSimilarity(target, station, targetElevation, stationElevation, policy) {
  const difference = environmentDifference(target, station, targetElevation, stationElevation);
  if (!difference) return 1;
  return Math.max(policy.environmentMinWeight, Math.exp(-policy.environmentStrength * (policy.environmentLandWeight * difference.land + policy.environmentTerrainWeight * difference.terrain)));
}
