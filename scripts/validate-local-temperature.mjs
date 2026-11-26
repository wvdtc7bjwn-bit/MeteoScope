import {validationConfig,saveValidationRun} from "./temperatureValidationRun.mjs";
// Public station data only. No GPS, DEM requests, Cloudflare writes, or parameter auto-tuning.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { buildAmedasPoints } from "../src/jma/amedas.js";
import { estimateLocalTemperature, temperatureErrorMetrics } from "../src/location/temperatureEstimation.js";

const cache = new URL("../.cache/temperature-validation/", import.meta.url);
await mkdir(cache, { recursive: true });
async function json(url, file) {
  try { return JSON.parse(await readFile(new URL(file, cache), "utf8")); }
  catch {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw Error(`${response.status}: ${url}`);
    const value = await response.json(); await writeFile(new URL(file, cache), JSON.stringify(value)); return value;
  }
}
const base = "https://www.jma.go.jp/bosai/amedas";
const stations = await json(`${base}/const/amedastable.json`, "stations.json");
// Use a recorded timestamp for reproducibility. --latest explicitly refreshes only the timestamp.
let recorded;
try { recorded = JSON.parse(await readFile(new URL("manifest.json", cache), "utf8")); } catch { /* first run */ }
if (!recorded || process.argv.includes("--latest")) {
  const response = await fetch(`${base}/data/latest_time.txt`, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw Error(`latest_time: ${response.status}`);
  recorded = { latest: (await response.text()).trim(), retrievedAt: new Date().toISOString() };
  await writeFile(new URL("manifest.json", cache), JSON.stringify(recorded));
}
const latest = Date.parse(recorded.latest);
const stamp = timestamp => new Date(timestamp + 9 * 3600000).toISOString().slice(0,19).replace(/\D/g, "");
const snapshots = [];
for (let offset = 21; offset >= 0; offset -= 3) {
  const timestamp = latest - offset * 3600000, time = stamp(timestamp);
  try {
    const raw = await json(`${base}/data/map/${time}.json`, `${time}.json`);
    const points = buildAmedasPoints(raw, stations, raw, time).filter(p => typeof p.values.temperature === "number" && p.temperatureQuality === 0 && p.elevation != null);
    snapshots.push({ time, timestamp, points });
    console.log(`Loaded ${time}: ${points.length} valid stations`);
  } catch (error) { console.error(`Snapshot unavailable: ${time}: ${error.message}`); }
}
if (snapshots.length < 2) throw Error("At least two snapshots are required for time-separated evaluation");
const methods = { nearest: "nearest", idw: "idw", fixed: "fixed", dynamic: "dynamic" };
function evaluate(frames, variants) {
  const result = {};
  for (const [label, { method, config = {} }] of Object.entries(variants)) {
    const errors = [], estimateErrors = [], fallbackErrors = [], byGroup = {}, adopted = {}, frameMetrics = [];
    let total = 0, estimated = 0;
    for (const frame of frames) {
      const local = [], groupErrors = {}, groupTotals = {};
      const hour = Number(frame.time.slice(8,10));
      for (const target of frame.points) {
        const prediction = estimateLocalTemperature({ points: frame.points.filter(p => p.id !== target.id),
          coordinates: target.coordinates, elevation: target.elevation, observationTime: frame.time,
          now: frame.timestamp + 5 * 60000, method, config:validationConfig({heightSimilarityScaleM:0,environmentStrength:0,...config}) });
        total++;
        adopted[prediction.method] = (adopted[prediction.method] ?? 0) + 1;
        if (prediction.kind === "estimated") estimated++;
        const groups = [hour >= 6 && hour < 18 ? "06-18_JST" : "18-06_JST",
          target.elevation < 200 ? "elevation_below_200m" : target.elevation < 800 ? "elevation_200-800m" : "elevation_800m_plus"];
        for (const group of groups) groupTotals[group] = (groupTotals[group] ?? 0) + 1;
        if (prediction.value == null) continue;
        const error = prediction.value - target.values.temperature;
        errors.push(error); local.push(error);
        (prediction.kind === "estimated" ? estimateErrors : fallbackErrors).push(error);
        for (const group of groups) (groupErrors[group] ??= []).push(error);
      }
      frameMetrics.push({ time: frame.time, ...temperatureErrorMetrics(local, frame.points.length) });
      for (const [group, count] of Object.entries(groupTotals)) {
        const aggregate = byGroup[group] ??= { errors: [], total: 0 };
        aggregate.errors.push(...(groupErrors[group] ?? [])); aggregate.total += count;
      }
    }
    result[label] = { ...temperatureErrorMetrics(errors, total), estimatedCoverage: estimated / total, adopted,
      estimatesOnly: temperatureErrorMetrics(estimateErrors, total), observedFallbackOnly: temperatureErrorMetrics(fallbackErrors, total),
      byGroup: Object.fromEntries(Object.entries(byGroup).map(([k, v]) => [k, temperatureErrorMetrics(v.errors, v.total)])), frames: frameMetrics };
    console.log(`${label}: MAE ${result[label].mae?.toFixed(3)}, RMSE ${result[label].rmse?.toFixed(3)}, estimated ${(100 * estimated / total).toFixed(1)}%`);
  }
  return result;
}
const split = Math.floor(snapshots.length / 2), calibration = snapshots.slice(0, split), heldOut = snapshots.slice(split);
const comparison = Object.fromEntries(Object.entries(methods).map(([key, method]) => [key, { method }]));
const sensitivity = {
  defaults: { method: "fixed" },
  power1: { method: "fixed", config: { power: 1 } }, power3: { method: "fixed", config: { power: 3 } },
  radius30: { method: "fixed", config: { radiusKm: 30 } }, radius75: { method: "fixed", config: { radiusKm: 75 } },
  stations4: { method: "fixed", config: { maxStations: 4 } },
  lapse004: { method: "fixed", config: { lapseRate: .004 } }, lapse009: { method: "fixed", config: { lapseRate: .009 } }
};
const output = { manifest: recorded, defaults: validationConfig({heightSimilarityScaleM:0,environmentStrength:0}),comparisonConfigs:Object.fromEntries(Object.entries(comparison).map(([name,v])=>[name,{...v,config:validationConfig({heightSimilarityScaleM:0,environmentStrength:0,...v.config})}])),
  sensitivityConfigs:Object.fromEntries(Object.entries(sensitivity).map(([name,v])=>[name,{...v,config:validationConfig({heightSimilarityScaleM:0,environmentStrength:0,...v.config})}])),
  design: "Outer leave-one-station-out; dynamic model has inner LOO; earlier/later time split. Defaults not tuned. Reported errors include explicitly labelled nearest fallback. No water screen in this station-only benchmark.",
  limitations: ["One late-autumn 24-hour period; temporal frames are correlated.", "No independent seasonal evaluation or verified urban/basin/coastal labels.", "Station altitude is the LOO target altitude; this does not measure DEM or GPS errors.", "Municipal land-screen effects require separate field validation."],
  calibrationTimes: calibration.map(f => f.time), evaluationTimes: heldOut.map(f => f.time),
  calibration: evaluate(calibration, comparison), evaluation: evaluate(heldOut, comparison), sensitivity: evaluate(calibration, sensitivity) };
await saveValidationRun("local",output,{inputFiles:[".cache/temperature-validation/manifest.json",".cache/temperature-validation/stations.json",...snapshots.map(f=>`.cache/temperature-validation/${f.time}.json`)]});
