const PRODUCTION_WORLD_TYPHOON_ROOT =
  "https://raw.githubusercontent.com/wvdtc7bjwn-bit/MeteoScope/world-forecast-data";

export const WORLD_TYPHOON_MODELS = {
  ecmwf: {
    id: "ecmwf",
    shortLabel: "ECMWF",
    label: "ECMWF IFS ENS",
    color: "#ec4899",
    developmentLabel: "アンサンブル支持",
    developmentUnit: "本"
  },
  "ifs-hres": {
    id: "ifs-hres",
    shortLabel: "IFS HRES",
    label: "ECMWF IFS HRES",
    color: "#f59e0b",
    developmentLabel: "決定論",
    developmentUnit: ""
  },
  "aifs-ens": {
    id: "aifs-ens",
    shortLabel: "AIFS ENS",
    label: "ECMWF AIFS ENS",
    color: "#14b8a6",
    developmentLabel: "アンサンブル支持",
    developmentUnit: "本"
  },
  "aifs-single": {
    id: "aifs-single",
    shortLabel: "AIFS",
    label: "ECMWF AIFS Single",
    color: "#84cc16",
    developmentLabel: "決定論",
    developmentUnit: ""
  },
  gefs: {
    id: "gefs",
    shortLabel: "NOAA",
    label: "NOAA/NCEP GEFS",
    color: "#0ea5e9",
    developmentLabel: "発生確率",
    developmentUnit: "%"
  },
  "gefs-mean": {
    id: "gefs-mean",
    shortLabel: "GEFS平均",
    label: "NOAA/NCEP GEFS Ensemble Mean",
    color: "#8b5cf6",
    developmentLabel: "発生確率",
    developmentUnit: "%"
  }
};

const WORLD_TYPHOON_URLS = {
  ecmwf: import.meta.env?.DEV
    ? "/data/world-typhoon-forecast.json"
    : (import.meta.env?.VITE_WORLD_TYPHOON_DATA_URL
      || `${PRODUCTION_WORLD_TYPHOON_ROOT}/world-typhoon-forecast.json`),
  "ifs-hres": import.meta.env?.DEV
    ? "/data/world-typhoon-forecast-ifs-hres.json"
    : (import.meta.env?.VITE_WORLD_TYPHOON_IFS_HRES_DATA_URL
      || `${PRODUCTION_WORLD_TYPHOON_ROOT}/world-typhoon-forecast-ifs-hres.json`),
  "aifs-ens": import.meta.env?.DEV
    ? "/data/world-typhoon-forecast-aifs-ens.json"
    : (import.meta.env?.VITE_WORLD_TYPHOON_AIFS_ENS_DATA_URL
      || `${PRODUCTION_WORLD_TYPHOON_ROOT}/world-typhoon-forecast-aifs-ens.json`),
  "aifs-single": import.meta.env?.DEV
    ? "/data/world-typhoon-forecast-aifs-single.json"
    : (import.meta.env?.VITE_WORLD_TYPHOON_AIFS_SINGLE_DATA_URL
      || `${PRODUCTION_WORLD_TYPHOON_ROOT}/world-typhoon-forecast-aifs-single.json`),
  gefs: import.meta.env?.DEV
    ? "/data/world-typhoon-forecast-gefs.json"
    : (import.meta.env?.VITE_WORLD_TYPHOON_GEFS_DATA_URL
      || `${PRODUCTION_WORLD_TYPHOON_ROOT}/world-typhoon-forecast-gefs.json`),
  "gefs-mean": import.meta.env?.DEV
    ? "/data/world-typhoon-forecast-gefs.json"
    : (import.meta.env?.VITE_WORLD_TYPHOON_GEFS_DATA_URL
      || `${PRODUCTION_WORLD_TYPHOON_ROOT}/world-typhoon-forecast-gefs.json`)
};

const MAX_NEAREST_SYSTEM_DISTANCE_KM = 1800;
const pendingWorldTyphoonPayloadRequests = new Map();

export const WORLD_TYPHOON_SOURCE_LABEL = WORLD_TYPHOON_MODELS.ecmwf.label;

async function fetchWorldTyphoonPayload(url) {
  const pendingRequest = pendingWorldTyphoonPayloadRequests.get(url);
  if (pendingRequest) return pendingRequest;

  const request = fetch(url, {
    cache: "no-cache",
    headers: { Accept: "application/json" }
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`World typhoon forecast request failed: ${response.status}`);
      }
      return response.json();
    })
    .finally(() => {
      pendingWorldTyphoonPayloadRequests.delete(url);
    });

  pendingWorldTyphoonPayloadRequests.set(url, request);
  return request;
}

export async function fetchWorldTyphoonForecast(modelId = "ecmwf") {
  const model = normalizeWorldTyphoonModel(modelId);
  const payload = await fetchWorldTyphoonPayload(WORLD_TYPHOON_URLS[model]);
  if (Number(payload?.schemaVersion) !== 1 || !Array.isArray(payload?.systems)) {
    throw new Error("World typhoon forecast response has an unsupported schema");
  }
  if (!payload?.source?.license || !payload?.source?.attribution) {
    throw new Error("World typhoon forecast licence metadata is missing");
  }
  if (["ecmwf", "ifs-hres", "aifs-ens", "aifs-single"].includes(model)
    && payload.source.license !== "CC BY 4.0") {
    throw new Error("ECMWF world typhoon forecast licence metadata is invalid");
  }
  if (["gefs", "gefs-mean"].includes(model) && payload.source.model !== "GEFS") {
    throw new Error("NOAA GEFS world typhoon forecast metadata is invalid");
  }

  const result = {
    ...payload,
    model,
    systems: payload.systems.map(normalizeWorldSystem).filter(Boolean)
  };
  if (model !== "gefs-mean") return result;
  return {
    ...result,
    source: {
      ...result.source,
      model: "GEFS Ensemble Mean",
      attribution: `${result.source.attribution} ensemble mean`,
      modified: true
    },
    systems: result.systems.map(buildEnsembleMeanSystem).filter(Boolean)
  };
}

export function normalizeWorldTyphoonModel(modelId) {
  return Object.hasOwn(WORLD_TYPHOON_MODELS, modelId) ? modelId : "ecmwf";
}

export function getWorldTyphoonModel(modelId) {
  return WORLD_TYPHOON_MODELS[normalizeWorldTyphoonModel(modelId)];
}

export function selectWorldTyphoonSystem(worldData, jmaTyphoon = null) {
  const systems = worldData?.systems ?? [];
  if (!systems.length) return null;

  const namedSystems = systems.filter((system) => system.kind === "named");
  const candidates = namedSystems.length ? namedSystems : systems;
  const jmaCenter = normalizeCoordinates(jmaTyphoon?.center);
  if (!jmaCenter) {
    return [...candidates].sort(compareWorldSystems)[0] ?? null;
  }

  const nearest = candidates
    .map((system) => ({
      system,
      distanceKm: greatCircleDistanceKm(jmaCenter, system.observedCenter)
    }))
    .filter((item) => Number.isFinite(item.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm)[0];

  if (nearest && nearest.distanceKm <= MAX_NEAREST_SYSTEM_DISTANCE_KM) {
    return nearest.system;
  }
  return [...candidates].sort(compareWorldSystems)[0] ?? null;
}

export function selectWorldTyphoonGenesisSystems(
  worldData,
  { minMembers = 20, minProbability = 20, limit = 12 } = {}
) {
  return (worldData?.systems ?? [])
    .filter((system) =>
      system.kind === "genesis"
      && (
        (Number.isFinite(system.genesisProbability) && system.genesisProbability >= minProbability)
        || (!Number.isFinite(system.genesisProbability) && (system.memberCount ?? 0) >= minMembers)
      )
      && system.observedCenter
    )
    .sort((a, b) => {
      const probabilityDiff = (b.genesisProbability ?? -1) - (a.genesisProbability ?? -1);
      if (probabilityDiff) return probabilityDiff;
      const memberDiff = (b.memberCount ?? 0) - (a.memberCount ?? 0);
      if (memberDiff) return memberDiff;
      return getSystemMaxStep(b) - getSystemMaxStep(a);
    })
    .slice(0, Math.max(0, limit));
}

export function getWorldTyphoonFocusCoordinates(system) {
  if (!system) return [];
  const memberCoordinates = (system.members ?? [])
    .flatMap((member) => member.coordinates ?? []);
  return [
    system.observedCenter,
    ...(system.controlCoordinates ?? []),
    ...(system.deterministicCoordinates ?? []),
    ...memberCoordinates
  ].filter(Boolean);
}

export function getWorldTyphoonRepresentativePoints(system) {
  if (system?.controlPoints?.length) return system.controlPoints;
  if (system?.deterministicPoints?.length) return system.deterministicPoints;
  const controlMember = (system?.members ?? []).find((member) => Number(member.id) === 0);
  return controlMember?.points?.length
    ? controlMember.points
    : (system?.members?.[0]?.points ?? []);
}

export function buildWorldTyphoonTimeline(layers = []) {
  const timestamps = new Set();
  layers.forEach((layer) => {
    const systems = layer?.timelineSystems?.length
      ? layer.timelineSystems
      : [layer?.system].filter(Boolean);
    systems.forEach((system) => {
      const baseTime = Date.parse(system?.forecastBaseTime ?? "");
      if (!Number.isFinite(baseTime)) return;
      getWorldTyphoonRepresentativePoints(system).forEach((point) => {
        const stepHours = Number(point?.stepHours);
        if (!Number.isFinite(stepHours)) return;
        timestamps.add(baseTime + stepHours * 60 * 60 * 1000);
      });
    });
  });
  return [...timestamps]
    .sort((a, b) => a - b)
    .map((timestamp) => new Date(timestamp).toISOString());
}

export function selectWorldTyphoonForecastPosition(system, validTime) {
  return selectForecastTrackPosition(
    system?.forecastBaseTime,
    getWorldTyphoonRepresentativePoints(system),
    validTime
  );
}

export function selectWorldTyphoonForecastPositions(system, validTime) {
  const hasControlTrack = Boolean(system?.controlPoints?.length);
  const positions = [];
  const appendPosition = (points, trackType, memberId, memberIndex = null) => {
    const position = selectForecastTrackPosition(
      system?.forecastBaseTime,
      points,
      validTime
    );
    if (position) {
      positions.push({
        position,
        trackType,
        memberId,
        memberIndex
      });
    }
  };

  if (hasControlTrack) {
    appendPosition(system.controlPoints, "control", 0);
  }
  if (system?.deterministicPoints?.length) {
    appendPosition(system.deterministicPoints, "deterministic", null);
  }
  (system?.members ?? []).forEach((member, memberIndex) => {
    if (hasControlTrack && Number(member.id) === 0) return;
    appendPosition(member.points ?? [], "member", Number(member.id), memberIndex);
  });

  if (
    !hasControlTrack
    && !system?.deterministicPoints?.length
    && !(system?.members ?? []).length
  ) {
    appendPosition(getWorldTyphoonRepresentativePoints(system), "representative", null);
  }
  return positions;
}

function selectForecastTrackPosition(forecastBaseTime, points, validTime) {
  const baseTime = Date.parse(forecastBaseTime ?? "");
  const targetTime = Date.parse(validTime ?? "");
  if (!Number.isFinite(baseTime) || !Number.isFinite(targetTime) || !points.length) return null;
  const timedPoints = points
    .map((point) => {
      const stepHours = Number(point?.stepHours);
      return Number.isFinite(stepHours)
        ? { point, pointTime: baseTime + stepHours * 60 * 60 * 1000 }
        : null;
    })
    .filter(Boolean)
    .sort((a, b) => a.pointTime - b.pointTime);
  if (
    !timedPoints.length
    || targetTime < timedPoints[0].pointTime
    || targetTime > timedPoints.at(-1).pointTime
  ) return null;

  const upperIndex = timedPoints.findIndex(({ pointTime }) => pointTime >= targetTime);
  const upper = timedPoints[Math.max(0, upperIndex)];
  const lower = timedPoints[Math.max(0, upperIndex - 1)] ?? upper;
  if (!lower?.point?.coordinates || !upper?.point?.coordinates) return null;
  const duration = upper.pointTime - lower.pointTime;
  const ratio = duration > 0 ? (targetTime - lower.pointTime) / duration : 0;
  const basePoint = ratio < 0.5 ? lower.point : upper.point;
  return {
    ...basePoint,
    coordinates: interpolateForecastCoordinates(
      lower.point.coordinates,
      upper.point.coordinates,
      ratio
    ),
    stepHours: interpolateForecastNumber(lower.point.stepHours, upper.point.stepHours, ratio),
    pressureHpa: interpolateForecastNumber(lower.point.pressureHpa, upper.point.pressureHpa, ratio),
    windMs: interpolateForecastNumber(lower.point.windMs, upper.point.windMs, ratio),
    validTime: new Date(targetTime).toISOString()
  };
}

function interpolateForecastCoordinates(from, to, ratio) {
  const fromLongitude = Number(from?.[0]);
  const toLongitude = Number(to?.[0]);
  const fromLatitude = Number(from?.[1]);
  const toLatitude = Number(to?.[1]);
  let longitudeDelta = toLongitude - fromLongitude;
  if (longitudeDelta > 180) longitudeDelta -= 360;
  if (longitudeDelta < -180) longitudeDelta += 360;
  let longitude = fromLongitude + longitudeDelta * ratio;
  if (longitude > 180) longitude -= 360;
  if (longitude < -180) longitude += 360;
  return [
    roundCoordinate(longitude),
    roundCoordinate(fromLatitude + (toLatitude - fromLatitude) * ratio)
  ];
}

function interpolateForecastNumber(from, to, ratio) {
  const fromNumber = Number(from);
  const toNumber = Number(to);
  if (Number.isFinite(fromNumber) && Number.isFinite(toNumber)) {
    return Math.round((fromNumber + (toNumber - fromNumber) * ratio) * 10) / 10;
  }
  if (Number.isFinite(fromNumber)) return fromNumber;
  if (Number.isFinite(toNumber)) return toNumber;
  return null;
}

function normalizeWorldSystem(system) {
  const id = String(system?.id ?? "").trim();
  const isGenesis = system?.kind === "genesis";
  const members = (system?.members ?? [])
    .map((member) => {
      const points = (member?.points ?? []).map(normalizePoint).filter(Boolean);
      return points.length >= 2 ? {
        id: Number(member.id),
        points,
        coordinates: points.map((point) => point.coordinates)
      } : null;
    })
    .filter(Boolean);

  const controlPoints = (system?.controlTrack ?? []).map(normalizePoint).filter(Boolean);
  const deterministicPoints = (system?.deterministicTrack ?? []).map(normalizePoint).filter(Boolean);
  if (!id || (!members.length && !isGenesis && controlPoints.length < 2)) return null;
  if (isGenesis && !members.length && !controlPoints.length) return null;
  const observedCenter = normalizeCoordinates(system?.observedCenter)
    ?? controlPoints[0]?.coordinates
    ?? members[0]?.points?.[0]?.coordinates
    ?? null;
  return {
    id,
    name: String(system?.name ?? id).trim() || id,
    kind: isGenesis ? "genesis" : "named",
    forecastBaseTime: system?.forecastBaseTime ?? "",
    observedCenter,
    memberCount: Number.isFinite(Number(system?.memberCount))
      ? Number(system.memberCount)
      : members.length,
    genesisProbability: Number.isFinite(Number(system?.genesisProbability))
      ? Number(system.genesisProbability)
      : null,
    members,
    controlPoints,
    controlCoordinates: controlPoints.map((point) => point.coordinates),
    deterministicPoints,
    deterministicCoordinates: deterministicPoints.map((point) => point.coordinates)
  };
}

export function buildEnsembleMeanSystem(system) {
  const pointsByStep = new Map();
  (system.members ?? []).forEach((member) => {
    (member.points ?? []).forEach((point) => {
      const step = Number(point.stepHours);
      if (!Number.isFinite(step)) return;
      if (!pointsByStep.has(step)) pointsByStep.set(step, []);
      pointsByStep.get(step).push(point);
    });
  });
  const meanPoints = [...pointsByStep.entries()]
    .sort(([stepA], [stepB]) => stepA - stepB)
    .map(([stepHours, points]) => {
      if (!points.length) return null;
      const longitudeRadians = points.map((point) => point.coordinates[0] * Math.PI / 180);
      const longitude = Math.atan2(
        longitudeRadians.reduce((sum, value) => sum + Math.sin(value), 0),
        longitudeRadians.reduce((sum, value) => sum + Math.cos(value), 0)
      ) * 180 / Math.PI;
      const latitude = points.reduce((sum, point) => sum + point.coordinates[1], 0) / points.length;
      const pressureValues = points.map((point) => point.pressureHpa).filter(Number.isFinite);
      const windValues = points.map((point) => point.windMs).filter(Number.isFinite);
      return {
        coordinates: [roundCoordinate(longitude), roundCoordinate(latitude)],
        stepHours,
        pressureHpa: averageOrNull(pressureValues),
        windMs: averageOrNull(windValues)
      };
    })
    .filter(Boolean);
  if (meanPoints.length < 2) return null;
  return {
    ...system,
    observedCenter: meanPoints[0].coordinates,
    members: [],
    controlPoints: meanPoints,
    controlCoordinates: meanPoints.map((point) => point.coordinates),
    deterministicPoints: [],
    deterministicCoordinates: []
  };
}

function averageOrNull(values) {
  if (!values.length) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10;
}

function roundCoordinate(value) {
  return Math.round(value * 100) / 100;
}

function getSystemMaxStep(system) {
  return Math.max(
    0,
    ...(system?.controlPoints ?? []).map((point) => Number(point.stepHours) || 0),
    ...(system?.members ?? []).flatMap((member) =>
      (member.points ?? []).map((point) => Number(point.stepHours) || 0)
    )
  );
}

function normalizePoint(point) {
  if (!Array.isArray(point) || point.length < 3) return null;
  const coordinates = normalizeCoordinates(point);
  const stepHours = Number(point[2]);
  if (!coordinates || !Number.isFinite(stepHours)) return null;
  return {
    coordinates,
    stepHours,
    pressureHpa: finiteOrNull(point[3]),
    windMs: finiteOrNull(point[4])
  };
}

function normalizeCoordinates(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return null;
  return [longitude, latitude];
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function compareWorldSystems(a, b) {
  if (a.kind !== b.kind) return a.kind === "named" ? -1 : 1;
  return (b.memberCount ?? 0) - (a.memberCount ?? 0);
}

function greatCircleDistanceKm(a, b) {
  if (!a || !b) return Number.POSITIVE_INFINITY;
  const toRadians = (value) => value * Math.PI / 180;
  const lat1 = toRadians(a[1]);
  const lat2 = toRadians(b[1]);
  const deltaLat = lat2 - lat1;
  const deltaLon = toRadians(b[0] - a[0]);
  const haversine = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}
