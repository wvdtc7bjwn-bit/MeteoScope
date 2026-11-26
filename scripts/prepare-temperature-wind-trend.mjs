// Research only: public AMeDAS fields, no numerical forecasts or private locations.
import {readFile,writeFile,mkdir} from "node:fs/promises";
import {createHash} from "node:crypto";
import {execFileSync} from "node:child_process";
import {temperatureObservationTime} from "../src/location/temperatureObservation.js";
const root=new URL("../",import.meta.url),out=new URL(".cache/temperature-wind-trend/",root);
await mkdir(out,{recursive:true});
const evaluation=process.argv.includes("--evaluation");
const protocolPath=new URL("protocol.json",out);
const calibrationTimes=[...new Set([
 ...JSON.parse(await readFile(new URL(".cache/temperature-audit/inputs.json",root),"utf8")).frames.map(f=>f.observationTime),
 "20261126190000","20261126200000","20261126210000",
 ...JSON.parse(await readFile(new URL(".cache/temperature-climate-research/gated-evaluation-manifest.json",root),"utf8")).filter(x=>x.status==="ok").map(x=>x.time),
 ...JSON.parse(await readFile(new URL(".cache/temperature-climate-research/evaluation-manifest.json",root),"utf8")).filter(x=>x.status==="ok").map(x=>x.time)
])].sort();
const evaluationTimes=["20261125012000","20261125052000","20261125072000","20261125112000","20261125172000","20261125232000",
 "20261126012000","20261126052000","20261126072000","20261126092000","20261126132000","20261126172000","20261127002000"];
const shifted=(stamp,minutes)=>new Date(Date.parse(temperatureObservationTime(stamp))+minutes*60000+9*3600000).toISOString().replaceAll(/[-:TZ.]/g,"").slice(0,14);
if(!evaluation){
 const protocol={createdAt:new Date().toISOString(),calibrationTimes,evaluationTimes,
  baseline:"Current uncommitted climate-adjusted estimator, frozen before the wind/trend experiment.",
  holdout:"Remove the target ID from current temperature/wind, both history frames and historical normal catalogue. Regional folds 0 and 3 excluded from fitting and calibration candidate ranking.",
  folds:"(floor(latitude*3)*3+floor(longitude*2)*5)%7; fold 3 includes the publicly diagnosed large-error region and is reserved.",
  historyMinutes:[30,60],features:"Only observed temperature, observed wind and static terrain/land use plus solar geometry. No sunshine/estimated weather, JMA estimated temperature, or NWP products.",
  candidates:"Legacy bounded reweighting; advected previous observations with regional observed warming; ridge residual models with wind-only, trend-only or joint interactions, bounded correction.",
  acceptance:"Lower pooled MAE and RMSE; no pooled, morning, coastal, >=800m, outside-hull or reserved-region p95/max increase. No per-frame MAE or RMSE increase. Missing and fallback cases retain the same coverage. Coefficients locked before acquiring evaluation data.",
  limits:"Only two late-autumn days. History represents a warm app session. Own-history and known-target wind upper-bound diagnostics never count as deployable accuracy."};
 const hashes={};for(const path of ["src/location/temperatureEstimation.js","src/location/temperatureEstimationPolicy.js","src/location/temperatureClimate.js","src/location/temperatureClimateData.js","src/location/temperatureWeather.js","src/jma/amedas.js"])
  hashes[path]=createHash("sha256").update(await readFile(new URL(path,root))).digest("hex");
 protocol.baselineHashes=hashes;protocol.head=execFileSync("git",["rev-parse","HEAD"],{cwd:root}).toString().trim();
 await writeFile(protocolPath,JSON.stringify(protocol,null,2)+"\n",{flag:"wx"});
}
const protocol=JSON.parse(await readFile(protocolPath,"utf8"));
if(evaluation){const selection=JSON.parse(await readFile(new URL("selection.json",out),"utf8"));if(!selection.frozenAt)throw Error("Freeze selection before evaluation");}
const times=evaluation?protocol.evaluationTimes:protocol.calibrationTimes;
const jobs=[...new Set(times.flatMap(t=>[t,...protocol.historyMinutes.map(minutes=>shifted(t,-minutes))]))];
if(evaluation){
 const previous=new Set(protocol.calibrationTimes.flatMap(t=>[t,...protocol.historyMinutes.map(minutes=>shifted(t,-minutes))]));
 if(times.some(t=>previous.has(t)))throw Error("Evaluation current observations overlap calibration inputs");
}
const directories=["temperature-validation","temperature-audit","temperature-weather-study","temperature-climate-research"];
const manifest=[];let i=0;
await Promise.all(Array.from({length:3},async()=>{while(i<jobs.length){const time=jobs[i++],path=new URL(`${time}.json`,out),url=`https://www.jma.go.jp/bosai/amedas/data/map/${time}.json`;let bytes,from="network";
 try{bytes=await readFile(path);from="wind-trend-cache";}catch{}
 if(!bytes&&!evaluation){for(const directory of directories){try{bytes=await readFile(new URL(`.cache/${directory}/${time}.json`,root));from=directory;break;}catch{}}}
 try{if(!bytes){const response=await fetch(url,{signal:AbortSignal.timeout(25000)});if(!response.ok)throw Error(`HTTP ${response.status}`);bytes=Buffer.from(await response.arrayBuffer());}
  const data=JSON.parse(bytes);if(!data||Array.isArray(data)||!Object.keys(data).length)throw Error("Empty map");await writeFile(path,bytes);
  manifest.push({time,url,status:"ok",from,bytes:bytes.length,sha256:createHash("sha256").update(bytes).digest("hex"),acquiredAt:new Date().toISOString()});
 }catch(e){manifest.push({time,url,status:"failed",error:String(e),acquiredAt:new Date().toISOString()});}
}}));
await writeFile(new URL(evaluation?"evaluation-manifest.json":"calibration-manifest.json",out),JSON.stringify(manifest.sort((a,b)=>a.time.localeCompare(b.time)),null,2));
console.log(JSON.stringify({phase:evaluation?"evaluation":"calibration",times:times.length,jobs:jobs.length,failed:manifest.filter(r=>r.status!=="ok"),network:manifest.filter(r=>r.from==="network").length,bytes:manifest.reduce((n,r)=>n+(r.bytes??0),0)}));
