import {readFile,writeFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {buildAmedasPoints} from "../src/jma/amedas.js";
import {estimateLocalTemperature} from "../src/location/temperatureEstimation.js";
import {temperatureObservationTime} from "../src/location/temperatureObservation.js";
import {temperatureSnapshot} from "../src/location/temperatureWeather.js";
import {applyTemperatureClimate} from "../src/location/temperatureClimate.js";
import {createTemperatureClimateReader} from "../src/location/temperatureClimateData.js";
import {TEMPERATURE_CLIMATE_DATA_PATH} from "../src/location/temperatureClimateData.generated.js";
import {createEnvironmentReader} from "../src/location/environmentData.js";
import {prepareTemperatureAuditFrame} from "./audit-local-temperature.mjs";
import {windTrendContext,physicalWindTrendCandidates,excludeTemperatureTarget,WIND_TREND_FEATURES} from "./temperatureWindTrendCandidates.mjs";
import {solarAltitude} from "./temperatureWeatherCandidates.mjs";
const root=new URL("../",import.meta.url),out=new URL(".cache/temperature-wind-trend/",root),evaluation=process.argv.includes("--evaluation");
const protocol=JSON.parse(await readFile(new URL("protocol.json",out),"utf8"));
const manifest=JSON.parse(await readFile(new URL(evaluation?"evaluation-manifest.json":"calibration-manifest.json",out),"utf8"));
const expectedHashes=new Map(manifest.filter(r=>r.status==="ok").map(r=>[r.time,r.sha256]));
if(evaluation){
 const frozen=JSON.parse(await readFile(new URL("selection.json",out),"utf8"));
 const codeHash=createHash("sha256").update(await readFile(new URL("scripts/temperatureWindTrendCandidates.mjs",root))).digest("hex");
 if(codeHash!==frozen.candidateCodeSha256)throw Error("Candidate changed after coefficient lock");
 if(manifest.some(r=>r.status==="ok"&&Date.parse(r.acquiredAt)<Date.parse(frozen.frozenAt)))throw Error("Evaluation acquired before coefficient lock");
}
for(const [path,hash]of Object.entries(protocol.baselineHashes))if(createHash("sha256").update(await readFile(new URL(path,root))).digest("hex")!==hash)throw Error(`Baseline changed: ${path}`);
const table=JSON.parse(await readFile(new URL(".cache/temperature-audit/stations.json",root),"utf8"));
const normals=JSON.parse(await readFile(new URL("public/data/amedas-daily-high-low-temperature-normals-1991-2020.json",root),"utf8"));
const climateBytes=await readFile(new URL(`public/${TEMPERATURE_CLIMATE_DATA_PATH}`,root));
const climateReader=createTemperatureClimateReader({fetcher:async()=>new Response(climateBytes),loadNormals:async()=>normals});
const environmentReader=createEnvironmentReader({maxTiles:512,fetcher:async url=>new Response(await readFile(new URL(`public/${String(url).replace(/^\//,"")}`,root)))});
const metadata=buildAmedasPoints(Object.fromEntries(Object.keys(table).map(id=>[id,{}])),table,{});
const profiles=await environmentReader(metadata.map(p=>p.coordinates));
const byCoordinates=new Map(metadata.map((p,i)=>[p.coordinates.join(","),profiles[i]??null]));
const input=JSON.parse(await readFile(new URL(".cache/temperature-audit/inputs.json",root),"utf8")),paths=new Map(input.landPaths);
const connection=(a,b)=>paths.get([a.coordinates.join(","),b.coordinates.join(",")].sort().join("|"))??null;
const shifted=(stamp,minutes)=>new Date(Date.parse(temperatureObservationTime(stamp))+minutes*60000+9*3600000).toISOString().replaceAll(/[-:TZ.]/g,"").slice(0,14);
const rawCache=new Map(),sourceHashes={};
async function pointsAt(time){if(rawCache.has(time))return rawCache.get(time);const bytes=await readFile(new URL(`${time}.json`,out));sourceHashes[time]=createHash("sha256").update(bytes).digest("hex");
 if(sourceHashes[time]!==expectedHashes.get(time))throw Error(`Observation source mismatch: ${time}`);
 const points=buildAmedasPoints(JSON.parse(bytes),table,null,time).map(p=>({...p,environment:byCoordinates.get(p.coordinates.join(","))??null}));rawCache.set(time,points);return points;}
const records=[];
for(const time of evaluation?protocol.evaluationTimes:protocol.calibrationTimes){
 const current=await pointsAt(time),timeMs=Date.parse(temperatureObservationTime(time));
 const history=await Promise.all(protocol.historyMinutes.map(async minutes=>{const stamp=shifted(time,-minutes);return temperatureSnapshot(await pointsAt(stamp),Date.parse(temperatureObservationTime(stamp)));}));
 const background=await climateReader(time),prepared=prepareTemperatureAuditFrame({points:current,observationTime:time,now:timeMs+300000,connection});
 for(const {target,options}of prepared){
  const heldHistory=excludeTemperatureTarget(history,target.id),climate={...background,points:background.points.filter(s=>s.id!==target.id)};
  if(heldHistory.some(f=>f.values.has(String(target.id)))||options.points.some(s=>s.id===target.id)||climate.points.some(s=>s.id===target.id))throw Error("Target leaked");
  const foreground=estimateLocalTemperature(options),baseline=applyTemperatureClimate(foreground,{coordinates:target.coordinates,elevation:target.elevation,environment:target.environment,climate});
  const pointMap=new Map(options.points.map(p=>[String(p.id),p]));
  const entries=foreground.stations.map(s=>({point:pointMap.get(String(s.id)),weight:s.weight,corrected:s.corrected}));
  const contextInput={entries,coordinates:target.coordinates,elevation:target.elevation,environment:target.environment,timeMs,history:heldHistory,lapseRate:foreground.lapseRate};
  const context=baseline.kind==="estimated"?windTrendContext(contextInput):null;
  const physics=context?physicalWindTrendCandidates(contextInput,context):{legacy:0,advection30:0,advection60:0,trend:0};
  const [lon,lat]=target.coordinates,fold=((Math.floor(lat*3)*3+Math.floor(lon*2)*5)%7+7)%7;
  const sun=solarAltitude(target.coordinates,timeMs),oldSun=solarAltitude(target.coordinates,timeMs-30*60000);
  records.push({time,id:String(target.id),name:target.name,fold,kind:baseline.kind,baseline:baseline.value,observedC:target.value,
   elevation:target.elevation,sea:target.environment?.sea??null,flags:baseline.flags,climateAdjusted:!!baseline.climateAdjusted,
   morning:sun>=-6&&sun<=35&&sun>oldSun,features:context?.features??null,physics,
   context:context?{windSpeed:context.currentWind.speed,windCoherence:context.currentWind.coherence,trend30PerHour:context.short.mean,trend60PerHour:context.long.mean,trendSpreadPerHour:context.short.spread}:null});
 }
 console.log(time,prepared.length,"targets");
}
const data={phase:evaluation?"evaluation":"calibration",featureGroups:WIND_TREND_FEATURES,sourceHashes,records};
await writeFile(new URL(evaluation?"evaluation-features.json":"calibration-features.json",out),JSON.stringify(data));
console.log(JSON.stringify({phase:data.phase,cases:records.length,estimated:records.filter(r=>r.kind==="estimated").length,usable:records.filter(r=>r.features).length,reservedTargets:records.filter(r=>[0,3].includes(r.fold)).length}));
