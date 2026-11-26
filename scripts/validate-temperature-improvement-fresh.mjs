import {validationConfig,saveValidationRun} from "./temperatureValidationRun.mjs";
import {readFile,writeFile} from "node:fs/promises";
import {buildAmedasPoints} from "../src/jma/amedas.js";
import {createEnvironmentReader} from "../src/location/environmentData.js";
import {prepareTemperatureAuditFrame,auditTemperatureFrame,summarizeAudit} from "./audit-local-temperature.mjs";
const root=new URL("../",import.meta.url),directory=new URL(".cache/temperature-audit/",root);
const selection=JSON.parse(await readFile(new URL("improvement-validation.json",directory),"utf8"));
const manifest=JSON.parse(await readFile(new URL("improvement-fresh-manifest.json",directory),"utf8"));
const inputs=JSON.parse(await readFile(new URL("inputs.json",directory),"utf8"));
if(inputs.frames.some(f=>f.observationTime===manifest.stamp))throw Error("Fresh frame already used");
const raw=JSON.parse(await readFile(new URL(`${manifest.stamp}.json`,directory),"utf8"));
const table=JSON.parse(await readFile(new URL("stations.json",directory),"utf8"));
const points=buildAmedasPoints(raw,table,null,manifest.stamp);
// Use the application reader with a local asset transport; no web/GPS/DEM request.
const reader=createEnvironmentReader({maxTiles:176,fetcher:async url=>{
  const match=String(url).match(/\/data\/temperature-environment\/v1\/(\d{4})\.bin$/);
  if(!match)throw Error("Unexpected asset");
  return new Response(await readFile(new URL(`public/data/temperature-environment/v1/${match[1]}.bin`,root)));
}});
const profiles=await reader(points.map(p=>p.coordinates));points.forEach((p,i)=>p.environment=profiles[i]);
const paths=new Map(inputs.landPaths);
const connection=(a,b)=>{
  const key=[a.coordinates.join(","),b.coordinates.join(",")].sort().join("|");
  if(!paths.has(key))throw Error("Uncached public station route; requires production geometry audit");
  return paths.get(key);
};
const prepared=prepareTemperatureAuditFrame({points,connection,observationTime:manifest.stamp,now:Date.parse(manifest.latest)+5*60000});
const before=auditTemperatureFrame({prepared,config:validationConfig(selection.baselineConfig)}),after=auditTemperatureFrame({prepared,config:validationConfig(selection.selectedConfig)});
const metrics=rows=>({...summarizeAudit(rows),estimated:rows.filter(r=>r.kind==="estimated").length,
  estimatesOnly:summarizeAudit(rows.filter(r=>r.kind==="estimated")),fallbackOnly:summarizeAudit(rows.filter(r=>r.kind==="observed"))});
const b=metrics(before),c=metrics(after);
const checks={mae:c.mae<b.mae,rmse:c.rmse<=b.rmse,estimatedMae:c.estimatesOnly.mae<b.estimatesOnly.mae,
  coverage:c.estimated>=b.estimated*.99,maxEstimated:c.estimatesOnly.maxAbsoluteError<=b.estimatesOnly.maxAbsoluteError*1.05};
const result={manifest,baselineConfig:validationConfig(selection.baselineConfig),selectedConfig:validationConfig(selection.selectedConfig),accepted:selection.accepted&&Object.values(checks).every(Boolean),checks,baseline:b,candidate:c,
  limitations:"One subsequent 10-minute snapshot is unseen but strongly correlated; not a seasonal or independent-weather validation."};
const run=await saveValidationRun("fresh",result,{inputFiles:[".cache/temperature-audit/improvement-validation.json",".cache/temperature-audit/inputs.json",".cache/temperature-audit/stations.json",`.cache/temperature-audit/${manifest.stamp}.json`]});
await writeFile(new URL("predictions.json",run),JSON.stringify({before,after})+"\n");
console.log(JSON.stringify(result));
