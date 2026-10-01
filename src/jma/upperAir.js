const MISSING_VALUE = /^(?:|\/\/\/|---|×)$/u;

const GAS_CONSTANT_DRY_AIR = 287.05;
const SPECIFIC_HEAT_DRY_AIR = 1004;
const WATER_VAPOR_RATIO = 0.622;
const LATENT_HEAT_VAPORIZATION = 2.5e6;
const KELVIN_OFFSET = 273.15;

export const UPPER_AIR_STATIONS = [
  { id: "47401", name: "稚内" },
  { id: "47412", name: "札幌" },
  { id: "47418", name: "釧路" },
  { id: "47582", name: "秋田" },
  { id: "47600", name: "輪島" },
  { id: "47646", name: "館野" },
  { id: "47678", name: "八丈島" },
  { id: "47741", name: "松江" },
  { id: "47778", name: "潮岬" },
  { id: "47807", name: "福岡" },
  { id: "47827", name: "鹿児島" },
  { id: "47909", name: "名瀬" },
  { id: "47918", name: "石垣島" },
  { id: "47945", name: "南大東島" },
  { id: "47971", name: "父島" },
  { id: "47991", name: "南鳥島" }
];

function decodeHtml(value = "") {
  return value
    .replace(/<br\s*\/?>/giu, " ")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/<[^>]+>/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function toNumber(value) {
  const normalized = decodeHtml(value);
  if (MISSING_VALUE.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

/**
 * Extracts the JMA "気温・湿度の観測データ" table without relying on its
 * presentation CSS.  The source is intentionally kept as raw official data.
 */
export function parseUpperAirTemperatureHumidityHtml(html) {
  if (typeof html !== "string" || !html.includes("気圧")) return [];
  const rows = [];
  const rowPattern = /<tr\b[^>]*class=["'][^"']*mtx[^"']*["'][^>]*>([\s\S]*?)<\/tr>/giu;
  for (const rowMatch of html.matchAll(rowPattern)) {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)]
      .map((cell) => decodeHtml(cell[1]));
    if (cells.length < 4) continue;
    const pressure = toNumber(cells[0]);
    const height = toNumber(cells[1]);
    const temperature = toNumber(cells[2]);
    const humidity = toNumber(cells[3]);
    if (pressure === null || height === null || temperature === null || pressure <= 0) continue;
    rows.push({ pressure, height, temperature, humidity });
  }
  return rows.sort((a, b) => b.pressure - a.pressure);
}

export function parseUpperAirWindHtml(html) {
  if (typeof html !== "string" || !html.includes("風速")) return [];
  const rows = [];
  const rowPattern = /<tr\b[^>]*class=["'][^"']*mtx[^"']*["'][^>]*>([\s\S]*?)<\/tr>/giu;
  for (const rowMatch of html.matchAll(rowPattern)) {
    const cells = [...rowMatch[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/giu)]
      .map((cell) => decodeHtml(cell[1]));
    if (cells.length < 4) continue;
    const pressure = toNumber(cells[0]);
    const height = toNumber(cells[1]);
    const speed = toNumber(cells[2]);
    const direction = toNumber(cells[3]);
    if (pressure === null || height === null || pressure <= 0) continue;
    const hasWind = speed !== null && speed >= 0 && direction !== null && direction >= 0 && direction <= 360;
    const radians = hasWind ? (direction * Math.PI) / 180 : null;
    rows.push({
      pressure,
      height,
      windSpeed: hasWind ? speed : null,
      windDirection: hasWind ? direction : null,
      uWind: hasWind ? -speed * Math.sin(radians) : null,
      vWind: hasWind ? -speed * Math.cos(radians) : null
    });
  }
  return rows.sort((a, b) => b.pressure - a.pressure);
}

function windAtPressure(windRows, pressure) {
  const validRows = windRows.filter((row) => Number.isFinite(row.uWind) && Number.isFinite(row.vWind));
  for (const row of validRows) {
    if (Math.abs(row.pressure - pressure) <= 1.5) return { uWind: row.uWind, vWind: row.vWind };
  }
  for (let index = 0; index < validRows.length - 1; index += 1) {
    const lower = validRows[index];
    const upper = validRows[index + 1];
    if (lower.pressure < pressure || upper.pressure > pressure || lower.pressure - upper.pressure > 200) continue;
    const fraction = (Math.log(pressure) - Math.log(upper.pressure))
      / (Math.log(lower.pressure) - Math.log(upper.pressure));
    return {
      uWind: upper.uWind + (lower.uWind - upper.uWind) * fraction,
      vWind: upper.vWind + (lower.vWind - upper.vWind) * fraction
    };
  }
  return { uWind: null, vWind: null };
}

export function mergeUpperAirWinds(temperatureRows, windRows) {
  if (!Array.isArray(temperatureRows) || !Array.isArray(windRows) || !windRows.length) return temperatureRows ?? [];
  return temperatureRows.map((row) => {
    const wind = windAtPressure(windRows, row.pressure);
    const speed = Number.isFinite(wind.uWind) && Number.isFinite(wind.vWind)
      ? Math.hypot(wind.uWind, wind.vWind)
      : null;
    const direction = Number.isFinite(speed) && speed > 0
      ? (Math.atan2(-wind.uWind, -wind.vWind) * 180 / Math.PI + 360) % 360
      : speed === 0 ? null : null;
    return { ...row, ...wind, windSpeed: speed, windDirection: direction };
  });
}

export function calculateDewPoint(temperature, humidity) {
  if (!Number.isFinite(temperature) || !Number.isFinite(humidity) || humidity <= 0 || humidity > 100) return null;
  const a = 17.625;
  const b = 243.04;
  const gamma = Math.log(humidity / 100) + (a * temperature) / (b + temperature);
  return (b * gamma) / (a - gamma);
}

export function saturationVaporPressure(temperature) {
  if (!Number.isFinite(temperature)) return null;
  const temperatureKelvin = temperature + KELVIN_OFFSET;
  if (temperatureKelvin < 123 || temperatureKelvin > 373.15) return null;
  const logarithm = temperatureKelvin >= KELVIN_OFFSET
    ? 54.842763
      - 6763.22 / temperatureKelvin
      - 4.210 * Math.log(temperatureKelvin)
      + 0.000367 * temperatureKelvin
      + Math.tanh(0.0415 * (temperatureKelvin - 218.8))
        * (53.878 - 1331.22 / temperatureKelvin - 9.44523 * Math.log(temperatureKelvin) + 0.014025 * temperatureKelvin)
    : 9.550426
      - 5723.265 / temperatureKelvin
      + 3.53068 * Math.log(temperatureKelvin)
      - 0.00728332 * temperatureKelvin;
  return Math.exp(logarithm) / 100;
}

export function temperatureAlongDryAdiabat(potentialTemperature, pressure) {
  if (!Number.isFinite(potentialTemperature) || !Number.isFinite(pressure) || pressure <= 0) return null;
  return (potentialTemperature + KELVIN_OFFSET)
    * Math.pow(pressure / 1000, GAS_CONSTANT_DRY_AIR / SPECIFIC_HEAT_DRY_AIR)
    - KELVIN_OFFSET;
}

export function temperatureForSaturationMixingRatio(mixingRatioGKg, pressure) {
  if (!Number.isFinite(mixingRatioGKg) || !Number.isFinite(pressure) || mixingRatioGKg <= 0 || pressure <= 0) return null;
  const mixingRatio = mixingRatioGKg / 1000;
  const vaporPressure = (mixingRatio * pressure) / (WATER_VAPOR_RATIO + mixingRatio);
  if (vaporPressure <= 0 || vaporPressure >= pressure) return null;
  let lower = -100;
  let upper = 60;
  for (let iteration = 0; iteration < 24; iteration += 1) {
    const temperature = (lower + upper) / 2;
    const saturationPressure = saturationVaporPressure(temperature);
    if (!Number.isFinite(saturationPressure)) return null;
    if (saturationPressure < vaporPressure) lower = temperature;
    else upper = temperature;
  }
  return (lower + upper) / 2;
}

function saturationMixingRatio(temperatureKelvin, pressurePascal) {
  const vaporPressurePascal = saturationVaporPressure(temperatureKelvin - KELVIN_OFFSET) * 100;
  if (!Number.isFinite(vaporPressurePascal) || vaporPressurePascal <= 0 || vaporPressurePascal >= pressurePascal) return 0;
  return WATER_VAPOR_RATIO * vaporPressurePascal / (pressurePascal - vaporPressurePascal);
}

function moistAdiabatDerivative(temperatureKelvin, pressurePascal) {
  const mixingRatio = saturationMixingRatio(temperatureKelvin, pressurePascal);
  const latentHeat = temperatureKelvin >= KELVIN_OFFSET
    ? LATENT_HEAT_VAPORIZATION - 2361 * (temperatureKelvin - KELVIN_OFFSET)
    : 2.834e6;
  const numerator = GAS_CONSTANT_DRY_AIR + (latentHeat * mixingRatio) / temperatureKelvin;
  const denominator = SPECIFIC_HEAT_DRY_AIR
    + (latentHeat ** 2 * mixingRatio * WATER_VAPOR_RATIO)
      / (GAS_CONSTANT_DRY_AIR * temperatureKelvin ** 2);
  return (temperatureKelvin / pressurePascal) * (numerator / denominator);
}

export function buildMoistAdiabat(startTemperature, { bottomPressure = 1000, topPressure = 100, step = 1 } = {}) {
  if (!Number.isFinite(startTemperature) || !Number.isFinite(bottomPressure) || !Number.isFinite(topPressure) || step <= 0) return [];
  const profile = [];
  let pressure = bottomPressure;
  let temperatureKelvin = startTemperature + KELVIN_OFFSET;
  while (pressure >= topPressure) {
    profile.push({ pressure, temperature: temperatureKelvin - KELVIN_OFFSET });
    const pressureStepPascal = -Math.min(step, pressure - topPressure) * 100;
    if (pressureStepPascal === 0) break;
    const pressurePascal = pressure * 100;
    const k1 = moistAdiabatDerivative(temperatureKelvin, pressurePascal);
    const k2 = moistAdiabatDerivative(temperatureKelvin + (pressureStepPascal * k1) / 2, pressurePascal + pressureStepPascal / 2);
    const k3 = moistAdiabatDerivative(temperatureKelvin + (pressureStepPascal * k2) / 2, pressurePascal + pressureStepPascal / 2);
    const k4 = moistAdiabatDerivative(temperatureKelvin + pressureStepPascal * k3, pressurePascal + pressureStepPascal);
    temperatureKelvin += (pressureStepPascal / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
    pressure += pressureStepPascal / 100;
    if (!Number.isFinite(temperatureKelvin) || temperatureKelvin < 150 || temperatureKelvin > 380) break;
  }
  return profile;
}

export function buildUpperAirProfile(rows) {
  return rows
    .map((row) => {
      const dewPoint = calculateDewPoint(row.temperature, row.humidity);
      let { uWind, vWind } = row;
      if (!Number.isFinite(uWind) && Number.isFinite(row.windSpeed) && Number.isFinite(row.windDirection)) {
        const radians = (row.windDirection * Math.PI) / 180;
        uWind = -row.windSpeed * Math.sin(radians);
        vWind = -row.windSpeed * Math.cos(radians);
      }
      const windSpeed = Number.isFinite(uWind) && Number.isFinite(vWind) ? Math.hypot(uWind, vWind) : row.windSpeed ?? null;
      const windDirection = Number.isFinite(windSpeed) && windSpeed > 0 && Number.isFinite(uWind) && Number.isFinite(vWind)
        ? (Math.atan2(-uWind, -vWind) * 180 / Math.PI + 360) % 360
        : row.windDirection ?? null;
      return { ...row, dewPoint, uWind: uWind ?? null, vWind: vWind ?? null, windSpeed, windDirection };
    })
    .filter((row) => row.pressure >= 100 && row.pressure <= 1050 && row.temperature >= -100 && row.temperature <= 60);
}

function interpolateAtPressure(profile, pressure) {
  for (let index = 0; index < profile.length - 1; index += 1) {
    const lower = profile[index];
    const upper = profile[index + 1];
    if (lower.pressure >= pressure && upper.pressure <= pressure) {
      const ratio = (pressure - upper.pressure) / (lower.pressure - upper.pressure);
      return {
        temperature: upper.temperature + (lower.temperature - upper.temperature) * ratio,
        height: upper.height + (lower.height - upper.height) * ratio,
        humidity: Number.isFinite(lower.humidity) && Number.isFinite(upper.humidity)
          ? upper.humidity + (lower.humidity - upper.humidity) * ratio
          : null,
        dewPoint: Number.isFinite(lower.dewPoint) && Number.isFinite(upper.dewPoint)
          ? upper.dewPoint + (lower.dewPoint - upper.dewPoint) * ratio
          : null
      };
    }
  }
  return null;
}

export function summarizeUpperAirProfile(profile) {
  if (!profile.length) return null;
  const surface = profile[0];
  const at850 = interpolateAtPressure(profile, 850);
  const at500 = interpolateAtPressure(profile, 500);
  let freezingHeight = null;
  for (let index = 0; index < profile.length - 1; index += 1) {
    const lower = profile[index];
    const upper = profile[index + 1];
    if ((lower.temperature >= 0 && upper.temperature <= 0) || (lower.temperature <= 0 && upper.temperature >= 0)) {
      const span = lower.temperature - upper.temperature;
      if (span !== 0) freezingHeight = lower.height + (lower.temperature / span) * (upper.height - lower.height);
      break;
    }
  }
  return { surface, at850, at500, freezingHeight };
}

function findLowLevelInversion(profile) {
  for (let index = 0; index < profile.length - 1; index += 1) {
    const lower = profile[index];
    const upper = profile[index + 1];
    const heightSpan = upper.height - lower.height;
    const temperatureChange = upper.temperature - lower.temperature;
    if (heightSpan >= 80 && heightSpan <= 1200 && temperatureChange >= 0.5) {
      return {
        baseHeight: lower.height,
        topHeight: upper.height,
        temperatureChange
      };
    }
  }
  return null;
}

function interpolateWindAtHeight(profile, height) {
  const windRows = profile
    .filter((row) => Number.isFinite(row.height) && Number.isFinite(row.uWind) && Number.isFinite(row.vWind))
    .sort((a, b) => a.height - b.height);
  if (!windRows.length) return null;
  for (const row of windRows) {
    if (Math.abs(row.height - height) <= 50) return { uWind: row.uWind, vWind: row.vWind };
  }
  for (let index = 0; index < windRows.length - 1; index += 1) {
    const lower = windRows[index];
    const upper = windRows[index + 1];
    if (lower.height > height || upper.height < height || upper.height - lower.height > 2500) continue;
    const fraction = (height - lower.height) / (upper.height - lower.height);
    return {
      uWind: lower.uWind + (upper.uWind - lower.uWind) * fraction,
      vWind: lower.vWind + (upper.vWind - lower.vWind) * fraction
    };
  }
  return null;
}

function windShear(profile, depthMeters) {
  const surface = profile.find((row) => Number.isFinite(row.height));
  if (!surface) return null;
  const lower = interpolateWindAtHeight(profile, surface.height);
  const upper = interpolateWindAtHeight(profile, surface.height + depthMeters);
  if (!lower || !upper) return null;
  return Math.hypot(upper.uWind - lower.uWind, upper.vWind - lower.vWind);
}

function mixingRatioFromDewPoint(dewPoint, pressure) {
  if (!Number.isFinite(dewPoint) || !Number.isFinite(pressure) || pressure <= 0) return 0;
  const vaporPressure = saturationVaporPressure(dewPoint);
  const pressurePascal = pressure * 100;
  if (!Number.isFinite(vaporPressure) || vaporPressure * 100 >= pressurePascal) return 0;
  return WATER_VAPOR_RATIO * vaporPressure * 100 / (pressurePascal - vaporPressure * 100);
}

export function calculateLcl(temperature, dewPoint, pressure) {
  if (![temperature, dewPoint, pressure].every(Number.isFinite) || pressure <= 0) return null;
  const temperatureKelvin = temperature + KELVIN_OFFSET;
  const dewPointKelvin = Math.min(dewPoint, temperature) + KELVIN_OFFSET;
  if (temperatureKelvin <= 0 || dewPointKelvin <= 0) return null;
  const lclKelvin = 1 / (1 / (dewPointKelvin - 56) + Math.log(temperatureKelvin / dewPointKelvin) / 800) + 56;
  const lclPressure = pressure * Math.pow(lclKelvin / temperatureKelvin, SPECIFIC_HEAT_DRY_AIR / GAS_CONSTANT_DRY_AIR);
  return Number.isFinite(lclPressure) && lclPressure > 0
    ? { temperature: lclKelvin - KELVIN_OFFSET, pressure: lclPressure }
    : null;
}

function interpolateMoistAdiabat(profile, pressure) {
  for (let index = 0; index < profile.length - 1; index += 1) {
    const lower = profile[index];
    const upper = profile[index + 1];
    if (lower.pressure >= pressure && upper.pressure <= pressure) {
      const fraction = (pressure - upper.pressure) / (lower.pressure - upper.pressure);
      return upper.temperature + (lower.temperature - upper.temperature) * fraction;
    }
  }
  return profile.find((row) => Math.abs(row.pressure - pressure) < 0.1)?.temperature ?? null;
}

function parcelProfile(profile, source) {
  const lcl = calculateLcl(source.temperature, source.dewPoint, source.pressure);
  if (!lcl) return null;
  const moist = buildMoistAdiabat(lcl.temperature, {
    bottomPressure: lcl.pressure,
    topPressure: Math.max(100, profile.at(-1)?.pressure ?? 100),
    step: 1
  });
  const kappa = GAS_CONSTANT_DRY_AIR / SPECIFIC_HEAT_DRY_AIR;
  return profile.map((row) => {
    const temperature = row.pressure >= lcl.pressure
      ? (source.temperature + KELVIN_OFFSET) * Math.pow(row.pressure / source.pressure, kappa) - KELVIN_OFFSET
      : interpolateMoistAdiabat(moist, row.pressure);
    return { ...row, parcelTemperature: temperature };
  }).filter((row) => Number.isFinite(row.parcelTemperature));
}

function calculateParcelEnergy(profile, source) {
  const path = parcelProfile(profile, source);
  if (!path || path.length < 2) return { cape: null, cin: null };
  const lclPressure = calculateLcl(source.temperature, source.dewPoint, source.pressure)?.pressure ?? 0;
  let cape = 0;
  let cin = 0;
  let reachedFreeConvection = false;
  let usableLayers = 0;
  for (let index = 0; index < path.length - 1; index += 1) {
    const lower = path[index];
    const upper = path[index + 1];
    if (![lower.height, upper.height, lower.dewPoint, upper.dewPoint].every(Number.isFinite)) continue;
    const virtualTemperature = (temperature, dewPoint, pressure) => {
      const mixingRatio = mixingRatioFromDewPoint(dewPoint, pressure);
      return (temperature + KELVIN_OFFSET) * (1 + 0.61 * mixingRatio);
    };
    const lowerEnvTv = virtualTemperature(lower.temperature, lower.dewPoint, lower.pressure);
    const upperEnvTv = virtualTemperature(upper.temperature, upper.dewPoint, upper.pressure);
    const lowerParcelDewPoint = lower.pressure >= lclPressure
      ? source.dewPoint
      : lower.parcelTemperature;
    const upperParcelDewPoint = upper.pressure >= lclPressure
      ? source.dewPoint
      : upper.parcelTemperature;
    const lowerParcelTv = virtualTemperature(lower.parcelTemperature, lowerParcelDewPoint, lower.pressure);
    const upperParcelTv = virtualTemperature(upper.parcelTemperature, upperParcelDewPoint, upper.pressure);
    const lowerBuoyancy = 9.80665 * (lowerParcelTv - lowerEnvTv) / lowerEnvTv;
    const upperBuoyancy = 9.80665 * (upperParcelTv - upperEnvTv) / upperEnvTv;
    const layerEnergy = ((lowerBuoyancy + upperBuoyancy) / 2) * (upper.height - lower.height);
    if (!Number.isFinite(layerEnergy) || upper.height <= lower.height) continue;
    usableLayers += 1;
    if (layerEnergy > 0) {
      cape += layerEnergy;
      reachedFreeConvection = true;
    } else if (!reachedFreeConvection) {
      cin += layerEnergy;
    }
  }
  return usableLayers >= 4 ? { cape, cin } : { cape: null, cin: null };
}

/**
 * Produces transparent, observation-only guidance for the sounding.  These
 * values are diagnostic aids, not a forecast or a warning decision.
 */
export function analyzeUpperAirProfile(profile) {
  const summary = summarizeUpperAirProfile(profile);
  if (!summary?.surface) return null;
  const { surface, at850, at500, freezingHeight } = summary;
  const surfaceDewPointDepression = Number.isFinite(surface.dewPoint)
    ? Math.max(0, surface.temperature - surface.dewPoint)
    : null;
  const estimatedCloudBase = Number.isFinite(surfaceDewPointDepression)
    ? surface.height + surfaceDewPointDepression * 125
    : null;
  const lapseRate = at500 && Number.isFinite(at500.height) && at500.height > surface.height
    ? ((surface.temperature - at500.temperature) / (at500.height - surface.height)) * 1000
    : null;
  const dewPointDepression850 = at850 && Number.isFinite(at850.dewPoint)
    ? Math.max(0, at850.temperature - at850.dewPoint)
    : null;
  const at700 = interpolateAtPressure(profile, 700);
  const totalTotalsIndex = at850 && at500 && Number.isFinite(at850.dewPoint)
    ? at850.temperature + at850.dewPoint - 2 * at500.temperature
    : null;
  const kIndex = at850 && at700 && at500 && Number.isFinite(at850.dewPoint) && Number.isFinite(at700.dewPoint)
    ? (at850.temperature - at500.temperature) + at850.dewPoint - (at700.temperature - at700.dewPoint)
    : null;
  const diagnosticProfile = at500
    ? [...profile, { ...at500, pressure: 500 }].sort((a, b) => b.pressure - a.pressure)
    : profile;
  const showalterParcel = at850 && Number.isFinite(at850.dewPoint)
    ? parcelProfile(diagnosticProfile, { ...at850, pressure: 850 })?.find((row) => row.pressure === 500)?.parcelTemperature
    : null;
  const surfaceParcel = Number.isFinite(surface.dewPoint)
    ? { ...surface, pressure: surface.pressure }
    : null;
  const surfaceParcelPath = surfaceParcel ? parcelProfile(diagnosticProfile, surfaceParcel) : null;
  const surfaceParcel500 = surfaceParcelPath?.find((row) => row.pressure === 500)?.parcelTemperature;
  const parcelEnergy = surfaceParcel ? calculateParcelEnergy(profile, surfaceParcel) : { cape: null, cin: null };
  const windRows = profile.filter((row) => Number.isFinite(row.windSpeed) || (Number.isFinite(row.uWind) && Number.isFinite(row.vWind)));
  const strongestWind = windRows.reduce((strongest, row) => {
    const speed = Number.isFinite(row.windSpeed) ? row.windSpeed : Math.hypot(row.uWind, row.vWind);
    return !strongest || speed > strongest.speed ? { row, speed } : strongest;
  }, null);
  const top = profile.at(-1);
  return {
    surface,
    at850,
    freezingHeight,
    surfaceDewPointDepression,
    estimatedCloudBase,
    lapseRate,
    dewPointDepression850,
    totalTotalsIndex,
    kIndex,
    showalterIndex: Number.isFinite(showalterParcel) && at500 ? at500.temperature - showalterParcel : null,
    liftedIndex: Number.isFinite(surfaceParcel500) && at500 ? at500.temperature - surfaceParcel500 : null,
    cape: parcelEnergy.cape,
    cin: parcelEnergy.cin,
    windLevelCount: windRows.length,
    strongestWindSpeed: strongestWind?.speed ?? null,
    strongestWindHeight: strongestWind?.row.height ?? null,
    windShear0to1km: windShear(profile, 1000),
    windShear0to6km: windShear(profile, 6000),
    inversion: findLowLevelInversion(profile),
    observedLevelCount: profile.length,
    topPressure: top?.pressure ?? null,
    topHeight: top?.height ?? null
  };
}

export function formatJmaObservationTime(date, hour) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date ?? "");
  if (!match) return "観測時刻不明";
  return `${match[1]}年${Number(match[2])}月${Number(match[3])}日 ${String(hour).padStart(2, "0")}時（日本時間）`;
}
