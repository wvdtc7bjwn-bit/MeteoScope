import assert from "node:assert/strict";
import {test} from "node:test";
import {createMunicipalityLookup,resolveCurrentLocationInfo} from "../src/location/currentLocation.js";
import {createRetryableResource} from "../src/utils/retryableResource.js";
import {normalizeLocationFix} from "../src/location/locationFix.js";
const geo={features:[{properties:{code:"13001",name:"Sample"},geometry:{type:"Polygon",coordinates:[[[134,34],[136,34],[136,36],[134,36],[134,34]]]}}]};
test("municipality failures back off, share requests and recover without discarding GPS metadata",async()=>{
  let clock=1000,calls=0,finish;
  const lookup=createMunicipalityLookup({now:()=>clock,retryMs:30000,fetcher:()=>{calls++;return new Promise(r=>finish=r);}});
  const first=lookup(),second=lookup();assert.equal(first,second);
  await Promise.resolve();finish(new Response("unavailable",{status:503}));await assert.rejects(first);
  await assert.rejects(lookup());assert.equal(calls,1);
  const fix={accuracy:75,positionTimestamp:1234};
  const failed=await resolveCurrentLocationInfo([135,35],{},fix,{lookup});
  assert.equal(failed.status,"found");assert.equal(failed.geographyStatus,"unavailable");
  assert.deepEqual(failed.coordinates,[135,35]);assert.equal(failed.accuracy,75);assert.equal(failed.positionTimestamp,1234);
  clock+=30000;const next=lookup();await Promise.resolve();finish(Response.json(geo));
  const municipalities=await next;assert.equal(calls,2);assert.equal(await lookup(),municipalities);
  const recovered=await resolveCurrentLocationInfo([135,35],{},fix,{lookup});
  assert.equal(recovered.geographyStatus,"ready");assert.equal(recovered.areaName,"Sample");assert.match(recovered.message,/警報情報を取得できません/);
  const warningRefresh=await resolveCurrentLocationInfo(recovered.coordinates,{activeAreas:[{areaCode:"13001",warnings:[{type:"test"}]}]},recovered,{lookup});
  assert.equal(warningRefresh.accuracy,75);assert.equal(warningRefresh.positionTimestamp,1234);assert.equal(calls,2);
});
test("a timed-out old load cannot destroy a newer successful shared result",async()=>{
  let clock=0,rejectOld,calls=0;
  const read=createRetryableResource(()=>++calls===1?new Promise((_,reject)=>rejectOld=reject):Promise.resolve("recovered"),{now:()=>clock,retryMs:30,timeoutMs:10});
  await assert.rejects(read(),/timeout/);clock=30;
  const next=read();assert.equal(await next,"recovered");
  rejectOld(new Error("late network failure"));await new Promise(r=>setImmediate(r));
  assert.equal(read(),next);assert.equal(await read(),"recovered");assert.equal(calls,2);
});
test("unknown GPS metadata is not zero",()=>{
  for(const accuracy of [undefined,null,"",-1,Infinity,NaN])assert.equal(normalizeLocationFix({accuracy}).accuracy,null);
  assert.deepEqual(normalizeLocationFix({accuracy:25,positionTimestamp:1234}),{accuracy:25,positionTimestamp:1234});
});
