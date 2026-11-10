import {
  getEarthquakeIntensityColor,
  getEarthquakeIntensityRank
} from "../earthquakeIntensity.js";

function normalizeEewAreaName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/gu, "")
    .trim();
}

function selectForecastIntensity(area = {}) {
  return [area.from, area.to]
    .map((value) => String(value ?? "").trim())
    .filter(Boolean)
    .sort((a, b) => getEarthquakeIntensityRank(b) - getEarthquakeIntensityRank(a))[0] ?? "";
}

function formatForecastRange(area = {}) {
  const from = String(area.from ?? "").trim();
  const to = String(area.to ?? "").trim();
  if (from && to && from !== to) return `${from}～${to}`;
  return to || from;
}

export function buildEewForecastAreaFeatureCollection(areaGeoJson, events = []) {
  const forecastByName = new Map();
  const forecastByCode = new Map();

  for (const event of Array.isArray(events) ? events : [events]) {
    if (!event || event.isCancel) continue;
    for (const area of event.warnAreas ?? []) {
      const nameKey = normalizeEewAreaName(area?.name);
      const intensity = selectForecastIntensity(area);
      if (!nameKey || !intensity) continue;
      const rank = getEarthquakeIntensityRank(intensity);
      const current = forecastByName.get(nameKey);
      if (current && current.rank > rank) continue;
      const forecast = {
        areaName: String(area.name).trim(),
        intensity,
        intensityRange: formatForecastRange(area),
        rank,
        eventId: String(event.eventId ?? "")
      };
      forecastByName.set(nameKey, forecast);
      const areaCode = String(area?.code ?? "").trim();
      if (areaCode) {
        const currentByCode = forecastByCode.get(areaCode);
        if (!currentByCode || currentByCode.rank <= rank) forecastByCode.set(areaCode, forecast);
      }
    }
  }

  const features = (areaGeoJson?.features ?? []).flatMap((feature) => {
    const featureCode = String(feature?.properties?.code ?? feature?.properties?.__areaCode ?? "").trim();
    const forecast = forecastByCode.get(featureCode)
      ?? forecastByName.get(normalizeEewAreaName(feature?.properties?.name));
    if (!forecast || !feature?.geometry) return [];
    return [{
      type: "Feature",
      geometry: feature.geometry,
      properties: {
        ...(feature.properties ?? {}),
        ...forecast,
        color: getEarthquakeIntensityColor(forecast.intensity),
        fillOpacity: 0.46,
        lineWidth: 1.5
      }
    }];
  });

  return { type: "FeatureCollection", features };
}

export function createEewForecastAreaSignature(events = []) {
  return (Array.isArray(events) ? events : [events])
    .filter((event) => event && !event.isCancel)
    .flatMap((event) => (event.warnAreas ?? []).map((area) => [
      event.eventId,
      event.serial,
      area?.code ?? "",
      normalizeEewAreaName(area?.name),
      area?.from ?? "",
      area?.to ?? ""
    ].join(":")))
    .sort()
    .join("|");
}
