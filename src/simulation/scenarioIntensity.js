import {simulationGroundMeshCode} from "./groundModel.js";

const MODELS = ["point", "active-fault", "nankai-trough", "japan-trench", "kuril-trench"];
const CASES = ["full", "east", "west"];

// Local, explicitly selected surface-intensity data. No network upload/storage.
// A source URL describes provenance; it does not authenticate an imported file.
export function validatePublicScenarioData(data) {
  if (data?.type !== "MeteoScope published scenario intensities" || data.version !== 1 || data.surface !== true)
    throw new Error("Unsupported scenario data");
  const source = data.source, c = data.conditions;
  const url = new URL(source?.url);
  if (url.protocol !== "https:" || !/(?:^|\.)(?:go\.jp|lg\.jp|bosai\.go\.jp)$/u.test(url.hostname)
      || !source.title || String(source.title).length > 240 || !/^\d{4}-\d{2}-\d{2}$/u.test(source.published ?? "")
      || !data.caseLabel || String(data.caseLabel).length > 160) throw new Error("Missing scenario provenance");
  if (!c || !MODELS.includes(c.model) || !Number.isFinite(c.magnitude) || c.magnitude < 1 || c.magnitude > 9.5
      || !Number.isFinite(c.depthKm) || c.depthKm < 0 || c.depthKm > 700) throw new Error("Missing scenario conditions");
  if (c.model === "nankai-trough" && !CASES.includes(c.nankaiCase)) throw new Error("Explicit Nankai rupture case required");
  if (c.model === "nankai-trough") {
    const shakingCases = c.nankaiCase === "full" ? ["basic", "east", "west", "inland", "empirical", "maximum-envelope"] : ["basic", "inland"];
    if (!shakingCases.includes(c.shakingCase)) throw new Error("Explicit compatible Nankai shaking case required");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/u.test(data.caseId ?? "")) throw new Error("Scenario case ID required");
  if (c.model === "active-fault" && !/^F[0-9A-Z]{6}_\d{5}$/u.test(c.activeFaultId ?? "")) throw new Error("Fault plane ID required");
  if (c.model === "point" && (!Number.isFinite(c.longitude) || !Number.isFinite(c.latitude)
      || Math.abs(c.longitude) > 180 || Math.abs(c.latitude) > 85)) throw new Error("Epicenter required");
  if (c.model !== "point" && !["start", "center", "end"].includes(c.ruptureOrigin)) throw new Error("Rupture origin required");
  if (Array.isArray(data.stations) || Array.isArray(data.meshes)) throw new Error("Scenario values must be keyed objects");
  const entries = Object.entries(data.stations ?? {}), meshes = Object.entries(data.meshes ?? {});
  if (!entries.length && !meshes.length || entries.length + meshes.length > 500000) throw new Error("Empty or oversized scenario");
  for (const [key, value] of entries) if (!/^\d{1,10}$/u.test(key) || !Number.isFinite(value) || value < 0 || value > 7) throw new Error("Invalid station intensity");
  for (const [key] of entries) {
    const point = data.stationCoordinates?.[key];
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)
        || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 85) throw new Error("Station coordinates required");
  }
  for (const [key, value] of meshes) if (!/^\d{8}(?:[1-4]{2})?$/u.test(key) || !Number.isFinite(value) || value < 0 || value > 7) throw new Error("Invalid mesh intensity");
  if (meshes.length && data.coordinateSystem !== "WGS84") throw new Error("Mesh data must be converted to WGS84 before use");
  return structuredClone(data);
}

export function scenarioMatchesOptions(data, options) {
  if (!data) return false;
  const c = data.conditions;
  if (c.model !== options.model || Math.abs(c.magnitude - options.magnitude) > 1e-6 || Math.abs(c.depthKm - options.depthKm) > 1e-6) return false;
  if (c.model === "nankai-trough" && c.nankaiCase !== options.nankaiCase) return false;
  if (c.model === "active-fault" && c.activeFaultId !== options.activeFault?.FLT_ID) return false;
  if (c.model === "point") return Math.abs(c.longitude - options.longitude) <= .00005 && Math.abs(c.latitude - options.latitude) <= .00005;
  return c.ruptureOrigin === options.ruptureOrigin;
}

function mesh250(point) {
  const parent = simulationGroundMeshCode(point);
  if (!parent) return null;
  const y = Math.floor(point[1] * 480 + 1e-8) % 4, x = Math.floor(point[0] * 320 + 1e-8) % 4;
  return parent + (1 + (y >= 2 ? 2 : 0) + (x >= 2 ? 1 : 0)) + (1 + (y % 2 ? 2 : 0) + (x % 2 ? 1 : 0));
}

export function createPublicScenarioLookup(data, options) {
  if (!scenarioMatchesOptions(data, options)) return null;
  return {source: data.source, caseLabel: data.caseLabel,
    at(station) {
      const point = station.coordinates;
      const expected = data.stationCoordinates?.[station.id];
      const stationMatches = expected && expected.every((value, index) => Math.abs(value - point[index]) <= .00005);
      const value = (stationMatches ? data.stations?.[station.id] : null) ?? data.meshes?.[mesh250(point)] ?? data.meshes?.[simulationGroundMeshCode(point)];
      return Number.isFinite(value) ? value : null;
    }};
}
