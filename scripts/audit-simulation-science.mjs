import {readFile,writeFile} from "node:fs/promises";
import {execFileSync} from "node:child_process";
import {performance} from "node:perf_hooks";
import {estimateSimulationIntensity} from "../src/simulation/intensityModel.js";
import {prepareEarthquakeSimulation,getSimulationPresetOptions} from "../src/simulation/earthquakeSimulation.js";
import {getSimulationGround} from "../src/simulation/groundModel.js";
import {getDistanceKm} from "../src/location/distance.js";
import {selectJshisGeometry} from "../src/simulation/jshisSourceGeometry.js";
import {classifyIntensity} from "../src/simulation/weSimulatorModel.js";

const read=async name=>JSON.parse(await readFile(new URL(`../${name}`,import.meta.url),"utf8"));
// Pin both baseline modules: committing this work must not silently change the
// comparison target or resolve its imports against the revised implementation.
const baselineCommit="e4331ccda60ece2be22ee91a4d10f8ca1239b6bf";
const baselineDistance=execFileSync("git",["show",`${baselineCommit}:src/simulation/sourceDistance.js`],{encoding:"utf8"});
const baselineDistanceUrl=`data:text/javascript;base64,${Buffer.from(baselineDistance).toString("base64")}`;
const oldSource=execFileSync("git",["show",`${baselineCommit}:src/simulation/intensityModel.js`],{encoding:"utf8"})
  .replace('"./sourceDistance.js"',JSON.stringify(baselineDistanceUrl));
const before=await import(`data:text/javascript;base64,${Buffer.from(oldSource).toString("base64")}`);
const ground=await read(".cache/we-ground-model.json");
const fixture=await read("Tests/fixtures/simulation-shallow-observations.json");
const classify=value=>classifyIntensity(value).label;
function metrics(rows){
  if(!rows.length)return null;
  const thresholds=Object.fromEntries([["5-",4.5],["6-",5.5],["7",6.5]].map(([label,t])=>{
    const hit=rows.filter(r=>r.predicted>=t&&r.observed>=t).length,excess=rows.filter(r=>r.predicted>=t&&r.observed<t).length,omission=rows.filter(r=>r.predicted<t&&r.observed>=t).length;
    return [label,{hit,excess,omission}];
  }));
  return {count:rows.length,mae:rows.reduce((n,r)=>n+Math.abs(r.predicted-r.observed),0)/rows.length,
    bias:rows.reduce((n,r)=>n+r.predicted-r.observed,0)/rows.length,
    predictedMaximum:Math.max(...rows.map(r=>r.predicted)),observedMaximum:Math.max(...rows.map(r=>r.observed)),thresholds};
}
const events=[];
for(const event of fixture.events){
  // Mechanism labels apply to these historical events, never inferred merely
  // from coordinates or applied to arbitrary user epicenters.
  const type=event.id==="201103111446"?"interplate":event.id==="202102132307"?"intraslab":"crustal";
  const rows=event.stations.map(([,lon,lat,observed])=>{
    const point=[lon,lat],distance=getDistanceKm(event.source,point);
    const p={magnitude:event.mw,depthKm:event.depthKm,ruptureDistanceKm:Math.hypot(event.depthKm,distance),
      groundArv:getSimulationGround(ground,point)?.arv??1,pointSource:true,simulationCalibration:true};
    return {observed,distance,before:before.estimateSimulationIntensity(p),afterDefault:estimateSimulationIntensity(p),typed:estimateSimulationIntensity({...p,earthquakeType:type})};
  });
  const summarize=selected=>Object.fromEntries(["before","afterDefault","typed"].map(k=>[k,metrics(selected.map(r=>({observed:r.observed,predicted:r[k]})))]));
  events.push({id:event.id,name:event.name,type,depthKm:event.depthKm,mw:event.mw,split:event.split,
    all:summarize(rows),distanceBins:Object.fromEntries([[0,50],[50,100],[100,200],[200,500],[500,Infinity]].map(([a,b])=>[`${a}-${b}`,summarize(rows.filter(r=>r.distance>=a&&r.distance<b))]))});
}
const catalog=await read("public/data/jma-intensity-stations.json");
const giant=[];
const archive=await read(".private-data/jshis/latest.json");
for(const [model,code,patternCode] of [["kuril-trench","ACHSM","ACH13"],["japan-trench","AJTHK","AJT06"],["nankai-trough","ANNKI","AN177"]]){
  const options=getSimulationPresetOptions(model),entry=archive.entries.find(e=>e.code===code);
  const raw=await read(`.private-data/jshis/objects/${entry.sha256}.geojson`);
  const geometry=selectJshisGeometry(raw,patternCode,model);
  const cases=[];
  for(const [name,input] of [["unchanged-default",options],["line-at-matched-depth",{...options,depthKm:geometry.referenceDepthKm}],
    ["JSHIS-point-distance",{...options,depthKm:geometry.referenceDepthKm,jshisGeometry:geometry}]]){
    const heapBefore=process.memoryUsage().heapUsed,start=performance.now();
    const simulation=await prepareEarthquakeSimulation({...input,groundCorrection:"jshis-1km"},catalog,{groundModel:ground,yieldTask:async()=>{}});
    const values=simulation.stations.map(s=>s.predictedIntensityValue),histogram={};
    for(const v of values){const k=classify(v);histogram[k]=(histogram[k]??0)+1;}
    const strongest=simulation.stations.toSorted((a,b)=>b.predictedIntensityValue-a.predictedIntensityValue).slice(0,3).map(s=>({name:s.name,intensity:s.predictedIntensityValue,arv:s.groundArv,distance:Math.min(...(s.sourceRuptureDistancesKm??[Math.hypot(s.epicentralDistanceKm,input.depthKm)]))}));
    const akkeshis=simulation.stations.filter(s=>s.name.includes("厚岸")).map(s=>({name:s.name,intensity:s.predictedIntensityValue,arv:s.groundArv,distance:s.sourceRuptureDistancesKm?Math.min(...s.sourceRuptureDistancesKm):Math.hypot(s.epicentralDistanceKm,input.depthKm),
      groundIntensityIncrement:s.groundArv?1.72*Math.log10(s.groundArv):0}));
    cases.push({name,mw:input.magnitude,depthKm:input.depthKm,maximum:Math.max(...values),maximumClass:classify(Math.max(...values)),histogram,strongest,akkeshis,
      preparationMs:performance.now()-start,heapDeltaBytes:process.memoryUsage().heapUsed-heapBefore,
      reports:simulation.reports.length,firstReportSec:simulation.reports[0]?.elapsedSec,finalReportSec:simulation.reports.at(-1)?.elapsedSec,
      points:input.jshisGeometry?.points.length??0,waveSources:simulation.sources?.length??null});
  }
  giant.push({model,patternCode,rawSha256:entry.sha256,comparison:"Geometry sensitivity only; J-SHIS probabilistic model is NOT the Cabinet Office SMGA scenario. Mw kept fixed, line-vs-points use equal mean depth.",cases});
}
const report={generatedAt:new Date().toISOString(),baselineCommit,
  limits:fixture.limits,observedEvents:events,giant,officialPointwiseMae:null,
  officialComparisonLimit:"Matching official SMGA/250m pointwise intensities not acquired; municipality maxima/maps cannot yield station MAE. No tuning to intensity 7.",
  performanceLimit:"Node CPU preparation and noisy heap delta, not iPhone GPU FPS or peak memory."};
await writeFile(".cache/simulation-comprehensive-audit.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({events:events.map(e=>({name:e.name,type:e.type,before:e.all.before.mae,after:e.all.afterDefault.mae,typed:e.all.typed.mae})),giant:giant.map(g=>({model:g.model,cases:g.cases.map(c=>({name:c.name,max:c.maximum,class:c.maximumClass,ms:c.preparationMs,reports:c.reports,akkeshis:c.akkeshis}))}))},null,2));
