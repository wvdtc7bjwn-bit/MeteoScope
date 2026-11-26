import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { environmentMeshPosition, environmentMeshIndex, decodeEnvironmentTile, sampleEnvironmentTile } from "../src/location/environmentMesh.js";
import { environmentSimilarity } from "../src/location/environmentProfile.js";
import { createEnvironmentReader } from "../src/location/environmentData.js";
import { estimateLocalTemperature } from "../src/location/temperatureEstimation.js";
import { TEMPERATURE_ESTIMATION as policy } from "../src/location/temperatureEstimationPolicy.js";
import { buildLocalTemperatureDetails } from "../src/ui/localTemperatureView.js";

const coords = [139.745,35.69];
const bytes = await readFile(new URL("../public/data/temperature-environment/v1/5339.bin",import.meta.url));
const buffer = () => bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const profile = { urban: .8, forest: .1, farm: .1, water: 0, sea: 0, meanElevation: 100, relief: 20, slope: 1, landYear: 2021, terrainYear: 2011 };
const other = { ...profile, urban: 0, forest: .9, farm: .1, relief: 500, slope: 30 };
const stamp = "20261125150000", now = Date.parse("2026-11-25T15:05:00+09:00");
const points = Array.from({length:4},(_,i)=>({id:String(i+1),name:`Station ${i}`,coordinates:[135+(i%2?.1:-.1),35+(i<2?.1:-.1)],elevation:100,temperatureQuality:0,values:{temperature:i%2?14:10},environment:i%2?other:profile}));
const run = extra => estimateLocalTemperature({points,coordinates:[135,35],elevation:100,observationTime:stamp,now,environment:profile,...extra});

test("mesh coordinates use south-to-north rows and survive exact cell boundaries",()=>{
  const p=environmentMeshPosition([139,35.75]);
  assert.equal(p.meshCode,"53395000"); assert.equal(p.index,4000);
  for(const c of [coords,[135.768,35.011],[141.35,43.06],[122,20],[153.99,45.99]]) {
    const position=environmentMeshPosition(c); assert.equal(environmentMeshIndex(position.meshCode),position.index);
  }
  assert.equal(environmentMeshPosition([0,0]),null); assert.equal(environmentMeshPosition([null,35]),null);
  assert.equal(environmentMeshIndex("53398000"),null);
});
test("real built data decode, years and schema are checked; missing differs from zero",()=>{
  const position=environmentMeshPosition(coords), tile=decodeEnvironmentTile(buffer(),position.primary);
  const sample=sampleEnvironmentTile(tile,position);
  assert.equal(sample.urban,.612); assert.equal(sample.meanElevation,25);
  assert.equal(sample.landYear,2021); assert.equal(sample.terrainYear,2011);
  assert.throws(()=>decodeEnvironmentTile(buffer(),"5338")); assert.throws(()=>decodeEnvironmentTile(new ArrayBuffer(1),"5339"));
  tile.view.setUint8(16+position.index*10,255);
  tile.view.setInt16(16+position.index*10+5,-5,true);
  const missing=sampleEnvironmentTile(tile,position); assert.equal(missing.urban,null); assert.equal(missing.meanElevation,-5);
});
test("similarity lowers influence without prescribing urban warming; incomplete data fall back",()=>{
  assert.equal(environmentSimilarity(profile,profile,100,100,policy),1);
  assert.ok(environmentSimilarity(profile,other,100,100,policy)<1);
  assert.ok(environmentSimilarity(profile,other,100,100,policy)>=policy.environmentMinWeight);
  assert.equal(environmentSimilarity(profile,null,100,100,policy),1);
  const weighted=run(), baseline=run({method:"fixed"});
  assert.equal(weighted.environmentAdjusted,true); assert.ok(weighted.value<baseline.value);
  assert.equal(run({points:points.map((p,i)=>i===0?{...p,environment:null}:p)}).environmentAdjusted,false);
  assert.equal(run({elevation:null}).environmentAdjusted,false);
  assert.equal(run({config:{environmentStrength:0}}).value,baseline.value);
  assert.equal(run({coordinates:points[0].coordinates}).kind,"observed");
});
test("reader deduplicates concurrent regions, reuses bytes and does no outside-coverage requests",async()=>{
  let calls=0;
  const reader=createEnvironmentReader({coverage:new Set(["5339"]),fetcher:async()=>{calls++;await new Promise(r=>setImmediate(r));return new Response(buffer());}});
  const [a,b]=await Promise.all([reader([coords,coords]),reader([coords])]);
  assert.equal(calls,1); assert.equal(a[0].urban,.612); assert.deepEqual(a[0],b[0]);
  await reader([coords]); assert.equal(calls,1);
  assert.deepEqual(await reader([[135,35],[0,0]]),[null,null]); assert.equal(calls,1);
});
test("failure backs off, LRU is bounded, and cancellation does not retain a failure",async()=>{
  let clock=0,calls=0,fail=true;
  const reader=createEnvironmentReader({now:()=>clock,coverage:new Set(["5339"]),fetcher:async()=>{calls++;return fail?new Response("",{status:503}):new Response(buffer());}});
  assert.deepEqual(await reader([coords]),[null]); await reader([coords]); assert.equal(calls,1);
  clock+=15*60000+1;fail=false;assert.ok((await reader([coords]))[0]);assert.equal(calls,2);
  const cancel=new AbortController();cancel.abort();await reader([coords],{signal:cancel.signal});assert.equal(calls,2);
  let releases, signal;
  const pending=createEnvironmentReader({coverage:new Set(["5339"]),fetcher:async(_url,options)=>{signal=options.signal;await new Promise(r=>{releases=r;});return new Response(buffer());}});
  const abort=new AbortController(), result=pending([coords],{signal:abort.signal});
  await new Promise(r=>setImmediate(r));abort.abort();assert.equal(signal.aborted,true);releases();assert.deepEqual(await result,[null]);
  let reads=0;
  const lru=createEnvironmentReader({maxTiles:1,coverage:new Set(["5339","5439"]),fetcher:async url=>{reads++;const b=buffer();new DataView(b).setUint16(6,Number(url.match(/(\d{4})\.bin$/)[1]),true);return new Response(b);}});
  await lru([coords]);await lru([[139.745,36.1]]);await lru([coords]);assert.equal(reads,3);
});
test("regional downloads stay at two concurrent requests even with a queued third region",async()=>{
  let active=0,maximum=0;
  const releases=[];
  const reader=createEnvironmentReader({coverage:new Set(["5339","5439","5539"]),fetcher:async url=>{
    active++;maximum=Math.max(maximum,active);await new Promise(resolve=>releases.push(resolve));active--;
    const b=buffer();new DataView(b).setUint16(6,Number(url.match(/(\d{4})\.bin$/)[1]),true);return new Response(b);
  }});
  const pending=reader([coords,[139.745,36.1],[139.745,36.8]]);
  await new Promise(r=>setImmediate(r));assert.equal(releases.length,2);
  releases[0]();await new Promise(r=>setImmediate(r));assert.equal(releases.length,3);
  releases[1]();releases[2]();await pending;assert.equal(maximum,2);
});
test("details disclose mesh vintage, proxy limitations and source without changing standard summary",()=>{
  const html=buildLocalTemperatureDetails(run());
  assert.match(html,/標高と周辺環境/);assert.match(html,/2021 \/ 2011/);assert.match(html,/舗装率そのものではありません/);assert.match(html,/国土交通省/);
  assert.ok(!buildLocalTemperatureDetails(run({method:"fixed"})).includes("周辺環境とデータの出典"));
});
