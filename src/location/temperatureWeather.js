import { environmentDifference } from "./environmentProfile.js";
import { temperatureObservationTime } from "./temperatureObservation.js";

const finite = value => typeof value === "number" && Number.isFinite(value);
const clamp = (value, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const MINUTE = 60000;

// Compact, public station observations only. No location fixes or target observations.
export function temperatureSnapshot(points, timeMs) {
  const values = new Map();
  if (!finite(timeMs)) return null;
  for (const point of points) {
    if (point.temperatureQuality !== 0 || !finite(point.values?.temperature)) continue;
    if (point.observationTime != null && Date.parse(temperatureObservationTime(point.observationTime)) !== timeMs) continue;
    values.set(String(point.id), { temperature: point.values.temperature, speed: point.values.wind, direction: point.windDirection });
  }
  return { timeMs, values };
}

export function createTemperatureHistory() {
  let frames = [], lastPoints;
  return {
    add(points, timeMs) {
      if (!finite(timeMs) || timeMs < (frames.at(-1)?.timeMs ?? -Infinity) || lastPoints === points) return;
      lastPoints = points;
      const snapshot = temperatureSnapshot(points, timeMs);
      frames = [...frames.filter(frame => frame.timeMs !== timeMs && timeMs - frame.timeMs <= 90 * MINUTE), snapshot].slice(-10);
    },
    before(timeMs) { return frames.filter(frame => frame.timeMs < timeMs); },
    clear() { frames = []; lastPoints = null; }
  };
}

export function selectTemperatureHistory(history, timeMs) {
  return (history ?? []).filter(frame => frame?.values instanceof Map && finite(frame.timeMs)
    && timeMs - frame.timeMs >= 20 * MINUTE && timeMs - frame.timeMs <= 60 * MINUTE)
    .sort((a, b) => Math.abs(timeMs - a.timeMs - 30 * MINUTE) - Math.abs(timeMs - b.timeMs - 30 * MINUTE))[0] ?? null;
}

function wind(observation) {
  if (!finite(observation?.speed) || observation.speed < 0 || !Number.isInteger(observation.direction)
    || observation.direction < 1 || observation.direction > 16) return null;
  const angle = observation.direction * Math.PI / 8; // JMA directions are where the wind comes FROM.
  return { speed: observation.speed, x: Math.sin(angle), y: Math.cos(angle) };
}

function regionalWind(entries, observation) {
  let n = 0, coverage = 0, speed = 0, x = 0, y = 0;
  const total = entries.reduce((sum, entry) => sum + entry.weight, 0);
  for (const entry of entries) {
    const vector = wind(observation(entry.point));
    if (!vector) continue;
    n++; coverage += entry.weight; speed += entry.weight * vector.speed;
    x += entry.weight * vector.speed * vector.x; y += entry.weight * vector.speed * vector.y;
  }
  const magnitude = Math.hypot(x, y);
  return { n, coverage: total ? coverage / total : 0, speed: coverage ? speed / coverage : 0,
    coherence: speed > 0 ? clamp(magnitude / speed) : 0,
    x: magnitude ? x / magnitude : 0, y: magnitude ? y / magnitude : 0 };
}

export function temperatureWeatherContext({ entries, elevation, environment, timeMs, history }) {
  const previous = selectTemperatureHistory(history, timeMs);
  const regional = regionalWind(entries, point => ({ speed: point.values?.wind, direction: point.windDirection }));
  const previousWind = previous ? regionalWind(entries, point => previous.values.get(String(point.id))) : null;
  const windUsable = regional.n >= 3 && regional.coverage >= .7;
  const stable = windUsable && regional.speed >= 2 && regional.coherence >= .7 && previousWind?.n >= 3
    && previousWind.coverage >= .7 && previousWind.speed >= 2 && previousWind.coherence >= .7
    ? clamp(regional.x * previousWind.x + regional.y * previousWind.y) * regional.coherence : 0;
  return { previousTime: previous?.timeMs ?? null, regional,
    features: entries.map(entry => {
      const point = entry.point, vector = wind({ speed: point.values?.wind, direction: point.windDirection });
      const difference = environmentDifference(environment, point.environment, elevation, point.elevation);
      const terrainContrast = difference ? clamp(difference.land + difference.terrain) : 0;
      const directionContrast = vector && vector.speed >= .3 ? clamp((1 - vector.x * regional.x - vector.y * regional.y) / 2) : 0;
      return { windContrast: stable * directionContrast * (difference ? .5 + .5 * terrainContrast : 0) };
    }) };
}

// Bounded weight changes. Do not impose an inversion or add warming/cooling in degrees.
export function applyTemperatureWeather(entries, context, policy) {
  const strength = finite(policy.weatherWindStrength) ? clamp(policy.weatherWindStrength, 0, .5) : 0;
  return entries.map((entry, i) => ({ ...entry,
    weight: entry.weight * (1 - strength * context.features[i].windContrast) }));
}
