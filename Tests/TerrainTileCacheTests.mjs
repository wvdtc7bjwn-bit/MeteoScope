import assert from "node:assert/strict";
import { createTerrainTileLoader, registerTerrainTileProtocol, terrainTileTemplate, TERRAIN_TILE_CACHE_NAME } from "../src/map/terrainTiles.js";

// Bytes stand for an original PNG payload; the cache never decodes/re-encodes it.
const png = new Uint8Array([137,80,78,71,13,10,26,10,1,2,3,4]);
const tile = n => `meteoscope-terrain://relief/5/${n}/12.png`;
const request = (loader, n = 1, controller = new AbortController()) => loader({url:tile(n)},controller);
class FakeCache {
  entries = new Map();
  async keys() { return [...this.entries.keys()].map(url => new Request(url)); }
  async match(key) { return this.entries.get(typeof key === "string" ? key : key.url)?.clone(); }
  async put(key, value) { this.entries.set(key,value.clone()); }
  async delete(key) { return this.entries.delete(typeof key === "string" ? key : key.url); }
}
const disk = new FakeCache();
const cacheStorage = {async open(name) { assert.equal(name,TERRAIN_TILE_CACHE_NAME); return disk; }};
let calls = 0, clock = Date.now();
const fetcher = async () => { calls++; return new Response(png,{headers:{"cache-control":"max-age=60"}}); };
const options = {fetcher,cacheStorage,now:()=>clock};
const loader = createTerrainTileLoader(options);
const [first, duplicate] = await Promise.all([request(loader),request(loader)]);
assert.equal(calls,1,"concurrent consumers share the same fetch");
assert.deepEqual(new Uint8Array(first.data),png);
assert.notEqual(first.data,duplicate.data);
structuredClone(first.data,{transfer:[first.data]});
assert.deepEqual(new Uint8Array((await request(loader)).data),png,"transferred renderer buffer cannot detach cached bytes");
await loader.flushPendingWrites();
assert.equal(disk.entries.size,1);
await request(createTerrainTileLoader(options));
assert.equal(calls,1,"fresh loader/page reuses persistent original bytes");
clock += 61_000;
await request(loader);
assert.equal(calls,2,"expired data is refreshed");
await loader.flushPendingWrites();

// LRU memory limit and FIFO disk limits are independent of MapLibre's GPU cache.
calls=0;
const lru=createTerrainTileLoader({fetcher,cacheStorage:null,limits:{memoryBytes:png.length*2}});
await request(lru,1); await request(lru,2); await request(lru,1); await request(lru,3); await request(lru,1);
assert.equal(calls,3);
await request(lru,2); assert.equal(calls,4,"oldest unreferenced tile was evicted");
disk.entries.clear();
const bounded=createTerrainTileLoader({...options,limits:{memoryBytes:0,persistentEntries:2,persistentBytes:png.length*2}});
for (const n of [1,2,3]) { await request(bounded,n); await bounded.flushPendingWrites(); }
assert.equal(disk.entries.size,2);
assert.equal((await disk.keys()).some(key=>key.url.endsWith("/1/12.png")),false);
assert([...disk.entries.values()].every(response=>Number(response.headers.get("x-meteoscope-bytes"))===png.length));
const bytesBounded=createTerrainTileLoader({...options,limits:{memoryBytes:0,persistentEntries:256,persistentBytes:png.length}});
await request(bytesBounded,4); await bytesBounded.flushPendingWrites();
assert.equal(disk.entries.size,1,"byte limit also applies when entry count is low");

for (const headers of [{"cache-control":"no-store"},{"cache-control":"no-cache"},{"cache-control":"max-age=0"}]) {
  let count=0;
  const transient=createTerrainTileLoader({cacheStorage:null,fetcher:async()=>{count++;return new Response(png,{headers});}});
  await request(transient); await request(transient);
  assert.equal(count,2,"origin cache restrictions are honored");
}
for (const response of [()=>new Response("missing",{status:404}),()=>new Response("not png")]) {
  let count=0;
  const failing=createTerrainTileLoader({cacheStorage:null,fetcher:async()=>{count++;return response();}});
  await assert.rejects(request(failing)); await assert.rejects(request(failing));
  assert.equal(count,2,"failed tiles are retried, never cached as successful images");
}
for (const status of [404, 429, 503]) {
  const failing=createTerrainTileLoader({cacheStorage:null,fetcher:async()=>new Response("failed",{status})});
  await assert.rejects(request(failing),error=>error.status===status&&error.url==="https://cyberjapandata.gsi.go.jp/xyz/relief/5/1/12.png");
}
const denied=createTerrainTileLoader({fetcher,cacheStorage:{async open(){throw Error("denied");}}});
assert.deepEqual(new Uint8Array((await request(denied)).data),png);
await denied.flushPendingWrites();

// One cancelled map consumer must not cancel a tile still needed by another.
let finish, fetchSignal;
const cancellable=createTerrainTileLoader({cacheStorage:null,fetcher:async(_url,{signal})=>{
  fetchSignal=signal; return new Promise((resolve,reject)=>{finish=()=>resolve(new Response(png));signal.addEventListener("abort",()=>reject(signal.reason),{once:true});});
}});
const one=new AbortController(),two=new AbortController();
const pendingOne=request(cancellable,1,one), pendingTwo=request(cancellable,1,two);
await new Promise(resolve=>setTimeout(resolve,0));
one.abort(); await assert.rejects(pendingOne,{name:"AbortError"});
assert.equal(fetchSignal.aborted,false);
finish(); assert.deepEqual(new Uint8Array((await pendingTwo).data),png);
const all=new AbortController(),pendingAll=request(cancellable,2,all);
await new Promise(resolve=>setTimeout(resolve,0));
all.abort(); await assert.rejects(pendingAll,{name:"AbortError"});
assert.equal(fetchSignal.aborted,true);
const retry=request(cancellable,2);
await new Promise(resolve=>setTimeout(resolve,0));finish();await retry;
assert.equal(fetchSignal.aborted,false,"fully aborted flight does not poison retry");
assert.throws(()=>request(loader,99),/coordinates/);
assert.throws(()=>loader({url:"meteoscope-terrain://untrusted/5/1/12.png"}),/URL/);
assert.equal(terrainTileTemplate("relief"),"meteoscope-terrain://relief/{z}/{x}/{y}.png");
let registrations=0;const api={addProtocol(){registrations++;}};
registerTerrainTileProtocol(api);registerTerrainTileProtocol(api);assert.equal(registrations,1);
console.log("Terrain tile cache: byte identity, reuse, expiry, bounded storage, retry and cancellation OK");
