// Re-evaluate frozen, public-station LOO cases with the shipped background module.
// Prepared cases keep their baseline selection/coverage fixed; no parameter tuning.
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {dirname,resolve} from "node:path";
import {createHash} from "node:crypto";
import {applyTemperatureClimate,TEMPERATURE_CLIMATE} from "../src/location/temperatureClimate.js";
import {createTemperatureClimateReader} from "../src/location/temperatureClimateData.js";
import {TEMPERATURE_CLIMATE_DATA_PATH} from "../src/location/temperatureClimateData.generated.js";
import {summarizeAudit} from "./audit-local-temperature.mjs";
const argument=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1];};
const input=argument("--input"),output=argument("--output");
if(!input||!output)throw Error("Usage: --input frozen-cases.json --output summary.json [--reference python-predictions.json]");
const root=new URL("../",import.meta.url),inputBytes=await readFile(resolve(input)),cases=JSON.parse(inputBytes);
const normals=JSON.parse(await readFile(new URL("public/data/amedas-daily-high-low-temperature-normals-1991-2020.json",root),"utf8"));
const metadata=await readFile(new URL(`public/${TEMPERATURE_CLIMATE_DATA_PATH}`,root));
const readClimate=createTemperatureClimateReader({fetcher:async()=>new Response(metadata),loadNormals:async()=>normals});
const referencePath=argument("--reference");
const reference=referencePath?new Map(JSON.parse(await readFile(resolve(referencePath),"utf8")).map(r=>[`${r.time}/${r.id}`,r.predictions["mid-r0.01-s0.5"]])):null;
let maximumImplementationDifferenceC=0;
const records=[];
for(const row of cases){
  const all=await readClimate(row.time),climate={...all,points:all.points.filter(s=>s.id!==row.id)};
  if(climate.points.some(s=>s.id===row.id)||row.contributions.some(s=>s.id===row.id))throw Error("Held station leaked into validation");
  const base={kind:row.kind,method:"fixed-idw",value:row.baseline,stations:row.contributions,flags:row.flags,diagnostics:{}};
  const result=applyTemperatureClimate(base,{coordinates:row.coordinates,elevation:row.elevation,environment:row.environment,climate});
  const expected=reference?.get(`${row.time}/${row.id}`);
  if(expected!=null){const difference=Math.abs(result.value-expected);maximumImplementationDifferenceC=Math.max(difference,maximumImplementationDifferenceC);if(difference>1e-9)throw Error(`Implementation mismatch ${row.time}/${row.id}: ${difference}`);}
  records.push({...row,predicted:result.value,adjusted:Boolean(result.climateAdjusted)});
}
const summarize=rows=>({before:summarizeAudit(rows,r=>r.baseline==null?null:r.baseline-r.observedC),
  after:summarizeAudit(rows,r=>r.predicted==null?null:r.predicted-r.observedC)});
const estimated=records.filter(r=>r.kind==="estimated");
const report={design:"Fixed baseline cases; station historical normal removed as well as current observation; no target-temperature gates or coefficient fitting.",
  configuration:TEMPERATURE_CLIMATE,cases:records.length,estimatedCases:estimated.length,adjusted:records.filter(r=>r.adjusted).length,
  estimates:summarize(estimated),fallback:summarize(records.filter(r=>r.kind==="observed")),
  groups:{heldSpatial:summarize(estimated.filter(r=>r.fold===0)),coastal:summarize(estimated.filter(r=>r.environment?.sea>=.1)),
    mountain:summarize(estimated.filter(r=>r.elevation>=800)),outsideHull:summarize(estimated.filter(r=>r.flags.includes("outside-station-hull")))},
  frames:Object.fromEntries([...new Set(records.map(r=>r.time))].map(t=>[t,summarize(estimated.filter(r=>r.time===t))])),
  individualChanges:{improved:estimated.filter(r=>Math.abs(r.predicted-r.observedC)<Math.abs(r.baseline-r.observedC)-1e-8).length,
    worsened:estimated.filter(r=>Math.abs(r.predicted-r.observedC)>Math.abs(r.baseline-r.observedC)+1e-8).length,
    worsenedOver1C:estimated.filter(r=>Math.abs(r.predicted-r.observedC)-Math.abs(r.baseline-r.observedC)>1).length},
  maximumImplementationDifferenceC:reference?maximumImplementationDifferenceC:null,
  provenance:{createdAt:new Date().toISOString(),inputSha256:createHash("sha256").update(inputBytes).digest("hex"),sources:{}}};
const keys=["mae","rmse","p95AbsoluteError","maxAbsoluteError"];
report.aggregateGate={rule:"No increase in pooled or reserved-spatial/coastal/mountain/outside-hull MAE, RMSE, p95 or maximum; not a guarantee for every case or time.",
  passed:[report.estimates,...Object.values(report.groups)].every(g=>keys.every(k=>g.after[k]<=g.before[k]+1e-9))};
for(const path of ["src/location/temperatureClimate.js","src/location/temperatureClimateData.js","src/location/temperatureEstimation.js",
  "src/location/temperatureEstimationPolicy.js","src/location/localTemperatureController.js","src/location/temperatureClimateData.generated.js",
  "src/amedasTemperatureNormal.js","src/ui/localTemperatureView.js","src/utils/linearSystem.js","scripts/lib/amedasTemperatureNormals.mjs",
  "scripts/build-temperature-climate-data.mjs","scripts/validate-temperature-climate.mjs",`public/${TEMPERATURE_CLIMATE_DATA_PATH}`,
  "public/data/amedas-daily-high-low-temperature-normals-1991-2020.json"]){
  report.provenance.sources[path]=createHash("sha256").update(await readFile(new URL(path,root))).digest("hex");
}
await mkdir(dirname(resolve(output)),{recursive:true});await writeFile(resolve(output),JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify({cases:report.cases,estimated:report.estimatedCases,adjusted:report.adjusted,estimates:report.estimates,individualChanges:report.individualChanges,maximumImplementationDifferenceC:report.maximumImplementationDifferenceC}));
