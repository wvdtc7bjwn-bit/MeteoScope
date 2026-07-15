export function attachIntensityStationCoordinates(stations, stationLookup) {
  return stations.map((station) => {
    const coordinate = findStationCoordinate(station, stationLookup);
    return {
      ...station,
      stationName: station.stationName || coordinate?.name || station.code,
      coordinates: coordinate?.coordinates ?? station.coordinates ?? null
    };
  });
}

export function buildEmptyStationLookup() {
  return {
    byCode: new Map(),
    byNoCode: new Map(),
    byName: new Map(),
    byMunicipality: new Map()
  };
}

export function buildStationCoordinateLookup(raw) {
  const lookup = buildEmptyStationLookup();
  const entries = Array.isArray(raw)
    ? raw.map((station) => [station?.code ?? "", station])
    : Object.entries(raw ?? {});

  entries.forEach(([code, station]) => {
    const longitude = Number(station?.longitude);
    const latitude = Number(station?.latitude);
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return;

    const record = {
      code: String(code),
      noCode: station?.noCode ? String(station.noCode) : "",
      name: station?.name ?? "",
      cityName: station?.cityName ?? "",
      regionCode: normalizeAreaCode(station?.regionCode),
      regionName: station?.regionName ?? "",
      coordinates: [longitude, latitude]
    };

    if (record.code) lookup.byCode.set(record.code, record);
    if (record.noCode) lookup.byNoCode.set(record.noCode, record);
    addStationNameIndex(lookup.byName, record.name, record);
    addMunicipalityIndexes(lookup.byMunicipality, record.name, record);
  });

  return lookup;
}

export function findStationCoordinate(station, lookup) {
  const code = String(station?.code ?? "").trim();
  if (code && lookup.byCode.has(code)) return lookup.byCode.get(code);
  if (code && lookup.byNoCode.has(code)) return lookup.byNoCode.get(code);

  const normalizedName = normalizeStationName(station?.stationName);
  if (normalizedName && lookup.byName.has(normalizedName)) return lookup.byName.get(normalizedName);

  const cityPrefixedName = normalizeStationName(`${station?.cityName ?? ""}${station?.stationName ?? ""}`);
  if (cityPrefixedName && lookup.byName.has(cityPrefixedName)) return lookup.byName.get(cityPrefixedName);

  const municipalityKeys = [
    ...getMunicipalityKeys(station?.cityName),
    ...getMunicipalityKeys(station?.stationName)
  ];
  for (const municipalityKey of municipalityKeys) {
    const candidates = lookup.byMunicipality.get(municipalityKey) ?? [];
    if (candidates.length === 1) return candidates[0];
  }

  return null;
}

export function normalizeStationName(name) {
  return String(name ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/震度計$/u, "")
    .replace(/[＊*]+$/u, "")
    .trim();
}

function addStationNameIndex(index, name, record) {
  const normalized = normalizeStationName(name);
  if (!normalized || index.has(normalized)) return;
  index.set(normalized, record);
}

function addMunicipalityIndexes(index, name, record) {
  getMunicipalityKeys(name).forEach((key) => {
    if (!index.has(key)) index.set(key, []);
    index.get(key).push(record);
  });
}

function getMunicipalityKeys(name) {
  const normalized = normalizeStationName(name);
  const keys = [];
  let prefix = "";
  for (const character of normalized) {
    prefix += character;
    if (/[市区町村]/u.test(character)) keys.push(prefix);
  }
  return keys.reverse();
}

function normalizeAreaCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  return String(Number(digits));
}
