// Offline LOO audit of the exact application engine. Outputs stay in ignored .cache/.
// Public national station data only; no personal locations and no parameter tuning.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { buildAmedasPoints } from "../src/jma/amedas.js";
import { estimateLocalTemperature, temperatureErrorMetrics, selectTemperatureStations } from "../src/location/temperatureEstimation.js";
import { TEMPERATURE_ESTIMATION } from "../src/location/temperatureEstimationPolicy.js";
import { decodeEnvironmentTile, environmentMeshPosition, sampleEnvironmentTile } from "../src/location/environmentMesh.js";
import { buildLandConnectionChecker, loadMunicipalityLookup } from "../src/location/currentLocation.js";
import { getDistanceKm } from "../src/location/distance.js";
import { JMA_ENDPOINTS } from "../src/config.js";

const root = new URL("../", import.meta.url);
const finite = value => typeof value === "number" && Number.isFinite(value);
const percentile = (values, fraction) => values.length ? [...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*fraction)-1)] : null;

export function summarizeAudit(records, selector = row => row.errorC) {
  const errors = records.map(selector).filter(finite), absolute = errors.map(Math.abs);
  return { ...temperatureErrorMetrics(errors,records.length),
    medianAbsoluteError:percentile(absolute,.5),p90AbsoluteError:percentile(absolute,.9),p95AbsoluteError:percentile(absolute,.95),
    within1C:errors.length ? absolute.filter(e=>e<=1).length/errors.length : null,
    within2C:errors.length ? absolute.filter(e=>e<=2).length/errors.length : null,
    above3C:errors.length ? absolute.filter(e=>e>3).length/errors.length : null };
}

export function prepareTemperatureAuditFrame({points,observationTime,now,connection = ()=>null}) {
  // Reuse the application quality/time filter, with no spatial truncation for target enumeration.
  const targets=selectTemperatureStations({points,coordinates:[0,0],observationTime,now,config:{maxNearestKm:Infinity}});
  return targets.map(target=>({target,options:{points:targets.filter(p=>String(p.id)!==String(target.id)
      && getDistanceKm(target.coordinates,p.coordinates)<=TEMPERATURE_ESTIMATION.maxNearestKm).map(point=>({...point,
      landConnected:getDistanceKm(target.coordinates,point.coordinates)<=TEMPERATURE_ESTIMATION.radiusKm
        ? connection(target,point) : null })),coordinates:target.coordinates,elevation:target.elevation,environment:target.environment,observationTime,now}}));
}
export function auditTemperatureFrame({prepared,config={},onProgress=()=>{},...input}) {
  const cases=prepared??prepareTemperatureAuditFrame(input),records=[];
  for(const {target,options} of cases) {
    const train=options.points,observationTime=options.observationTime;
    const result=estimateLocalTemperature({...options,config}), nearest=estimateLocalTemperature({...options,config,method:"nearest"});
    if(result.stations?.some(s=>String(s.id)===String(target.id))||String(result.nearest?.id)===String(target.id)) throw Error("Target leaked into training");
    const flags=[...result.flags];
    if(result.stations?.some(s=>train.find(p=>p.id===s.id)?.landConnected===null)) flags.push("land-screen-unavailable");
    records.push({time:observationTime,stationId:String(target.id),stationName:target.name,
      longitude:target.coordinates[0],latitude:target.coordinates[1],elevation:target.elevation,
      observedC:target.value,predictedC:result.value,errorC:finite(result.value)?result.value-target.value:null,
      absoluteErrorC:finite(result.value)?Math.abs(result.value-target.value):null,
      nearestC:nearest.value,nearestErrorC:finite(nearest.value)?nearest.value-target.value:null,
      kind:result.kind,method:result.method,environmentAdjusted:result.environmentAdjusted===true,
      confidence:flags.includes("land-screen-unavailable")&&result.kind==="estimated"?"low":result.confidence,
      stationCount:result.stationCount,nearestDistanceKm:result.nearest?.distanceKm??null,
      meanDistanceKm:result.diagnostics?.meanDistanceKm??null,spreadC:result.diagnostics?.correctedSpreadC??null,
      flags,stations:result.stations??[],fallbackStation:result.kind==="observed"?result.nearest:null});
    if(records.length%100===0) onProgress(records.length,cases.length);
  }
  return records;
}

function frameSummary(records) {
  const estimates=records.filter(r=>r.kind==="estimated"),fallback=records.filter(r=>r.kind==="observed");
  const group = select => Object.fromEntries([...new Set(records.map(select))].map(key=>{
    const subset=records.filter(r=>select(r)===key);return [key,{...summarizeAudit(subset),estimates:subset.filter(r=>r.kind==="estimated").length}];
  }));
  return { ...summarizeAudit(records),estimates:estimates.length,fallback:fallback.length,unavailable:records.filter(r=>r.kind==="unavailable").length,
    environmentAdjusted:records.filter(r=>r.environmentAdjusted).length,estimatesOnly:summarizeAudit(estimates),fallbackOnly:summarizeAudit(fallback),
    nearestBaseline:summarizeAudit(records,r=>r.nearestErrorC),
    groups:{elevation:group(r=>!finite(r.elevation)?"unknown":r.elevation<200?"below200m":r.elevation<800?"200to800m":"above800m"),
      confidence:group(r=>r.confidence),clock:group(r=>Number(r.time.slice(8,10))>=6&&Number(r.time.slice(8,10))<18?"06-18_JST":"18-06_JST")},
    reasons:Object.fromEntries([...new Set(records.flatMap(r=>r.flags))].map(flag=>[flag,records.filter(r=>r.flags.includes(flag)).length])) };
}
const csv = rows => "\ufeff"+rows.map(row=>row.map(value=>{
  const text=value==null?"":Array.isArray(value)?value.join(";"):String(value);
  return /[",\n\r]/.test(text)?`"${text.replaceAll('"','""')}"`:text;
}).join(",")).join("\r\n")+"\r\n";

async function main() {
  const directory=new URL(".cache/temperature-audit/",root);await mkdir(directory,{recursive:true});
  const manifest=JSON.parse(await readFile(new URL("source-manifest.json",directory),"utf8"));
  const freshTable=JSON.parse(await readFile(new URL("stations.json",directory),"utf8"));
  const historicalDirectory=new URL(".cache/temperature-validation/",root);
  const historical=JSON.parse(await readFile(new URL("docs/data/local-temperature-validation.json",root),"utf8"));
  const oldTable=JSON.parse(await readFile(new URL("stations.json",historicalDirectory),"utf8"));
  const tiles=new Map();
  async function environment(coordinates) {
    const p=environmentMeshPosition(coordinates);if(!p)return null;
    if(!tiles.has(p.primary)) {
      try {const b=await readFile(new URL(`public/data/temperature-environment/v1/${p.primary}.bin`,root));tiles.set(p.primary,decodeEnvironmentTile(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),p.primary));}
      catch{tiles.set(p.primary,null);}
    }
    return sampleEnvironmentTile(tiles.get(p.primary),p);
  }
  // Adapt only the local asset transport; execute the unchanged production geometry builder.
  const fetcher=globalThis.fetch;
  globalThis.fetch=async (url,options)=>String(url)===JMA_ENDPOINTS.warningMunicipalities
    ? new Response(await readFile(new URL("public/data/jma-weather-warning-municipalities.geojson",root))) : fetcher(url,options);
  let municipalities;
  try{municipalities=await loadMunicipalityLookup();}finally{globalThis.fetch=fetcher;}
  const land=buildLandConnectionChecker(municipalities),paths=new Map();
  const connection=(a,b)=>{
    const key=[a.coordinates.join(","),b.coordinates.join(",")].sort().join("|");
    if(!paths.has(key))paths.set(key,land(a.coordinates,b.coordinates));return paths.get(key);
  };
  const frames=[...new Set([...historical.calibrationTimes,...historical.evaluationTimes,manifest.stamp])].sort();
  const all=[],byFrame=[],frameInputs=[];let latestRaw;
  const codeHashes={};
  for(const file of ["src/location/temperatureEstimation.js","src/location/temperatureEstimationPolicy.js","src/location/environmentProfile.js",
    "src/location/environmentMesh.js","src/location/currentLocation.js","src/jma/amedas.js","public/data/jma-weather-warning-municipalities.geojson"])
    codeHashes[file]=createHash("sha256").update(await readFile(new URL(file,root))).digest("hex");
  for(const time of frames) {
    const fresh=time===manifest.stamp,bytes=await readFile(new URL(`${time}.json`,fresh?directory:historicalDirectory));
    const raw=JSON.parse(bytes),points=buildAmedasPoints(raw,fresh?freshTable:oldTable,null,time);
    if(fresh)latestRaw=raw;
    for(const p of points)p.environment=await environment(p.coordinates);
    const now=Date.parse(`${time.slice(0,4)}-${time.slice(4,6)}-${time.slice(6,8)}T${time.slice(8,10)}:${time.slice(10,12)}:${time.slice(12,14)}+09:00`)+5*60000;
    frameInputs.push({points,observationTime:time,now});
    console.log(`Auditing ${time}: ${points.length} reporting stations`);
    const records=auditTemperatureFrame({points,observationTime:time,now,connection,onProgress:(n,total)=>console.log(`  ${n}/${total}`)});
    const summary=frameSummary(records);
    byFrame.push({time,fresh,sha256:createHash("sha256").update(bytes).digest("hex"),...summary});all.push(...records);
    console.log(JSON.stringify({time,targets:records.length,mae:summary.mae,rmse:summary.rmse,estimated:summary.estimates,fallback:summary.fallback,unavailable:summary.unavailable}));
  }
  const latest=all.filter(r=>r.time===manifest.stamp),stations=[];
  for(const [id,metadata] of Object.entries(freshTable)) {
    const rows=all.filter(r=>r.stationId===id),current=latest.find(r=>r.stationId===id);
    const absentStatus=Array.isArray(latestRaw[id]?.temp)?"missing-or-invalid-temperature":"temperature-not-provided";
    stations.push({stationId:id,stationName:metadata.kjName??metadata.enName??id,elevation:metadata.alt??null,
      latestStatus:current?.kind??absentStatus,latestObservedC:current?.observedC??null,latestPredictedC:current?.predictedC??null,
      latestErrorC:current?.errorC??null,latestFlags:current?.flags??[absentStatus],...summarizeAudit(rows),estimates:rows.filter(r=>r.kind==="estimated").length,
      worst:rows.filter(r=>finite(r.errorC)).sort((a,b)=>Math.abs(b.errorC)-Math.abs(a.errorC))[0]??null});
  }
  const output={schema:1,sourceManifest:manifest,policy:TEMPERATURE_ESTIMATION,codeHashes,
    design:"Station-wise leave-one-out using unchanged application engine + environmental data + production land-route screen. Station catalogue altitude used as known target height; target never trains itself. Fixed policy; no tuning.",
    limitations:["Published station altitude substitutes for a DEM/GPS lookup; end-to-end location/elevation errors are not measured.",
      "One late-autumn period; historical frames were used during model development. Fresh latest frame is reported separately but is temporally correlated.",
      "No seasonal accuracy guarantee. Clock groups are not solar day/night classifications.","Nationwide public stations only; no personal locations or app comparison cases."],
    metadataStations:Object.keys(freshTable).length,temperatureAvailability:{valid:latest.length,
      notProvided:stations.filter(s=>s.latestStatus==="temperature-not-provided").length,
      missingOrInvalid:stations.filter(s=>s.latestStatus==="missing-or-invalid-temperature").length},
    frames:byFrame,latest:frameSummary(latest),all:frameSummary(all),
    landScreen:{pairs:paths.size,connected:[...paths.values()].filter(v=>v===true).length,crossing:[...paths.values()].filter(v=>v===false).length,unknown:[...paths.values()].filter(v=>v===null).length},
    worstLatest:[...latest].filter(r=>finite(r.errorC)).sort((a,b)=>Math.abs(b.errorC)-Math.abs(a.errorC)).slice(0,30)};
  await writeFile(new URL("summary.json",directory),JSON.stringify(output,null,2)+"\n");
  await writeFile(new URL("inputs.json",directory),JSON.stringify({frames:frameInputs,landPaths:[...paths],codeHashes})+"\n");
  await writeFile(new URL("predictions.json",directory),JSON.stringify(all)+"\n");
  // Preserve the fresh station source under its recorded name; use a separate inventory output.
  await writeFile(new URL("station-results.json",directory),JSON.stringify(stations,null,2)+"\n");
  const fields=["time","stationId","stationName","elevation","observedC","predictedC","errorC","kind","method","environmentAdjusted","confidence","stationCount","nearestDistanceKm","spreadC","flags"];
  await writeFile(new URL("all-predictions.csv",directory),csv([fields,...all.map(r=>fields.map(f=>r[f]))]));
  const stationFields=["stationId","stationName","elevation","latestStatus","latestObservedC","latestPredictedC","latestErrorC","count","estimates","mae","rmse","bias","maxAbsoluteError","latestFlags"];
  await writeFile(new URL("all-stations.csv",directory),csv([stationFields,...stations.map(r=>stationFields.map(f=>r[f]))]));
  console.log(JSON.stringify({latest:output.latest,all:output.all,landScreen:output.landScreen}));
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) await main();
