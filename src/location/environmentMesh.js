// Japanese standard regional mesh, 80 × 80 third-order cells per primary mesh.
export const ENVIRONMENT_SCHEMA = Object.freeze({ headerBytes: 16, cellBytes: 10, cells: 6400, version: 1 });
export function environmentMeshPosition(coordinates) {
  const [longitude, latitude] = coordinates ?? [];
  if (![longitude, latitude].every(Number.isFinite) || longitude < 122 || longitude >= 154 || latitude < 20 || latitude >= 46) return null;
  const north = latitude * 1.5, east = longitude - 100;
  const lat = Math.floor(north), lon = Math.floor(east);
  const row = Math.min(79, Math.floor((north - lat) * 80 + 1e-8));
  const column = Math.min(79, Math.floor((east - lon) * 80 + 1e-8));
  return { primary: `${lat}${String(lon).padStart(2, "0")}`, index: row * 80 + column,
    meshCode: `${lat}${String(lon).padStart(2, "0")}${Math.floor(row / 10)}${Math.floor(column / 10)}${row % 10}${column % 10}` };
}
export function environmentMeshIndex(code) {
  const text = String(code);
  if (!/^\d{8}$/.test(text) || Number(text[4]) > 7 || Number(text[5]) > 7) return null;
  return (Number(text[4]) * 10 + Number(text[6])) * 80 + Number(text[5]) * 10 + Number(text[7]);
}
export function decodeEnvironmentTile(buffer, primary) {
  const spec = ENVIRONMENT_SCHEMA;
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== spec.headerBytes + spec.cells * spec.cellBytes) throw new Error("Invalid environment tile length");
  const view = new DataView(buffer);
  if (view.getUint32(0, false) !== 0x4d534531 || view.getUint16(4, true) !== spec.version || view.getUint16(6, true) !== Number(primary)) throw new Error("Invalid environment tile header");
  return { view, landYear: view.getUint16(8, true) || null, terrainYear: view.getUint16(10, true) || null };
}
export function sampleEnvironmentTile(tile, position) {
  if (!tile || !position) return null;
  const start = ENVIRONMENT_SCHEMA.headerBytes + position.index * ENVIRONMENT_SCHEMA.cellBytes, view = tile.view;
  const ratio = i => { const value = view.getUint8(start + i); return value > 250 ? null : value / 250; };
  const height = view.getInt16(start + 5, true), relief = view.getUint16(start + 7, true), slope = view.getUint8(start + 9);
  const result = { urban: ratio(0), forest: ratio(1), farm: ratio(2), water: ratio(3), sea: ratio(4),
    meanElevation: height === -32768 ? null : height, relief: relief === 65535 ? null : relief,
    slope: slope === 255 ? null : slope / 2, landYear: tile.landYear, terrainYear: tile.terrainYear, meshCode: position.meshCode };
  return result.urban == null && result.meanElevation == null ? null : result;
}
