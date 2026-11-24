import assert from "node:assert/strict";
import { createBaseMapTileLoader, planBaseMapPrefetch } from "../src/map/baseMapTiles.js";
import { baseMapTileManifest as manifest } from "../src/map/data/baseMapTileManifest.js";

const url = key => `meteoscope-basemap://tiles/${key}.pbf`;
const reply = (bytes = [1,2], control = "public, max-age=31536000, immutable") => ({ok:true,headers:new Headers({"cache-control":control}),arrayBuffer:async()=>new Uint8Array(bytes).buffer});
let calls = 0;
const loader = createBaseMapTileLoader(async () => { calls++; return reply(); }, "http://localhost");
const first = await loader({url:url("0/0/0")});
structuredClone(first.data, {transfer:[first.data]});
assert.equal(first.data.byteLength, 0);
assert.deepEqual([...new Uint8Array((await loader({url:url("0/0/0")})).data)], [1,2]);
assert.equal(calls, 1, "renderer transfer does not detach cached bytes");

let evictedCalls = 0;
const small = createBaseMapTileLoader(async () => { evictedCalls++; return reply(); }, "http://localhost", {memoryBytes:3});
await small({url:url("0/0/0")}); await small({url:url("1/0/0")}); await small({url:url("0/0/0")});
assert.equal(evictedCalls, 3, "raw tile cache has a byte limit");
let privateCalls = 0;
const privateLoader = createBaseMapTileLoader(async () => { privateCalls++; return reply([1],"no-store"); }, "http://localhost");
await privateLoader({url:url("0/0/0")}); await privateLoader({url:url("0/0/0")});
assert.equal(privateCalls, 2);

const pending = [];
const shared = createBaseMapTileLoader((target, options) => new Promise(resolve => pending.push({target,options,resolve})), "http://localhost");
const a = new AbortController(), b = new AbortController();
const pa = shared({url:url("0/0/0")},a), pb = shared({url:url("0/0/0")},b);
const cancelled = assert.rejects(pa, {name:"AbortError"});
await Promise.resolve(); assert.equal(pending.length, 1);
a.abort(); await cancelled;
assert.equal(pending[0].options.signal.aborted, false, "a second consumer retains the shared request");
pending[0].resolve(reply()); await pb;
assert.equal(pending.length, 1);

const bounds = {getWest:()=>139,getEast:()=>140,getSouth:()=>35,getNorth:()=>36};
const candidates = planBaseMapPrefetch(bounds,8);
assert.ok(candidates.length > 2);
assert.equal(new Set(candidates).size,candidates.length);
assert(candidates.every(key=>manifest.tiles.includes(key)));
for(const key of candidates){
  const [,x,y]=key.split('/').map(Number);
  assert(!(x>=226&&x<=227&&y>=100&&y<=101),"prefetch excludes the visible tile rectangle");
}
assert.deepEqual(planBaseMapPrefetch(bounds,NaN),[]);
assert.deepEqual(planBaseMapPrefetch({...bounds,getWest:()=>-200,getEast:()=>200},8),[]);
const warmPending=[];
const warmer=createBaseMapTileLoader((target,options)=>new Promise(resolve=>warmPending.push({target,options,resolve})),"http://localhost");
const warming=warmer.prefetch(bounds,8);
await Promise.resolve(); assert.equal(warmPending.length,2,"background concurrency is limited to two");
const visible=warmer({url:url(candidates[0])},new AbortController());
warmer.cancelPrefetch(); await warming;
assert.equal(warmPending[0].options.signal.aborted,false,"background cancellation preserves a joined visible request");
assert.equal(warmPending[1].options.signal.aborted,true);
warmPending[0].resolve(reply()); warmPending[1].resolve(reply());
await visible;
assert.equal(warmPending.length,2,"cancelled background work starts no more tiles");
const warmed=[];
const bounded=createBaseMapTileLoader(async target=>{warmed.push(target);return reply();},"http://localhost");
await bounded.prefetch(bounds,8);
assert.equal(warmed.length,Math.min(6,candidates.length));
await bounded({url:url(candidates[0])});
assert.equal(warmed.length,Math.min(6,candidates.length),"a prefetched tile needs no foreground request");
console.log("Basemap cache transfer, eviction, deduplication, cancellation and bounded prefetch passed.");
