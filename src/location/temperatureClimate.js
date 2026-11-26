import { getDistanceKm } from "./distance.js";
import { solveLinearSystem } from "../utils/linearSystem.js";
import { temperatureObservationTime } from "./temperatureObservation.js";

export const TEMPERATURE_CLIMATE = Object.freeze({ radiusKm: 150, maxStations: 32, minStations: 8,
  minimumDistanceKm: 10, ridge: .01, strength: .5, maxCorrectionC: 2, coastalSeaFraction: .1 });
const finite = value => typeof value === "number" && Number.isFinite(value);

export function shouldUseTemperatureClimate(result, environment) {
  return result?.kind === "estimated" && result.method === "fixed-idw" && !result.weatherAdjusted && !result.climateAdjusted
    && finite(environment?.sea) && finite(environment?.urban)
    && (result.flags.includes("outside-station-hull") || (finite(environment?.sea) && environment.sea >= TEMPERATURE_CLIMATE.coastalSeaFraction));
}

// The background uses historical daily high/low normals, not an hourly normal or a forecast.
// Validation callers must remove the held station from climate.points as well as live inputs.
export function applyTemperatureClimate(result, { coordinates, elevation, environment, climate, lapseRate = .0065 } = {}) {
  if (!shouldUseTemperatureClimate(result, environment) || !finite(elevation) || !finite(environment?.sea) || !finite(environment?.urban)
    || !coordinates?.every(finite) || coordinates.length !== 2 || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 90
    || !finite(lapseRate) || !Array.isArray(climate?.points)) return result;
  if (climate.date && result.observationTime) {
    const time = Date.parse(temperatureObservationTime(result.observationTime));
    if (!Number.isFinite(time) || new Date(time+9*3600000).toISOString().slice(0,10).replaceAll("-","") !== climate.date) return result;
  }
  const p = TEMPERATURE_CLIMATE;
  const unique = new Map();
  for (const s of climate.points) if (!unique.has(String(s.id)) && finite(s.normal) && finite(s.elevation)) unique.set(String(s.id),s);
  const normals = new Map([...unique.values()].map(s => [String(s.id), s.normal + lapseRate * s.elevation]));
  if (!result.stations.length || result.stations.some(s => !normals.has(String(s.id)))) return result;
  if (result.stations.some(s => !finite(s.weight) || s.weight < 0) || Math.abs(result.stations.reduce((sum,s)=>sum+s.weight,0)-1)>1e-6) return result;
  const train = [...unique.values()].flatMap(s => {
    if (!finite(s.sea) || !finite(s.urban)
      || !Array.isArray(s.coordinates) || s.coordinates.length !== 2 || !s.coordinates.every(finite)) return [];
    const distance = getDistanceKm(coordinates, s.coordinates);
    return distance <= p.radiusKm ? [{ ...s, distance }] : [];
  }).sort((a,b) => a.distance - b.distance).slice(0,p.maxStations);
  if (train.length < p.minStations) return result;
  const rows = train.map(s => [1,
    (s.coordinates[0]-coordinates[0])*111.195*Math.cos(coordinates[1]*Math.PI/180)/100,
    (s.coordinates[1]-coordinates[1])*111.195/100,
    (s.elevation-elevation)/500, s.sea-environment.sea, s.urban-environment.urban]);
  const rawWeights = train.map(s => 1/Math.max(p.minimumDistanceKm,s.distance)**2), sum = rawWeights.reduce((a,b)=>a+b,0);
  const weights = rawWeights.map(w => w/sum), n = rows[0].length;
  const matrix = Array.from({length:n},(_,a)=>Array.from({length:n},(_,b)=>
    rows.reduce((total,row,i)=>total+weights[i]*row[a]*row[b],0)+(a===b&&a>0?p.ridge:0)));
  const vector = Array.from({length:n},(_,a)=>rows.reduce((total,row,i)=>total+weights[i]*row[a]*normals.get(String(train[i].id)),0));
  const beta = solveLinearSystem(matrix,vector);
  if (!beta) return result;
  const reference = result.stations.reduce((total,s)=>total+s.weight*normals.get(String(s.id)),0);
  const rawCorrection = p.strength*(beta[0]-reference), correctionC = Math.max(-p.maxCorrectionC,Math.min(p.maxCorrectionC,rawCorrection));
  if (!finite(correctionC) || !finite(result.value+correctionC)) return result;
  const limited = Math.abs(rawCorrection)>p.maxCorrectionC;
  return { ...result, value: result.value+correctionC, climateAdjusted:true,
    confidence:limited?"low":result.confidence==="high"?"medium":result.confidence,
    flags:limited?[...result.flags,"climate-correction-limited"]:result.flags,
    diagnostics:{...result.diagnostics,climate:{correctionC,limited,
      stationCount:train.length,period:climate.period,background:"daily-high-low-midpoint"}} };
}
