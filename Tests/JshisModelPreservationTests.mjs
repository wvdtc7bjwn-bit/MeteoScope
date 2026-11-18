import assert from "node:assert/strict";
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import path from "node:path";
import {readJshisPointModel,expectedJshisPatterns} from "../src/simulation/jshisModel.js";
import {selectJshisGeometry,createJshisPointDistances,snapJshisSources} from "../src/simulation/jshisSourceGeometry.js";
import {normalizeSimulationOptions,prepareEarthquakeSimulation,getSimulationPresetOptions} from "../src/simulation/earthquakeSimulation.js";
import {storeModel,publishLocalManifest,verifyArchive,fetchArchiveBytes} from "../scripts/lib/jshisArchive.mjs";

const identity={version:"Y2024",probabilityCase:"MAX",code:"ACHSM"};
const codes=expectedJshisPatterns("ACHSM","Y2024");
const points=[[145,43,10],[145.1,43,15],[145.2,43,20]];
const data={type:"FeatureCollection",status:"Success",metaData:{version:"Y2024",case:"MAX",ltecode:"ACHSM"},
  crs:{properties:{name:"urn:ogc:def:crs:EPSG:4326"}},seisact_model:{ltecode:"ACHSM",ltename:"Synthetic",geom_num:39,magl:"-8.7",magu:"-9.2"},
  features:codes.map(code=>({type:"Feature",properties:{pattern_code:code,weight:"0.1"},geometry:{type:"MultiPoint",coordinates:structuredClone(points)}}))};
const bytes=Buffer.from(JSON.stringify(data));
assert.equal(readJshisPointModel(data,identity).patterns.length,13);
assert.equal(readJshisPointModel(data,identity).pointCount,39);
for(const mutate of [d=>d.features.pop(),d=>d.features[0].properties.pattern_code="ACH02",d=>d.seisact_model.geom_num=13,
 d=>d.features[0].geometry.coordinates[0][2]=-1,d=>d.metaData.version="Y2023",d=>d.crs.properties.name="urn:ogc:def:crs:EPSG:4301"]){
  const bad=structuredClone(data);mutate(bad);assert.throws(()=>readJshisPointModel(bad,identity));
}
const geometry=selectJshisGeometry(data,"ACH13","kuril-trench");
assert.equal(geometry.points.length,3);assert.equal(geometry.referenceDepthKm,15);
assert.equal(geometry.magnitude,undefined,"pattern Mw is not inferred from a whole-model range");
assert.throws(()=>normalizeSimulationOptions({...getSimulationPresetOptions("japan-trench"),jshisGeometry:geometry}));
const source=snapJshisSources([{coordinates:[145,43],ruptureDelaySec:0},{coordinates:[145,43],ruptureDelaySec:2}],geometry,15);
assert.equal(source.length,1,"duplicate source origins cannot leave empty distance groups");
const distances=createJshisPointDistances(geometry,source,15);
assert.ok(Math.abs(distances([145,43])[0]-10)<1e-8,"depth is retained, not projected to the surface");
const simulation=await prepareEarthquakeSimulation({...getSimulationPresetOptions("kuril-trench"),jshisGeometry:geometry,depthKm:15,magnitude:8.7},
  {"001":{longitude:145,latitude:43}},{yieldTask:async()=>{}});
assert.ok(simulation.stations[0].sourceRuptureDistancesKm.every(Number.isFinite));
assert.match(simulation.frame(simulation.duration).event.uncertaintyLabel,/点群距離近似/);
assert.deepEqual(simulation.frame(0),simulation.frame(0),"seek remains deterministic");

const root=path.resolve(".cache","tests",`jshis-${randomUUID()}`);await mkdir(root,{recursive:true});
const entry=await storeModel(root,bytes,identity,"2026-11-18T00:00:00.000Z");
const manifest={entries:[entry]};await publishLocalManifest(root,manifest);
assert.equal(await verifyArchive(root,manifest),1);
const latest=await readFile(path.join(root,"latest.json"),"utf8");
await assert.rejects(()=>storeModel(root,Buffer.from('{}'),identity));
assert.equal(await readFile(path.join(root,"latest.json"),"utf8"),latest,"bad responses cannot replace a good manifest");
await assert.rejects(()=>publishLocalManifest(root,{entries:[{...entry,sha256:"0".repeat(64)}]}));
assert.equal(await readFile(path.join(root,"latest.json"),"utf8"),latest);
const again=await storeModel(root,bytes,identity);assert.equal(again.sha256,entry.sha256,"same raw bytes deduplicate");
await writeFile(path.join(root,"objects",`${entry.sha256}.geojson`),'corrupt');
await assert.rejects(()=>verifyArchive(root,manifest),/Corrupt/);
let calls=0,waits=[];
const fetched=await fetchArchiveBytes("https://example.invalid",{fetcher:async()=>{calls++;if(calls<3)throw new Error("timeout");return new Response(bytes);},wait:async ms=>waits.push(ms)});
assert.equal(calls,3);assert.deepEqual(waits,[2000,4000]);assert.deepEqual(fetched,bytes);
for(const status of [403,429]){calls=0;await assert.rejects(()=>fetchArchiveBytes("https://example.invalid",{fetcher:async()=>{calls++;return new Response("limited",{status});},wait:async()=>{}}),/stop acquisition/);assert.equal(calls,1);}
await assert.rejects(()=>fetchArchiveBytes("https://example.invalid",{fetcher:async()=>new Response(bytes),maxBytes:2}),/byte limit/);
console.log("J-SHIS: full pattern coverage, 3D point distances, retained bytes/hash, deduplication, corruption/failure preservation, bounded retries and access-limit stop passed");
