// J-SHIS fltinfo is not a surface mesh: MultiPoint supplies no connectivity,
// slip, SMGA, rupture speed or per-pattern Mw. Never invent these attributes.
export const JSHIS_PATTERN_SETS = Object.freeze({
  ACHSM: ["ACH", 13], ATKCH: ["ATK", 34], ANMRO: ["ANM", 24],
  AJTHK: ["AJT", 10], AAEIN: ["AAE", 51], AMYGI: ["AMY", 20], ANNKI: ["AN", 177]
});
export function expectedJshisPatterns(code, version) {
  const spec = JSHIS_PATTERN_SETS[code];
  // These counts are checked against the 2024 API/specification only.
  if (!spec || version !== "Y2024") return null;
  return Array.from({length: spec[1]}, (_, i) => spec[0] + String(i + 1).padStart(code === "ANNKI" ? 3 : 2, "0"));
}
export function validateJshisMetadata(data, {version, probabilityCase, code}) {
  if (data?.type !== "FeatureCollection" || data.status !== "Success"
    || data.crs?.properties?.name !== "urn:ogc:def:crs:EPSG:4326"
    || data.metaData?.version !== version || data.metaData?.case !== probabilityCase
    || data.metaData?.ltecode !== code || data.seisact_model?.ltecode !== code
    || !Array.isArray(data.features) || !data.features.length)
    throw new Error("Incomplete or mismatched J-SHIS response");
}
export function readJshisPointModel(data, identity) {
  validateJshisMetadata(data, identity);
  if (!Object.hasOwn(JSHIS_PATTERN_SETS, identity.code)) throw new Error("Unsupported marine model");
  let pointCount = 0;
  const patterns = data.features.map(feature => {
    const code = feature.properties?.pattern_code;
    const points = feature.geometry?.coordinates;
    if (feature.type !== "Feature" || typeof code !== "string" || feature.geometry?.type !== "MultiPoint"
      || !Array.isArray(points) || !points.length || points.length > 100000
      || points.some(p => !Array.isArray(p) || p.length !== 3 || !p.every(Number.isFinite)
        || p[0] < -180 || p[0] > 180 || p[1] < -85 || p[1] > 85 || p[2] < 0 || p[2] > 700))
      throw new Error("Invalid J-SHIS point geometry");
    pointCount += points.length;
    return {code, points, weight: feature.properties.weight ?? null};
  });
  const codes = patterns.map(p => p.code);
  const expected = expectedJshisPatterns(identity.code, identity.version);
  if (new Set(codes).size !== codes.length || pointCount !== Number(data.seisact_model.geom_num)
    || (expected && (expected.length !== codes.length || expected.some(code => !codes.includes(code)))))
    throw new Error("Missing, duplicate or incomplete J-SHIS patterns");
  // Retain the raw range; it is NOT the Mw of an individual pattern.
  return {identity, name: data.seisact_model.ltename, patterns, pointCount,
    magnitudeRange: [data.seisact_model.magl, data.seisact_model.magu], topology: null};
}
