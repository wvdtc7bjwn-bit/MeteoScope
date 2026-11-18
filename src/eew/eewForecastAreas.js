import {
  getEarthquakeIntensityColor,
  getEarthquakeIntensityRank
} from "../earthquakeIntensity.js";

export const EEW_WARNING_AREA_COLOR = "#ef3340";

export function isEewWarningArea(event, area) {
  if (area?.isWarning === false || area?.type === "予報") return false;
  if (area?.isWarning === true || area?.type === "警報") return true;
  return Boolean(event?.isWarn) && getEarthquakeIntensityRank(selectForecastIntensity(area)) >= 4;
}

export function normalizeEewAreaName(value) {
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
      const areaCode = String(area?.code ?? "").trim();
      const intensity = selectForecastIntensity(area);
      const isWarning = isEewWarningArea(event, area);
      if ((!nameKey && !areaCode) || (!intensity && !isWarning)) continue;
      const rank = getEarthquakeIntensityRank(intensity);
      const current = forecastByName.get(nameKey);
      if (current && (current.isWarning && !isWarning || current.isWarning === isWarning && current.rank > rank)) continue;
      const forecast = {
        areaName: String(area.name ?? "").trim(),
        intensity,
        intensityRange: formatForecastRange(area) || "調査中",
        rank,
        isWarning,
        isSimulation: Boolean(event.isSimulation),
        eventId: String(event.eventId ?? ""),
        intensityMethod: area.intensityMethod ?? "unknown",
        methodEvidence: area.methodEvidence ?? "insufficient-data",
        source: area.source ?? event.source ?? ""
      };
      if (nameKey) forecastByName.set(nameKey, forecast);
      if (areaCode) {
        const currentByCode = forecastByCode.get(areaCode);
        if (!currentByCode || isWarning && !currentByCode.isWarning || currentByCode.isWarning === isWarning && currentByCode.rank <= rank) forecastByCode.set(areaCode, forecast);
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
        areaName: forecast.areaName || String(feature.properties?.name ?? "EEW予報区"),
        color: forecast.isWarning ? EEW_WARNING_AREA_COLOR : getEarthquakeIntensityColor(forecast.intensity),
        fillOpacity: forecast.isWarning ? .34 : .46,
        lineWidth: forecast.isWarning ? 2 : 1.5
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
      Boolean(event.isWarn),
      Boolean(event.isSimulation),
      area?.code ?? "",
      normalizeEewAreaName(area?.name),
      area?.from ?? "",
      area?.to ?? "",
      area?.isWarning ?? "unknown",
      area?.type ?? "",
      area?.intensityMethod ?? "unknown"
    ].join(":")))
    .sort()
    .join("|");
}
