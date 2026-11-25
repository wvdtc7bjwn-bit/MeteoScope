import assert from "node:assert/strict";
import { createTerrainTileLoader, planTerrainTilePrefetch, registerTerrainTileProtocol, TERRAIN_PREFETCH_LIMIT } from "../src/map/terrainTiles.js";

const bounds = (w,s,e,n) => ({getWest:()=>w,getSouth:()=>s,getEast:()=>e,getNorth:()=>n});
const japan = bounds(134,33,136,35), europe = bounds(6,44,8,46);
const key = url => url.match(/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.png$/).slice(1);
for (const [area, zoom] of [[japan,6],[europe,6],[bounds(179,-20,-179,20),3],[bounds(-180,-85,180,85),0],[bounds(-5,80,5,90),7]]) {
  const candidates = planTerrainTilePrefetch(area,zoom);
  assert.ok(candidates.length <= TERRAIN_PREFETCH_LIMIT);
  assert.equal(new Set(candidates).size,candidates.length,"date-line wrapping never duplicates requests");
  for (const url of candidates) {
    const [kind,z,x,y] = key(url), n=2**Number(z);
    assert.ok(Number(x)>=0 && Number(x)<n && Number(y)>=0 && Number(y)<n);
    assert.ok(Number(z) <= (kind === "earthhillshade" ? 8 : kind === "relief" ? 15 : 16));
  }
}
const abroad = planTerrainTilePrefetch(europe,6);
assert.ok(abroad.length>0);
assert.ok(abroad.every(url => url.includes("earthhillshade")),"no Japanese terrain is prefetched in Europe");
const local = planTerrainTilePrefetch(japan,6);
assert.ok(local.some(url=>url.includes("/relief/")));
assert.ok(local.some(url=>url.includes("/hillshademap/")));
assert.ok(planTerrainTilePrefetch(japan,6,"japan").every(url=>!url.includes("earthhillshade")));
assert.ok(planTerrainTilePrefetch(japan,6,"global").every(url=>url.includes("earthhillshade")));
assert.deepEqual(planTerrainTilePrefetch(europe,6,"japan"),[],"Japan-only mode never prefetches global data abroad");
const japaneseRequests=[];
const japaneseLoader=createTerrainTileLoader({cacheStorage:null,fetcher:async url=>{
  japaneseRequests.push(url); return new Response(new Uint8Array([137,80,78,71,13,10,26,10]),{headers:{"cache-control":"max-age=3600"}});
}});
await japaneseLoader.prefetch(japan,6);
assert.ok(japaneseRequests.some(url=>url.includes("/xyz/relief/")));
assert.ok(japaneseRequests.some(url=>url.includes("/xyz/hillshademap/")));
const japaneseCount=japaneseRequests.length;
for (const url of local) await japaneseLoader({url},new AbortController());
assert.equal(japaneseRequests.length,japaneseCount,"Japanese terrain also reuses prefetched tiles without network requests");
assert.ok(planTerrainTilePrefetch(europe,15).every(url=>url.includes("/8/")),"overzoom reuses z8 global tiles");
assert.ok(planTerrainTilePrefetch(europe,4.75).every(url=>url.includes("/6/")),"fractional zoom matches the renderer's rounded raster LOD");
for (const url of abroad) {
  const [,z,x,y] = key(url).map((value,index)=>index ? Number(value) : value);
  const n=2**z;
  const left=Math.floor((6+180)/360*n),right=Math.floor((8+180)/360*n);
  const yAt=lat=>Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);
  assert.ok(!(x>=left && x<=right && y>=yAt(46) && y<=yAt(44)),"the foreground viewport is excluded from optional work");
}
assert.deepEqual(planTerrainTilePrefetch(bounds(0,0,NaN,5),6),[]);
assert.deepEqual(planTerrainTilePrefetch(bounds(-180,-85,181,85),1),[]);

const png=new Uint8Array([137,80,78,71,13,10,26,10,1,2,3]);
let calls=0, active=0, peak=0;
const fetched=[];
const loader=createTerrainTileLoader({cacheStorage:null,fetcher:async url=>{
  calls++; active++; peak=Math.max(peak,active); fetched.push(url);
  await new Promise(resolve=>setTimeout(resolve,1)); active--;
  return new Response(png,{headers:{"cache-control":"max-age=3600"}});
}});
await loader.prefetch(europe,6);
assert.equal(calls,abroad.length);
assert.equal(peak,2,"only two optional requests run together");
await loader({url:abroad[0]},new AbortController());
await loader.prefetch(europe,6);
assert.equal(calls,abroad.length,"panning to a prefetched tile needs no network request; repeated idle is free");
assert.ok(fetched.every(url=>url.startsWith("https://cyberjapandata.gsi.go.jp/xyz/earthhillshade/")));

// A foreground consumer joins an unfinished prefetch. Cancelling the background
// queue must preserve that consumer, abort the other flight and launch no more.
const flights=[];
const shared=createTerrainTileLoader({cacheStorage:null,fetcher:async(url,{signal})=>new Promise((resolve,reject)=>{
  flights.push({url,signal,finish:()=>resolve(new Response(png,{headers:{"cache-control":"max-age=3600"}}))});
  signal.addEventListener("abort",()=>reject(signal.reason),{once:true});
})});
const warming=shared.prefetch(europe,6);
await new Promise(resolve=>setTimeout(resolve,0));
assert.equal(flights.length,2);
const visible=shared({url:abroad[0]},new AbortController());
shared.cancelPrefetch();
assert.equal(flights[0].signal.aborted,false);
assert.equal(flights[1].signal.aborted,true);
flights[0].finish(); await visible; await warming;
assert.equal(flights.length,2,"cancelled work launches no remaining queued requests");
let registered;
const api={addProtocol(_name,fn){registered=fn;}};
assert.equal(registerTerrainTileProtocol(api),registered);
assert.equal(registerTerrainTileProtocol(api),registered,"renderer and prefetch share one loader and cache");
console.log("Global terrain prefetch: wrapped coordinates, native zooms, Japan coverage, bounded concurrency, reuse and foreground-safe cancellation passed");
