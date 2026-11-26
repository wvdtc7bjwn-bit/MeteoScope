// Offline station LOO. Raw observations and experiment outputs stay outside the bundle.
import { readFile, writeFile } from "node:fs/promises";
import { prepareTemperatureAuditFrame, summarizeAudit } from "./audit-local-temperature.mjs";
import { estimateLocalTemperature } from "../src/location/temperatureEstimation.js";
import { temperatureSnapshot } from "../src/location/temperatureWeather.js";
import { candidateWeatherContext, applyWeatherCandidate } from "./temperatureWeatherCandidates.mjs";
import { buildAmedasPoints } from "../src/jma/amedas.js";
import { createValidationRun, saveValidationRun, sha256 } from "./temperatureValidationRun.mjs";

const root = new URL("../", import.meta.url), study = new URL(".cache/temperature-weather-study/", root);
const { estimateLocalTemperature: baseline } = await import(new URL("baseline/src/location/temperatureEstimation.js", study));
const { TEMPERATURE_ESTIMATION: baselinePolicy } = await import(new URL("baseline/src/location/temperatureEstimationPolicy.js", study));
const stage = process.argv.includes("--evaluate") ? "evaluation" : "calibration";
const selectionFile = "selection-weather-v2.json";
const inputBytes = await readFile(new URL(".cache/temperature-audit/inputs.json", root));
const inputs = JSON.parse(inputBytes), landPaths = new Map(inputs.landPaths);
const connection = (a, b) => landPaths.get([a.coordinates.join(","), b.coordinates.join(",")].sort().join("|")) ?? null;
const table = JSON.parse(await readFile(new URL(".cache/temperature-audit/stations.json", root), "utf8"));
const parseTime = stamp => Date.parse(`${stamp.slice(0,4)}-${stamp.slice(4,6)}-${stamp.slice(6,8)}T${stamp.slice(8,10)}:${stamp.slice(10,12)}:${stamp.slice(12,14)}+09:00`);
const key = point => `${point.id}/${point.coordinates.join(",")}/${point.elevation}`;
const profiles = new Map(inputs.frames.flatMap(frame => frame.points.map(point => [key(point), point.environment])));
const sourceHashes = {};
const records = [], frames = stage === "calibration" ? inputs.frames : await evaluationFrames();
const parameters = stage === "calibration" ? [0,.5,1].flatMap(night => [0,.25,.5].flatMap(wind => [0,.5,1].map(trend => ({
  weatherEnabled: true, weatherNightBlend: night, weatherWindStrength: wind, weatherTrendStrength: trend
})))) : [JSON.parse(await readFile(new URL(selectionFile, study), "utf8")).config];
const policyFor = config => ({ ...baselinePolicy, ...config });
const nameFor = config => `${config.weatherNightBlend}/${config.weatherWindStrength}/${config.weatherTrendStrength}`;
const candidateRecords = new Map(parameters.map(config => [nameFor(config), []]));
for (const frame of frames) {
  const historyTime = frame.observationTimeMs ?? parseTime(frame.observationTime);
  const historyStamp = new Date(historyTime - 30*60000 + 9*3600000).toISOString().replaceAll(/[-:T.Z]/g, "").slice(0,14);
  const rawBytes = await readFile(new URL(`${historyStamp}.json`, study));
  sourceHashes[historyStamp] = sha256(rawBytes);
  const history = [temperatureSnapshot(buildAmedasPoints(JSON.parse(rawBytes), table, null, historyStamp), parseTime(historyStamp))];
  const prepared = prepareTemperatureAuditFrame({ ...frame, connection });
  for (const { target, options } of prepared) {
    const heldHistory = history.map(frame => ({ ...frame, values: new Map([...frame.values].filter(([id]) => id !== String(target.id))) }));
    const reference = baseline({ ...options, config: baselinePolicy });
    const record = result => ({ time: frame.observationTime, id: String(target.id), kind: result.kind,
      errorC: result.value == null ? null : result.value - target.value, flags: result.flags,
      weatherAdjusted: result.weatherAdjusted === true });
    records.push(record(reference));
    let context, entries;
    if (reference.kind === "estimated") {
      const points = new Map(options.points.map(point => [String(point.id), point]));
      entries = reference.stations.map(station => ({ point: points.get(String(station.id)), weight: station.weight, corrected: station.corrected }));
      context = candidateWeatherContext({ entries, coordinates: target.coordinates, elevation: target.elevation,
        environment: reference.environmentAdjusted ? target.environment : null, timeMs: historyTime, history: heldHistory });
    }
    for (const config of parameters) {
      let result;
      if (stage === "evaluation") {
        result = estimateLocalTemperature({ ...options, history: heldHistory, config: policyFor(config) });
        if (result.stations?.some(point => String(point.id) === String(target.id))) throw Error("Target leaked into estimate");
      } else if (!entries) result = reference;
      else {
        const adjusted = applyWeatherCandidate(entries, context, target.elevation, reference.lapseRate, config);
        const weight = adjusted.reduce((sum, entry) => sum + entry.weight, 0);
        const value = adjusted.reduce((sum, entry) => sum + entry.weight * entry.corrected, 0) / weight;
        const spread = Math.sqrt(adjusted.reduce((sum, entry) => sum + entry.weight * (entry.corrected - value)**2, 0) / weight);
        result = spread > baselinePolicy.maxSpreadC
          ? { ...reference, kind: "observed", value: reference.nearest.value }
          : { ...reference, value, weatherAdjusted: Math.abs(value - reference.value) > 1e-10 };
      }
      candidateRecords.get(nameFor(config)).push(record(result));
    }
  }
  console.log(`${stage}: ${frame.observationTime}, ${prepared.length} held-out targets`);
}
const estimatedIds = new Set(records.filter(row => row.kind === "estimated").map(row => `${row.time}/${row.id}`));
const summarize = rows => ({ all: summarizeAudit(rows), estimates: summarizeAudit(rows.filter(row => estimatedIds.has(`${row.time}/${row.id}`))),
  fallback: rows.filter(row => row.kind === "observed").length, unavailable: rows.filter(row => row.kind === "unavailable").length,
  changed: rows.filter(row => row.weatherAdjusted).length,
  frames: frames.map(frame => ({ time: frame.observationTime, ...summarizeAudit(rows.filter(row => row.time === frame.observationTime)) })) });
const reference = summarize(records);
const candidates = parameters.map(config => ({ config, ...summarize(candidateRecords.get(nameFor(config))) }));
const acceptable = candidate => candidate.all.mae < reference.all.mae && candidate.all.rmse < reference.all.rmse
  && candidate.estimates.maxAbsoluteError <= reference.estimates.maxAbsoluteError + 1e-9
  && candidate.frames.every((frame, i) => frame.mae <= reference.frames[i].mae + .03);
const ranked = candidates.filter(acceptable).sort((a,b) => a.all.mae - b.all.mae);
const result = { stage, inputHash: sha256(inputBytes), sourceHashes, baselinePolicy, reference, candidates,
  selectionRule: "Lower MAE and RMSE, no larger maximum error among baseline estimates, no per-frame MAE degradation above 0.03C; then lowest calibration MAE. Evaluation is not used for coefficient selection.",
  best: ranked[0] ?? null,
  limitations: ["Single late-autumn weather episode; no independent seasonal accuracy guarantee.",
    "All held-out station temperature and wind observations are excluded, including history. Catalogue height substitutes for target DEM.",
    "Calibration reweights frozen baseline contributors; evaluation runs the full application estimator including fallback gates.",
    "One 30-minute history frame simulates a warmed session. A cold session deliberately retains the baseline until enough observations accumulate."] };
const directory = await saveValidationRun(`weather-${stage}`, result, { inputFiles: ["src/location/temperatureWeather.js", "src/location/temperatureObservation.js", "scripts/temperatureWeatherCandidates.mjs", "scripts/validate-temperature-weather.mjs", ".cache/temperature-weather-study/baseline-hashes.json", ".cache/temperature-audit/inputs.json", ".cache/temperature-weather-study/history-manifest.json", ...(stage === "evaluation" ? [".cache/temperature-weather-study/evaluation-manifest.json"] : [])] });
if (stage === "calibration") {
  if (!result.best) throw Error("No candidate passed calibration gates");
  const selection = { config: result.best.config, selectedAt: new Date().toISOString(), calibrationDirectory: directory.pathname,
    moduleHash: sha256(await readFile(new URL("src/location/temperatureWeather.js", root))) };
  if (process.argv.includes("--replay")) {
    const locked = JSON.parse(await readFile(new URL(selectionFile, study), "utf8"));
    if (JSON.stringify(locked.config) !== JSON.stringify(selection.config)) throw Error("Replay selected different coefficients");
  } else await writeFile(new URL(selectionFile, study), JSON.stringify(selection, null, 2), { flag: "wx" });
}
await writeFile(new URL("paired.json", directory), JSON.stringify({ baseline: records, candidates: Object.fromEntries(candidateRecords) }));
console.log(JSON.stringify({ stage, reference: result.reference, best: result.best, directory: directory.pathname }));

async function evaluationFrames() {
  const manifest = JSON.parse(await readFile(new URL("evaluation-manifest.json", study), "utf8"));
  const selected = JSON.parse(await readFile(new URL(selectionFile, study), "utf8"));
  for (const item of manifest) if (Date.parse(item.acquiredAt) < Date.parse(selected.selectedAt)) throw Error("Evaluation observations acquired before coefficient lock");
  return Promise.all(manifest.filter(item => item.role === "current").map(async item => {
    const bytes = await readFile(new URL(`${item.time}.json`, study));
    if (sha256(bytes) !== item.sha256) throw Error("Evaluation source hash mismatch");
    sourceHashes[item.time] = sha256(bytes);
    const points = buildAmedasPoints(JSON.parse(bytes), table, null, item.time)
      .map(point => ({ ...point, environment: profiles.get(key(point)) ?? null }));
    return { points, observationTime: item.time, now: parseTime(item.time) + 5*60000 };
  }));
}
