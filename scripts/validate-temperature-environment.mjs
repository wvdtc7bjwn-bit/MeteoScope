import {validationConfig,saveValidationRun} from "./temperatureValidationRun.mjs";
import { readFile, writeFile } from "node:fs/promises";
import { buildAmedasPoints } from "../src/jma/amedas.js";
import { estimateLocalTemperature, temperatureErrorMetrics } from "../src/location/temperatureEstimation.js";
import { decodeEnvironmentTile, environmentMeshPosition, sampleEnvironmentTile } from "../src/location/environmentMesh.js";
const root = new URL("../",import.meta.url), cache = new URL(".cache/temperature-validation/",root);
const original = JSON.parse(await readFile(new URL("docs/data/local-temperature-validation.json",root),"utf8"));
const stations = JSON.parse(await readFile(new URL("stations.json",cache),"utf8"));
const tiles = new Map();
async function profile(coordinates) {
  const position = environmentMeshPosition(coordinates); if(!position)return null;
  if(!tiles.has(position.primary)) {
    try { const b=await readFile(new URL(`public/data/temperature-environment/v1/${position.primary}.bin`,root));tiles.set(position.primary,decodeEnvironmentTile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),position.primary)); }
    catch { tiles.set(position.primary,null); }
  }
  return sampleEnvironmentTile(tiles.get(position.primary),position);
}
async function frames(times) {
  return Promise.all(times.map(async time=>{
    const raw=JSON.parse(await readFile(new URL(`${time}.json`,cache),"utf8"));
    const points=buildAmedasPoints(raw,stations,raw,time).filter(p=>typeof p.values.temperature==="number"&&p.temperatureQuality===0&&p.elevation!=null);
    for(const p of points)p.environment=await profile(p.coordinates);
    const now=Date.parse(`${time.slice(0,4)}-${time.slice(4,6)}-${time.slice(6,8)}T${time.slice(8,10)}:${time.slice(10,12)}:00+09:00`)+5*60000;
    return {time,now,points};
  }));
}
function evaluate(frames,config) {
  const errors=[],groups={},estimatedErrors=[];let total=0,adjusted=0;
  for(const frame of frames)for(const target of frame.points) {
    total++;
    const result=estimateLocalTemperature({points:frame.points.filter(p=>p.id!==target.id),coordinates:target.coordinates,elevation:target.elevation,
      observationTime:frame.time,now:frame.now,method:"environment",environment:target.environment,
      config:validationConfig({heightSimilarityScaleM:0,directionalReachRatio:0,...config})});
    if(result.value==null)continue;
    const error=result.value-target.values.temperature;errors.push(error);
    if(result.environmentAdjusted)adjusted++;
    if(result.kind==="estimated")estimatedErrors.push(error);
    const labels=[target.elevation<200?"below200m":target.elevation<800?"200to800m":"above800m"];
    if(target.environment?.urban>=.3)labels.push("urban30plus");
    if(target.environment?.forest>=.5)labels.push("forest50plus");
    if(target.environment?.sea>=.1)labels.push("coastalMesh");
    for(const label of labels)(groups[label]??=[]).push(error);
  }
  const sorted=errors.map(Math.abs).sort((a,b)=>a-b);
  return {...temperatureErrorMetrics(errors,total),p95AbsoluteError:sorted[Math.ceil(sorted.length*.95)-1],adjusted,estimatesOnly:temperatureErrorMetrics(estimatedErrors,total),
    groups:Object.fromEntries(Object.entries(groups).map(([k,v])=>[k,temperatureErrorMetrics(v)]))};
}
const calibration=await frames(original.calibrationTimes),heldOut=await frames(original.evaluationTimes);
const configurations=[{name:"baseline",environmentStrength:0}, ...[.5,1,2,4].map(environmentStrength=>({name:`combined-${environmentStrength}`,environmentStrength,environmentLandWeight:1,environmentTerrainWeight:.5})),
  {name:"land-only",environmentStrength:1,environmentLandWeight:1,environmentTerrainWeight:0}, {name:"terrain-only",environmentStrength:1,environmentLandWeight:0,environmentTerrainWeight:1}];
const trials=configurations.map(config=>{const metrics=evaluate(calibration,config);console.log(`Calibration ${config.name}: ${metrics.mae.toFixed(4)} / ${metrics.rmse.toFixed(4)}`);return {config,metrics};});
const baseline=trials[0].metrics;
const eligible=trials.slice(1).filter(t=>t.config.name.startsWith("combined-")&&t.metrics.mae<baseline.mae&&t.metrics.rmse<=baseline.rmse);
const selected=eligible.sort((a,b)=>a.metrics.mae-b.metrics.mae)[0]??trials[0];
// Select using earlier times only, then evaluate that frozen candidate on later times once.
const evaluation={baseline:evaluate(heldOut,configurations[0]),candidate:evaluate(heldOut,selected.config)};
const b=evaluation.baseline,c=evaluation.candidate;
const accepted=selected.config.environmentStrength>0&&c.mae<b.mae&&c.rmse<=b.rmse&&c.p95AbsoluteError<=b.p95AbsoluteError*1.02
  &&Object.entries(c.groups).every(([k,v])=>v.count<50||v.mae<=b.groups[k].mae*1.05);
const output={schema:1,calibrationTimes:original.calibrationTimes,evaluationTimes:original.evaluationTimes,
  method:"Outer station LOO; environment data are static predictors, no target temperatures. Earlier times select candidate; later times only accept/reject it.",
  limitations:["One autumn 21-hour period; no seasonal guarantee.","No municipal water-route screening in this station-only benchmark.","Land classifications are approximate, with 2016/2021 coverage years; terrain source is 2011, based on 2009 DEM.","Urban/forest/coastal groups describe the source mesh, not a validated local-climate classification."],
  trials:trials.map(t=>({...t,config:validationConfig({heightSimilarityScaleM:0,...t.config})})),selectedConfig:validationConfig({heightSimilarityScaleM:0,...selected.config}),evaluation,accepted};
await saveValidationRun("environment",output,{inputFiles:[".cache/temperature-validation/stations.json",...original.calibrationTimes.concat(original.evaluationTimes).map(t=>`.cache/temperature-validation/${t}.json`)]});
console.log(JSON.stringify({selected:selected.config,accepted,evaluation}));
