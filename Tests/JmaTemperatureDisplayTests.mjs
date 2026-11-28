import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import { parseJmaTemperatureTime, selectJmaTemperatureFrame, jmaTemperatureTilePosition,
  decodeJmaTemperaturePixel, createJmaTemperatureReader, JMA_TEMPERATURE_ROOT } from "../src/jma/estimatedTemperature.js";
import { createJmaTemperatureController } from "../src/location/jmaTemperatureController.js";
import { loadTemperatureSource, saveTemperatureSource, effectiveTemperatureSource, createTemperatureSourceSelector } from "../src/preferences/temperatureSource.js";
import { buildLocalTemperatureButton, buildLocalTemperatureDetails } from "../src/ui/localTemperatureView.js";

const stamp = "20261126160000", now = Date.parse("2026-11-26T16:20:00Z");
const record = (validtime = stamp, extra = {}) => ({ basetime: validtime, validtime, elements:["temp","wthr"], ...extra });
const coordinates = [139.75,35.68]; // Public reference grid, never a user's GPS fix.
const location = { status:"found", coordinates };
const frame = { ...selectJmaTemperatureFrame([record()],now), range:{ lowerC:10,upperC:11 }, reason:null, retrievedAt:new Date(now).toISOString() };
const settle = () => new Promise(resolve => setImmediate(resolve));

test("tile timestamps are UTC, including JST midnight, with strict dates and no future/old/forecast selection", () => {
  assert.equal(parseJmaTemperatureTime(stamp),"2026-11-26T16:00:00.000Z");
  assert.equal(parseJmaTemperatureTime("20261126150000"),"2026-11-26T15:00:00.000Z");
  for (const bad of [null,20261126160000,"20260230160000","20261301160000","20261126240000","202611261600","2026112616000x"]) assert.equal(parseJmaTemperatureTime(bad),null);
  const input = [record("20261126170000"),record("20261126150000"),record(),record("20261126161500",{basetime:stamp}),record("20261126161000",{elements:["wthr"]})];
  assert.equal(selectJmaTemperatureFrame(input,now).validtime,stamp);
  assert.equal(selectJmaTemperatureFrame([record()],Date.parse("2026-11-26T17:30:00Z")).validtime,stamp);
  assert.equal(selectJmaTemperatureFrame([record()],Date.parse("2026-11-26T17:30:01Z")),null);
  assert.equal(selectJmaTemperatureFrame([record()],Date.parse("2026-11-26T15:59:59Z")),null);
  assert.equal(selectJmaTemperatureFrame([record(stamp,{elements:"temp"})],now),null);
  assert.equal(selectJmaTemperatureFrame([record(stamp,{member:"forecast"})],now),null);
  assert.equal(selectJmaTemperatureFrame([],now),null);
});

test("containing mesh centre uses JMA 512px raster coordinates, negative pixels/nearby labels are never sampled", () => {
  const position=jmaTemperatureTilePosition(coordinates);
  assert.equal(position.tileX,454); assert.equal(position.tileY,201);
  assert.ok(position.pixelX>=0&&position.pixelX<512&&position.pixelY>=0&&position.pixelY<512);
  assert.ok(Math.abs(position.coordinates[0]-139.75625)<1e-9);
  assert.equal(jmaTemperatureTilePosition([139.7501,35.6801]).key,position.key);
  assert.notEqual(jmaTemperatureTilePosition([139.763,35.68]).key,position.key);
  for (const bad of [null,[],[NaN,35],[135,Infinity],[0,0],[150,35],[140,48]]) assert.equal(jmaTemperatureTilePosition(bad),null);
});

test("official palette yields intervals, including zero and extremes; unknown/transparent pixels stay missing", () => {
  assert.deepEqual(decodeJmaTemperaturePixel([0,116,255,255]),{lowerC:0,upperC:1});
  assert.deepEqual(decodeJmaTemperaturePixel([227,247,246,255]),{lowerC:10,upperC:11});
  assert.deepEqual(decodeJmaTemperaturePixel([0,99,255,255]),{lowerC:-1,upperC:0});
  assert.deepEqual(decodeJmaTemperaturePixel([222,220,232,255]),{lowerC:-29,upperC:-28});
  assert.deepEqual(decodeJmaTemperaturePixel([228,226,236,255]),{lowerC:null,upperC:-29});
  assert.deepEqual(decodeJmaTemperaturePixel([58,0,34,255]),{lowerC:44,upperC:null});
  assert.deepEqual(decodeJmaTemperaturePixel([69,0,40,255]),{lowerC:43,upperC:44});
  for (const p of [[0,116,255,0],[0,116,255,254],[255,255,255,255],null]) assert.equal(decodeJmaTemperaturePixel(p),null);
});

test("reader keeps official validtime separate from retrieval/AMeDAS; deduplicates bytes and avoids unadvertised frames", async () => {
  let reads=0, urls=[];
  const read=createJmaTemperatureReader({now:()=>now,json:async(url,options)=>{assert.equal(url,`${JMA_TEMPERATURE_ROOT}/targetTimes.json`);assert.equal(options.staleIfError,false);return [record()];},
    bytes:async(url,options)=>{reads++;urls.push(url);assert.equal(options.retryCount,0);return new ArrayBuffer(4);},pixel:async()=>[227,247,246,255]});
  const results=await Promise.all([read(coordinates),read([139.7501,35.6801])]);
  assert.equal(reads,1);assert.ok(urls[0].includes(`/${stamp}/none/${stamp}/surf/temp/10/454/201.png`));
  assert.ok(!urls[0].includes(String(coordinates[0])));
  assert.equal(results[0].observationTime,"2026-11-26T16:00:00.000Z");assert.equal(results[0].retrievedAt,"2026-11-26T16:20:00.000Z");
  assert.deepEqual(results[0].range,{lowerC:10,upperC:11});await read(coordinates);assert.equal(reads,1);
  let io=0;
  const missing=createJmaTemperatureReader({now:()=>now,json:async()=>[],bytes:async()=>{io++;}});
  assert.equal((await missing(coordinates)).reason,"no-fresh-frame");assert.equal(io,0);
  assert.equal((await missing([0,0])).reason,"outside-coverage");
});

test("missing mesh is not replaced by neighbouring pixels or older frames; downloads that cross expiry are rejected", async () => {
  let clock=now, pixels=0;
  const read=createJmaTemperatureReader({now:()=>clock,json:async()=>[record(),record("20261126150000")],bytes:async()=>new ArrayBuffer(4),pixel:async()=>{pixels++;return [0,0,0,0];}});
  const result=await read(coordinates);assert.equal(result.reason,"missing-mesh");assert.equal(result.range,null);assert.equal(pixels,1);assert.equal(result.validtime,stamp);
  const expiring=createJmaTemperatureReader({now:()=>clock,json:async()=>[record()],bytes:async()=>{clock=now+90*60000;return new ArrayBuffer(4);},pixel:async()=>[0,116,255,255]});
  assert.equal((await expiring(coordinates)).reason,"no-fresh-frame");
  const unsupported=createJmaTemperatureReader({now:()=>now,json:async()=>[record()],bytes:async()=>new ArrayBuffer(4),pixel:async()=>[1,2,3,255]});
  assert.equal((await unsupported(coordinates)).reason,"unsupported-color","unknown opaque colours are distinct from missing/transparent data");
});

test("controller ignores disabled, old location and late requests; repeated renders do not fetch; failed requests cool down", async () => {
  let calls=0, changes=0, clock=now, resolve;
  const controller=createJmaTemperatureController({now:()=>clock,onChange:()=>changes++,read:async()=>{calls++;return new Promise(r=>resolve=r);}});
  assert.equal(controller.update({enabled:false,location}),null);assert.equal(calls,0);
  assert.equal(controller.update({enabled:true,location}).loading,true);await settle();
  for(let i=0;i<10;i++)controller.update({enabled:true,location});assert.equal(calls,1);
  controller.update({enabled:false});resolve(frame);await settle();assert.equal(changes,0);
  controller.update({enabled:true,location});await settle();resolve(frame);await settle();assert.equal(changes,1);
  assert.equal(controller.update({enabled:true,location}).kind,"jma-estimated");assert.equal(calls,2);
  clock+=60000;assert.equal(controller.update({enabled:true,location}).loading,true);await settle();
  controller.update({enabled:true,location:{...location,coordinates:[140,36]}});await settle();
  resolve({...frame,range:null,reason:"missing-mesh"});await settle();
  assert.equal(controller.update({enabled:true,location:{...location,coordinates:[140,36]}}).range,null);
  let failures=0;const failing=createJmaTemperatureController({now:()=>clock,read:async()=>{failures++;throw Error("offline");}});
  failing.update({enabled:true,location});await settle();assert.equal(failing.update({enabled:true,location}).reason,"request-failed");assert.equal(failures,1);
  clock+=60000;failing.update({enabled:true,location});await settle();assert.equal(failures,2);
});

test("a cached official result expires even while refresh is pending and GPS-only updates retain actual coordinates", async () => {
  let clock=now, reads=0;
  const controller=createJmaTemperatureController({now:()=>clock,read:async()=>{reads++;if(reads>1)return new Promise(()=>{});return frame;}});
  controller.update({enabled:true,location});await settle();
  const moved={...location,coordinates:[139.7501,35.6801],accuracy:400};
  assert.deepEqual(controller.update({enabled:true,location:moved}).location.coordinates,moved.coordinates);assert.equal(reads,1);
  clock+=71*60000;assert.equal(controller.update({enabled:true,location:moved}).range,null);
});

test("an old location's successful request cannot replace the current mesh, and byte cache is bounded", async () => {
  const pending=[], changes=[];
  const controller=createJmaTemperatureController({now:()=>now,onChange:r=>changes.push(r),read:()=>new Promise(resolve=>pending.push(resolve))});
  controller.update({enabled:true,location});await settle();
  const other={...location,coordinates:[140,36]};controller.update({enabled:true,location:other});await settle();
  pending[0](frame);await settle();assert.equal(changes.length,0);
  pending[1]({...frame,range:{lowerC:5,upperC:6}});await settle();
  assert.deepEqual(changes[0].location.coordinates,other.coordinates);assert.equal(changes[0].range.lowerC,5);
  let calls=0;
  const read=createJmaTemperatureReader({now:()=>now,json:async()=>[record()],bytes:async()=>{calls++;return new ArrayBuffer(1);},pixel:async()=>[0,116,255,255]});
  for(const lon of [130,132,134,136,138])await read([lon,35]);
  assert.equal(calls,5);await read([138,35]);assert.equal(calls,5);await read([130,35]);assert.equal(calls,6);
});

test("source preference migrates legacy opt-in, preserves explicit choice and handles denied storage", async () => {
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};
  assert.equal(loadTemperatureSource(storage),"nearest");values.set("meteoscope.localTemperature.v1","true");assert.equal(loadTemperatureSource(storage),"meteoscope");
  assert.equal(saveTemperatureSource("jma",storage),"jma");assert.equal(loadTemperatureSource(storage),"jma");
  assert.equal(saveTemperatureSource("bad",storage),"nearest");assert.equal(loadTemperatureSource(storage),"nearest");
  const denied={getItem(){throw Error("denied");},setItem(){throw Error("denied");}};
  assert.equal(loadTemperatureSource(denied),"nearest");assert.equal(saveTemperatureSource("jma",denied),"jma");
  assert.equal(effectiveTemperatureSource("meteoscope",false),"nearest");assert.equal(effectiveTemperatureSource("jma",false),"jma");
});

test("custom source requires consent and early access; pending consent cannot overwrite another source", async () => {
  const state={earlyAccessEnabled:true,temperatureEstimationAllowed:true,temperatureEstimationEnabled:false};let reply;const changes=[];
  const select=createTemperatureSourceSelector({getState:()=>state,onChange:v=>changes.push(v),confirm:()=>new Promise(r=>reply=r)});
  let p=select("meteoscope");assert.equal(await select("meteoscope"),false);await select("jma");reply(true);assert.equal(await p,false);assert.deepEqual(changes,["jma"]);
  p=select("meteoscope");reply(false);assert.equal(await p,false);
  p=select("meteoscope");state.earlyAccessEnabled=false;reply(true);assert.equal(await p,false);
  assert.equal(await select("meteoscope"),false);assert.equal(await select("nearest"),true);
  state.earlyAccessEnabled=true;p=select("meteoscope");reply(true);assert.equal(await p,true);assert.equal(changes.at(-1),"meteoscope");
});

test("summary only shows official interval; details distinguish source, analysis date and retrieval time without invented decimals", () => {
  const result={...frame,source:"jma",kind:"jma-estimated",value:null,location};
  const summary=buildLocalTemperatureButton(result);assert.match(summary,/>10〜11℃<\/span>/);assert.match(summary,/気象庁の推計気象分布/);assert.ok(!summary.includes("10.5"));
  const html=buildLocalTemperatureDetails(result);
  assert.match(html,/対象時刻（日本時間）/);assert.match(html,/11\/27 01:00/);assert.match(html,/11\/27 01:20/);assert.ok(!html.includes("11/26 16:00"));
  assert.match(html,/1℃区分/);assert.match(html,/上端は含みません/);assert.ok(!html.includes("使用観測点数"));
  assert.match(buildLocalTemperatureDetails({...result,range:null,reason:"request-failed"}),/取得できません/);
});

test("settings and app wire source choices to summary only while the original independent estimator is preserved", async () => {
  const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
  for(const source of ["nearest","meteoscope","auto","jma"])assert.match(html,new RegExp(`data-settings-temperature-source="${source}"`));
  const app=await readFile(new URL("../src/app.js",import.meta.url),"utf8");
  assert.match(app,/usesTemperatureEstimation\(activeTemperatureSource\)/);assert.match(app,/activeTemperatureSource === "jma"/);
  assert.match(app,/localTemperature: displayedTemperature/);
  const estimator=await readFile(new URL("../src/location/localTemperatureController.js",import.meta.url),"utf8");assert.ok(!estimator.includes("estimatedTemperature.js"));
  const worker=await readFile(new URL("../public/sw.js",import.meta.url),"utf8");
  assert.match(worker,/meteoscope-shell-v10/);assert.match(worker,/key !== APP_SHELL_CACHE/);
});
