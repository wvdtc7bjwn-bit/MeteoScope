import { fetchJson } from "./jma/jmaClient.js";

export const AMEDAS_TEMPERATURE_NORMAL_PERIOD = "1991-2020";
export const AMEDAS_DAILY_TEMPERATURE_NORMALS_URL = "/data/amedas-daily-high-low-temperature-normals-1991-2020.json?v=2020-5-high-low";

let normalDataRequest = null;

export async function fetchAmedasDailyTemperatureNormals(stationId, date) {
  if (!normalDataRequest) {
    normalDataRequest = fetchJson(AMEDAS_DAILY_TEMPERATURE_NORMALS_URL, {
      ttlMs: 24 * 60 * 60 * 1000,
      cache: "no-store",
      timeoutMs: 6000
    }).catch((error) => {
      normalDataRequest = null;
      throw error;
    });
  }
  const data = await normalDataRequest;
  return getAmedasDailyTemperatureNormals(data, stationId, date);
}

export function getAmedasDailyTemperatureNormals(data, stationId, date) {
  const id = String(stationId ?? "").trim();
  const dateParts = getDateParts(date);
  const values = data?.stations?.[id];
  if (!dateParts || !values || typeof values !== "object") return null;
  const index = (dateParts.month - 1) * 31 + dateParts.day - 1;
  const maximum = readTemperatureNormalValue(values.maximum, index);
  const minimum = readTemperatureNormalValue(values.minimum, index);
  if (![maximum, minimum].some(Number.isFinite)) return null;
  return {
    maximum,
    minimum,
    period: data?.period || AMEDAS_TEMPERATURE_NORMAL_PERIOD
  };
}

function readTemperatureNormalValue(values, index) {
  const value = Number(values?.[index]);
  return Number.isFinite(value) && Math.abs(value) < 9000 ? value / 10 : null;
}

function getDateParts(value) {
  const match = String(value ?? "").match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!match) return null;
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { month, day };
}
