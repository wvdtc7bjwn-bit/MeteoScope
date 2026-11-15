// Directly read the upstream catalogue; no observation data or waveforms are redistributed.
export const SIMULATION_DETECTION_URL = "https://raw.githubusercontent.com/itachi-kun-itc/WE-Simulator/3b0f37d830b1994bac9a69c9686a90bcc24477c1/web/data/submarine_observation_points.geojson";

export function parseSimulationDetectionStations(data) {
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) throw new Error("Invalid detection catalogue");
  return data.features.flatMap(feature => {
    const network = feature.properties?.network;
    const coordinates = feature.geometry?.coordinates;
    if (!/^(S-net|DONET1|DONET2|N-net)$/.test(network) || feature.geometry?.type !== "Point"
      || !Array.isArray(coordinates) || coordinates.length !== 2 || !coordinates.every(Number.isFinite)
      || Math.abs(coordinates[0]) > 180 || Math.abs(coordinates[1]) > 85) return [];
    return [{ code: String(feature.properties.code ?? ""), network, coordinates }];
  });
}

export async function loadSimulationDetectionStations({ signal, fetchImpl = globalThis.fetch } = {}) {
  signal?.throwIfAborted();
  const response = await fetchImpl(SIMULATION_DETECTION_URL, { signal, cache: "force-cache", credentials: "omit" });
  if (!response.ok) throw new Error(`Detection catalogue HTTP ${response.status}`);
  const stations = parseSimulationDetectionStations(await response.json());
  signal?.throwIfAborted();
  if (!stations.length) throw new Error("Empty detection catalogue");
  return stations;
}
