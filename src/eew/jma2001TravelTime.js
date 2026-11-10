import { JMA2001_TRAVEL_TIME_TABLE } from "./jma2001TravelTimeData.js";

const JMA2001_DEPTHS = Object.keys(JMA2001_TRAVEL_TIME_TABLE)
  .map(Number)
  .sort((a, b) => a - b);

export function getWaveDistancesByJma2001(depthKm, elapsedSeconds) {
  return {
    pDistanceKm: getDistanceFromTravelTime("P", depthKm, elapsedSeconds),
    sDistanceKm: getDistanceFromTravelTime("S", depthKm, elapsedSeconds)
  };
}

function getDistanceFromTravelTime(waveType, depthKm, elapsedSeconds) {
  const elapsed = Number(elapsedSeconds);
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0;

  const table = getNearestDepthTable(depthKm);
  const timeIndex = waveType === "S" ? 2 : 1;
  return lookupDistanceByTime(table, timeIndex, elapsed);
}

function getNearestDepthTable(depthKm) {
  const depth = normalizeDepth(depthKm);
  let nearestDepth = JMA2001_DEPTHS[0];

  for (const candidate of JMA2001_DEPTHS) {
    if (Math.abs(candidate - depth) < Math.abs(nearestDepth - depth)) {
      nearestDepth = candidate;
    }
  }

  return JMA2001_TRAVEL_TIME_TABLE[nearestDepth];
}

function normalizeDepth(depthKm) {
  if (depthKm === null || depthKm === undefined || String(depthKm).trim() === "") return 10;
  const depth = Number(depthKm);
  if (!Number.isFinite(depth)) return 10;
  return Math.max(0, Math.min(700, depth));
}

function lookupDistanceByTime(table, timeIndex, elapsedSeconds) {
  if (!Array.isArray(table) || table.length === 0) return 0;
  if (elapsedSeconds <= table[0][timeIndex]) return table[0][0];

  const last = table[table.length - 1];
  if (elapsedSeconds >= last[timeIndex]) return last[0];

  let low = 0;
  let high = table.length - 1;
  while (low < high - 1) {
    const middle = Math.floor((low + high) / 2);
    if (table[middle][timeIndex] <= elapsedSeconds) low = middle;
    else high = middle;
  }

  const lower = table[low];
  const upper = table[high];
  const lowerTime = lower[timeIndex];
  const upperTime = upper[timeIndex];
  if (upperTime <= lowerTime) return lower[0];

  const ratio = (elapsedSeconds - lowerTime) / (upperTime - lowerTime);
  return lower[0] + ratio * (upper[0] - lower[0]);
}
