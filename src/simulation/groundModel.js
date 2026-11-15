// Read the upstream processed model directly; do not bundle or redistribute J-SHIS meshes.
export const SIMULATION_GROUND_URL = "https://raw.githubusercontent.com/itachi-kun-itc/WE-Simulator/3b0f37d830b1994bac9a69c9686a90bcc24477c1/web/data/ground_model.json";

export function createSimulationGroundLoader(fetchImpl = globalThis.fetch) {
  let cached;
  let coveredCodes;
  return async function load({ signal, coordinates } = {}) {
    signal?.throwIfAborted();
    const requestedCodes = coordinates ? new Set(coordinates.map(simulationGroundMeshCode).filter(Boolean)) : null;
    if (cached && (!coveredCodes || (requestedCodes && [...requestedCodes].every(code => coveredCodes.has(code))))) return cached;
    const response = await fetchImpl(SIMULATION_GROUND_URL, { signal, cache: "force-cache", credentials: "omit" });
    if (!response.ok) throw new Error(`Ground model HTTP ${response.status}`);
    const model = await response.json();
    if (model?.type !== "J-SHIS ground model 1km mesh aggregate" || !model.meshes || Array.isArray(model.meshes)
      || model.meshValueFormat?.[0] !== "arv" || model.meshValueFormat?.[1] !== "avs" || !Object.keys(model.meshes).length) throw new Error("Invalid ground model");
    signal?.throwIfAborted();
    // The catalogue is small relative to the national mesh. Release unused cells
    // after parsing instead of retaining the full 16 MB model throughout playback.
    cached = requestedCodes ? { ...model, meshes: Object.fromEntries([...requestedCodes].filter(code => Object.hasOwn(model.meshes, code)).map(code => [code, model.meshes[code]])) } : model;
    coveredCodes = requestedCodes;
    return cached;
  };
}

export const loadSimulationGroundModel = createSimulationGroundLoader();

// JIS third-order mesh, matching the upstream 1km aggregation (not nearest-neighbor substitution).
export function simulationGroundMeshCode([longitude, latitude]) {
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || longitude < 122 || longitude >= 154 || latitude < 20 || latitude >= 47) return null;
  const latCell = Math.floor(latitude * 120 + 1e-8);
  const lonCell = Math.floor(longitude * 80 + 1e-8);
  return `${String(Math.floor(latCell / 80)).padStart(2, "0")}${String(Math.floor(lonCell / 80) - 100).padStart(2, "0")}${Math.floor(latCell % 80 / 10)}${Math.floor(lonCell % 80 / 10)}${latCell % 10}${lonCell % 10}`;
}

export function getSimulationGround(model, coordinates) {
  const code = simulationGroundMeshCode(coordinates);
  const values = code && model?.meshes?.[code];
  const arv = values?.[0];
  if (typeof arv !== "number" || !Number.isFinite(arv) || arv <= 0 || arv > 20) return null;
  const avs = values[1];
  return { code, arv, avs: typeof avs === "number" && Number.isFinite(avs) && avs > 0 ? avs : null };
}
