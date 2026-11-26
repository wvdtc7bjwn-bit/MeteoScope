// Same public station inputs, land decisions, clocks and frozen coefficients on both engines.
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {prepareTemperatureAuditFrame,auditTemperatureFrame,frameSummary,summarizeAudit} from "./audit-local-temperature.mjs";
import {TEMPERATURE_ESTIMATION} from "../src/location/temperatureEstimationPolicy.js";
import {createValidationRun,saveValidationRun,sha256} from "./temperatureValidationRun.mjs";
const root=new URL("../",import.meta.url),run=await createValidationRun("quality");
const baseline=process.argv.find(x=>x.startsWith("--baseline="))?.slice(11)??"179550649178dd4a0e84c22ede12496d0ebb2ee6";
const files=["src/location/temperatureEstimation.js","src/location/temperatureEstimationPolicy.js","src/location/environmentProfile.js","src/location/distance.js","src/utils/jstDateTime.js"];
const beforeCode={};
for(const file of files) {
  const bytes=execFileSync("git",["show",`${baseline}:${file}`],{cwd:root});
  const target=new URL(`before/${file}`,run);await mkdir(new URL("./",target),{recursive:true});await writeFile(target,bytes);beforeCode[file]=sha256(bytes);
}
const {estimateLocalTemperature:beforeEstimator}=await import(new URL("before/src/location/temperatureEstimation.js",run));
const {TEMPERATURE_ESTIMATION:beforePolicy}=await import(new URL("before/src/location/temperatureEstimationPolicy.js",run));
// The model policy must be the current starting model, not coefficients tuned to this review.
for(const [key,value] of Object.entries(beforePolicy))if(TEMPERATURE_ESTIMATION[key]!==value)throw Error(`Model policy changed: ${key}`);
const inputFile=".cache/temperature-audit/inputs.json",inputs=JSON.parse(await readFile(new URL(inputFile,root),"utf8"));
const paths=new Map(inputs.landPaths);
const connection=(a,b)=>paths.get([a.coordinates.join(","),b.coordinates.join(",")].sort().join("|"))??null;
const config={...beforePolicy},before=[],after=[];
for(const frame of inputs.frames) {
  const prepared=prepareTemperatureAuditFrame({...frame,connection});
  before.push(...auditTemperatureFrame({prepared,config,estimator:beforeEstimator}));
  after.push(...auditTemperatureFrame({prepared,config}));
  console.log(`Compared ${frame.observationTime}: ${prepared.length} targets`);
}
const old=new Map(before.map(row=>[`${row.time}/${row.stationId}`,row]));
const common=after.filter(row=>row.kind==="estimated"&&old.get(`${row.time}/${row.stationId}`).kind==="estimated");
const countChanges=key=>Object.fromEntries([...new Set(after.map(row=>`${old.get(`${row.time}/${row.stationId}`)[key]} -> ${row[key]}`))]
  .map(keyValue=>[keyValue,after.filter(row=>`${old.get(`${row.time}/${row.stationId}`)[key]} -> ${row[key]}`===keyValue).length]));
const flags=rows=>Object.fromEntries([...new Set(rows.flatMap(r=>r.flags))].map(flag=>[flag,rows.filter(r=>r.flags.includes(flag)).length]));
const pairedBefore=common.map(row=>old.get(`${row.time}/${row.stationId}`));
const result={baseline:{commit:baseline,codeHashes:beforeCode,config},candidate:{config:{...TEMPERATURE_ESTIMATION}},
  design:"Paired outer station LOO; target excluded before selection, estimation and fallback. Exact same cached public frames, station altitude, environment profiles, land-route decisions and freshness clocks. No GPS inputs.",
  inputSource:JSON.parse(await readFile(new URL(".cache/temperature-audit/source-manifest.json",root),"utf8")),
  historicalSource:JSON.parse(await readFile(new URL(".cache/temperature-validation/manifest.json",root),"utf8")),
  observationURLs:inputs.frames.map(frame=>`https://www.jma.go.jp/bosai/amedas/data/map/${frame.observationTime}.json`),
  inputHashes:inputs.codeHashes,frames:inputs.frames.map(frame=>({observationTime:frame.observationTime,evaluationTime:frame.now})),
  before:frameSummary(before),after:frameSummary(after),
  pairedEstimates:{before:summarizeAudit(pairedBefore),after:summarizeAudit(common),count:common.length,
    valuesChanged:common.filter((row,i)=>Math.abs(row.predictedC-pairedBefore[i].predictedC)>1e-9).length,
    stationSelectionChanged:common.filter((row,i)=>JSON.stringify(row.stations)!==JSON.stringify(pairedBefore[i].stations)).length},
  transitions:{kind:countChanges("kind"),confidence:countChanges("confidence")},qualityFlags:{before:flags(before),after:flags(after)},
  limitations:["One cached late-autumn period, previously used during development; not independent seasonal validation.","Public station altitude replaces target DEM/GPS. Accuracy-only GPS changes are tested separately, not evaluated as temperature errors.","Reviewer-provided 20:10 snapshot is not in this cache; its numbers are not claimed to be reproduced.","A stricter quality gate may increase observed fallbacks; aggregate error changes are not a model improvement claim."]};
const directory=await saveValidationRun("quality",result,{directory:run,inputFiles:[inputFile,".cache/temperature-audit/source-manifest.json",".cache/temperature-audit/stations.json",".cache/temperature-validation/stations.json",".cache/temperature-validation/manifest.json",...inputs.frames.map(f=>`.cache/${f.observationTime===result.inputSource.stamp?"temperature-audit":"temperature-validation"}/${f.observationTime}.json`)]});
await writeFile(new URL("predictions.json",directory),JSON.stringify({before,after}));
console.log(JSON.stringify({before:result.before,after:result.after,paired:result.pairedEstimates,transitions:result.transitions}));
