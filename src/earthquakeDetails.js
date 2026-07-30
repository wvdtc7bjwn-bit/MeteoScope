import { getEarthquakeIntensityRank } from "./earthquakeIntensity.js";

export function buildEarthquakeObservationRows(earthquake = {}) {
  const stations = Array.isArray(earthquake.intensityStations) ? earthquake.intensityStations : [];
  const cities = Array.isArray(earthquake.intensityCities) ? earthquake.intensityCities : [];
  const source = stations.length ? stations : cities;
  const kind = stations.length ? "station" : "city";

  return source.map((item, index) => {
    const intensity = String(item.intensity ?? "").trim();
    const name = kind === "station"
      ? (item.stationName || item.cityName || item.code)
      : (item.cityName || item.areaName || item.code);
    return {
      id: String(item.code || `${kind}-${index}`),
      kind,
      prefecture: String(item.prefecture ?? "").trim(),
      name: String(name ?? "観測地点不明").trim() || "観測地点不明",
      intensity,
      intensityLabel: String(item.intensityLabel ?? "").trim() || "震度不明",
      intensityShort: String(item.intensityShort ?? "").trim() || "--",
      rank: Number.isFinite(Number(item.rank))
        ? Number(item.rank)
        : getEarthquakeIntensityRank(intensity)
    };
  }).sort((a, b) => (
    b.rank - a.rank
    || a.prefecture.localeCompare(b.prefecture, "ja")
    || a.name.localeCompare(b.name, "ja")
  ));
}

export function groupEarthquakeObservationRowsByMunicipality(observations = []) {
  const grouped = new Map();

  for (const observation of observations) {
    const municipality = getObservationMunicipalityName(observation?.name);
    const key = `${observation?.prefecture || ""}\u0000${municipality}`;
    const current = grouped.get(key);
    if (!current || Number(observation?.rank) > Number(current.rank)) {
      grouped.set(key, {
        ...observation,
        id: municipality || observation?.id,
        name: municipality || observation?.name
      });
    }
  }

  return [...grouped.values()].sort((a, b) => (
    b.rank - a.rank
    || a.prefecture.localeCompare(b.prefecture, "ja")
    || a.name.localeCompare(b.name, "ja")
  ));
}

function getObservationMunicipalityName(value) {
  const name = String(value || "").replace(/[＊*]/gu, "").trim();
  if (!name) return "";

  const designatedWard = name.match(/^(.+?市.+?区)/u);
  if (designatedWard) return designatedWard[1];

  const municipality = name.match(/^(.+?(?:市|区|町|村))/u);
  return municipality?.[1] || name;
}
