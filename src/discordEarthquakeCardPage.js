import { getEarthquakeIntensityColor } from "./earthquakeIntensity.js";
import { buildStationCoordinateLookup, findStationCoordinate } from "./jma/earthquakeStationLookup.js";
import { renderSocialShareCard } from "./socialShareCard.js";

async function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function main() {
  const eventId = new URL(location.href).searchParams.get("event");
  if (!/^\d{10,20}$/u.test(eventId ?? "")) return;
  const [cardResponse, mapResponse, stationsResponse, appIcon] = await Promise.all([
    fetch(`/api/earthquakes/discord-card?event=${encodeURIComponent(eventId)}`),
    fetch("/data/japan-prefectures.geojson"),
    fetch("/data/jma-intensity-stations.json"),
    loadImage("/icons/icon-192.png")
  ]);
  if (!cardResponse.ok || !mapResponse.ok || !stationsResponse.ok) return;
  const [card, japanGeoJson, stationData] = await Promise.all([
    cardResponse.json(), mapResponse.json(), stationsResponse.json()
  ]);
  const lookup = buildStationCoordinateLookup(stationData);
  const observations = (card.observations ?? []).map((station) => {
    const coordinate = findStationCoordinate({
      code: station.code,
      stationName: station.name
    }, lookup);
    return {
      name: station.name || coordinate?.name || station.code,
      intensity: station.intensity,
      intensityColor: station.intensityColor || getEarthquakeIntensityColor(station.intensity),
      coordinates: coordinate?.coordinates ?? null
    };
  });
  await document.fonts.ready;
  renderSocialShareCard(document.getElementById("earthquake-card"), {
    ...card,
    observations
  }, {
    format: "portrait",
    theme: "dark",
    language: "ja",
    japanGeoJson,
    appIcon
  });
  document.body.dataset.cardReady = "true";
}

main().catch((error) => {
  console.error("[MeteoScope] Discord earthquake card failed", error);
});
