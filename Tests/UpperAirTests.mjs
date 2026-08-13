import assert from "node:assert/strict";
import {
  analyzeUpperAirProfile,
  buildMoistAdiabat,
  buildUpperAirProfile,
  calculateDewPoint,
  parseUpperAirTemperatureHumidityHtml,
  saturationVaporPressure,
  summarizeUpperAirProfile,
  temperatureAlongDryAdiabat,
  temperatureForSaturationMixingRatio
} from "../src/jma/upperAir.js";
import { findLatestUpperAirObservation, onRequest } from "../functions/api/upper-air.js";
import {
  buildGfsSubsetUrl,
  getLatestGfsCycle,
  normalizeGfsCoordinates,
  parseGfsPointProfile
} from "../functions/api/gfs-profile.js";

const fixture = `
  <table><tr class="mtx"><th>気圧(hPa)</th></tr>
  <tr class="mtx"><td class="data">1000.0</td><td>12</td><td>25.0</td><td>80</td><td></td></tr>
  <tr class="mtx"><td>850.0</td><td>1450</td><td>15.0</td><td>60</td><td></td></tr>
  <tr class="mtx"><td>700.0</td><td>3010</td><td>5.0</td><td>100</td><td></td></tr>
  <tr class="mtx"><td>500.0</td><td>5650</td><td>-8.0</td><td>70</td><td></td></tr>
  <tr class="mtx"><td>300.0</td><td>9300</td><td>-35.0</td><td>///</td><td></td></tr>
  <tr class="mtx"><td>200.0</td><td>11900</td><td>-50.0</td><td>30</td><td></td></tr>
  <tr class="mtx"><td>100.0</td><td>16000</td><td>-61.0</td><td>20</td><td></td></tr>
  <tr class="mtx"><td>90.0</td><td>17000</td><td>-65.0</td><td>20</td><td></td></tr></table>`;

const rows = parseUpperAirTemperatureHumidityHtml(fixture);
assert.equal(rows.length, 8, "parses observation rows and preserves missing humidity");
assert.equal(rows[0].pressure, 1000);
assert.equal(rows[4].humidity, null);
assert.equal(calculateDewPoint(25, 80)?.toFixed(1), "21.3");
assert.ok(Math.abs(saturationVaporPressure(20) - 23.39) < 0.05, "uses a precise saturation vapor pressure calculation");
assert.ok(Math.abs(temperatureAlongDryAdiabat(20, 1000) - 20) < 0.001, "dry adiabats start at their labelled 1000 hPa temperature");
assert.ok(temperatureAlongDryAdiabat(20, 500) < -30, "dry adiabats cool toward lower pressure");
const mixingRatioTemperature = temperatureForSaturationMixingRatio(10, 1000);
assert.ok(mixingRatioTemperature > 13 && mixingRatioTemperature < 15, "mixing-ratio curve follows saturation physics");
const expectedVaporPressure = (0.01 * 1000) / (0.622 + 0.01);
assert.ok(Math.abs(saturationVaporPressure(mixingRatioTemperature) - expectedVaporPressure) < 0.01, "mixing-ratio curves use the same saturation formula as moist adiabats");
const moistAdiabat = buildMoistAdiabat(20, { step: 1 });
assert.equal(moistAdiabat.length, 901, "moist adiabats are integrated at 1 hPa intervals");
assert.ok(Math.abs(moistAdiabat[0].temperature - 20) < 0.001);
assert.equal(moistAdiabat.at(-1)?.pressure, 100);

const profile = buildUpperAirProfile(rows);
const summary = summarizeUpperAirProfile(profile);
assert.equal(summary.at850?.temperature, 15);
assert.equal(summary.at500?.temperature, -8);
assert.ok(summary.freezingHeight > 3000 && summary.freezingHeight < 5650);
const analysis = analyzeUpperAirProfile(profile);
assert.equal(analysis?.observedLevelCount, 7);
assert.ok(analysis?.estimatedCloudBase > 0, "derives a labelled LCL estimate from surface temperature and dew point");
assert.ok(analysis?.lapseRate > 4 && analysis?.lapseRate < 8, "calculates the observed surface-to-500 hPa lapse rate");
assert.equal(analysis?.topPressure, 100);

const observation = await findLatestUpperAirObservation(
  "47646",
  async () => fixture,
  new Date("2026-08-12T02:00:00Z")
);
assert.equal(observation?.station, "47646");
assert.equal(observation?.date, "2026-08-12");
assert.equal(observation?.hour, 21);

const denied = await onRequest({
  request: new Request("https://meteoscope.pages.dev/api/upper-air?station=47646"),
  env: { NOTIFICATIONS_DB: { prepare() {} } }
});
assert.equal(denied.status, 401, "requires an early access token before requesting JMA data");

assert.deepEqual(normalizeGfsCoordinates("35.66", "139.72"), { latitude: 35.75, longitude: 139.75 }, "uses the nearest 0.25 degree GFS grid point");
assert.deepEqual(normalizeGfsCoordinates("35.6", "-140.1"), { latitude: 35.5, longitude: 220 }, "normalizes western longitudes for GFS");
assert.equal(normalizeGfsCoordinates("north", "139.7"), null, "rejects invalid model coordinates");
assert.deepEqual(getLatestGfsCycle(new Date("2026-08-12T07:00:00Z")), { date: "20260812", hour: "00" }, "waits for a completed GFS cycle");
const gfsUrl = buildGfsSubsetUrl({ latitude: 35.75, longitude: 139.75, cycle: { date: "20260812", hour: "00" } });
assert.match(gfsUrl, /filter_gfs_0p25\.pl/u);
assert.match(gfsUrl, /lev_500_mb=on/u);
assert.match(gfsUrl, /leftlon=139\.75/u);

function makeSimpleGfsMessage({ variableCategory, variableNumber, pressure, value }) {
  const section1 = Uint8Array.from([0, 0, 0, 21, 1, ...Array(16).fill(0)]);
  const section3 = Uint8Array.from([0, 0, 0, 72, 3, ...Array(67).fill(0)]);
  const section4 = Uint8Array.from([0, 0, 0, 34, 4, 0, 0, 0, 0, variableCategory, variableNumber, ...Array(11).fill(0), 100, 0, (pressure >>> 24) & 255, (pressure >>> 16) & 255, (pressure >>> 8) & 255, pressure & 255, ...Array(6).fill(0)]);
  const rawValue = new Uint8Array(4);
  new DataView(rawValue.buffer).setFloat32(0, value, false);
  const section5 = Uint8Array.from([0, 0, 0, 21, 5, 0, 0, 0, 1, 0, 0, ...rawValue, 0, 0, 0, 0, 0, 0]);
  const section6 = Uint8Array.from([0, 0, 0, 6, 6, 255]);
  const section7 = Uint8Array.from([0, 0, 0, 5, 7]);
  const messageLength = 16 + section1.length + section3.length + section4.length + section5.length + section6.length + section7.length + 4;
  const message = new Uint8Array(messageLength);
  message.set([71, 82, 73, 66, 0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, messageLength], 0);
  let offset = 16;
  [section1, section3, section4, section5, section6, section7].forEach((section) => { message.set(section, offset); offset += section.length; });
  message.set([55, 55, 55, 55], offset);
  return message;
}

const gfsFixture = [
  makeSimpleGfsMessage({ variableCategory: 0, variableNumber: 0, pressure: 100000, value: 293.15 }),
  makeSimpleGfsMessage({ variableCategory: 1, variableNumber: 1, pressure: 100000, value: 70 }),
  makeSimpleGfsMessage({ variableCategory: 3, variableNumber: 5, pressure: 100000, value: 110 })
];
const gfsBytes = new Uint8Array(gfsFixture.reduce((sum, message) => sum + message.length, 0));
let gfsOffset = 0;
gfsFixture.forEach((message) => { gfsBytes.set(message, gfsOffset); gfsOffset += message.length; });
const gfsRows = parseGfsPointProfile(gfsBytes.buffer);
assert.equal(gfsRows.length, 1, "decodes selected GFS pressure levels");
assert.ok(Math.abs(gfsRows[0].temperature - 20) < 0.001, "converts GFS temperature from kelvin to Celsius");
assert.equal(gfsRows[0].humidity, 70);
assert.equal(gfsRows[0].height, 110);

console.log("UpperAirTests passed");
