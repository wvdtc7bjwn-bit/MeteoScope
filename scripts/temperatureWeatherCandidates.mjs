// Rejected research candidates stay out of the application bundle.
import { temperatureWeatherContext, selectTemperatureHistory, applyTemperatureWeather } from "../src/location/temperatureWeather.js";
const finite = value => typeof value === "number" && Number.isFinite(value);
const clamp = value => Math.min(1, Math.max(0, value));

export function solarAltitude(coordinates, timeMs) {
  const date = new Date(timeMs), rad = Math.PI / 180;
  const angle = 2 * Math.PI / 365 * (timeMs - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86400000;
  const declination = .006918 - .399912 * Math.cos(angle) + .070257 * Math.sin(angle)
    - .006758 * Math.cos(2 * angle) + .000907 * Math.sin(2 * angle) - .002697 * Math.cos(3 * angle) + .00148 * Math.sin(3 * angle);
  const equation = 229.18 * (.000075 + .001868 * Math.cos(angle) - .032077 * Math.sin(angle)
    - .014615 * Math.cos(2 * angle) - .040849 * Math.sin(2 * angle));
  const hourAngle = ((date.getUTCHours() * 60 + date.getUTCMinutes() + 4 * coordinates[0] + equation) / 4 - 180) * rad;
  const latitude = coordinates[1] * rad;
  return Math.asin(Math.max(-1, Math.min(1, Math.sin(latitude) * Math.sin(declination) + Math.cos(latitude) * Math.cos(declination) * Math.cos(hourAngle)))) / rad;
}

export function candidateWeatherContext(input) {
  const { entries, timeMs, history, coordinates, elevation, environment } = input;
  const context = temperatureWeatherContext(input), previous = selectTemperatureHistory(history, timeMs);
  const deltas = previous ? entries.flatMap(entry => {
    const old = previous.values.get(String(entry.point.id));
    return finite(old?.temperature) ? [{ id: String(entry.point.id), weight: entry.weight,
      delta: (entry.point.value - old.temperature) * 30 * 60000 / (timeMs - previous.timeMs) }] : [];
  }) : [];
  const sumWeight = entries.reduce((sum, entry) => sum + entry.weight, 0), deltaWeight = deltas.reduce((sum, entry) => sum + entry.weight, 0);
  const trendUsable = deltas.length >= 3 && deltaWeight >= sumWeight * .7;
  let medianDelta = null, accumulated = 0;
  for (const entry of [...deltas].sort((a,b) => a.delta - b.delta)) {
    accumulated += entry.weight;
    if (accumulated >= deltaWeight / 2) { medianDelta = entry.delta; break; }
  }
  const cooling = trendUsable && finite(medianDelta) ? clamp(-medianDelta / .5) : 0;
  const regional = context.regional, windUsable = regional.n >= 3 && regional.coverage >= .7;
  const nightTerrain = windUsable && solarAltitude(coordinates, timeMs) < -6 && finite(environment?.relief)
    ? clamp(1 - regional.speed / 2) * clamp(environment.relief / 200) * cooling : 0;
  const trendById = new Map(deltas.map(entry => [entry.id, entry.delta]));
  return { ...context, nightTerrain, features: context.features.map((feature, i) => {
    const point = entries[i].point, delta = trendById.get(String(point.id));
    return { ...feature, nightHeightContrast: finite(elevation) && finite(point.elevation) ? nightTerrain * ((point.elevation - elevation) / 100) ** 2 : 0,
      trendContrast: trendUsable && finite(delta) ? ((delta - medianDelta) / .5) ** 2 : 0 };
  }) };
}

export function applyWeatherCandidate(entries, context, elevation, lapse, policy) {
  const windAdjusted = applyTemperatureWeather(entries, context, policy);
  return windAdjusted.map((entry, i) => {
    const feature = context.features[i];
    const night = Math.max(.25, 1 / (1 + policy.weatherNightBlend * feature.nightHeightContrast));
    const trend = Math.max(.5, 1 / (1 + policy.weatherTrendStrength * feature.trendContrast));
    return { ...entry, weight: entry.weight * night * trend };
  });
}
