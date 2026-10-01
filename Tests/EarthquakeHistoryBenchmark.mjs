// Deterministic comparison uses saved records as TEST FIXTURES, never as the live
// search route. --live checks only two baseline searches and sparse new searches.
import { readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const root = pathToFileURL(process.cwd() + "/");
const baseline = "b39b04d";
const live = process.argv.includes("--live");
const nativeFetch = globalThis.fetch;
const originalError = console.error;
const originalWarn = console.warn;
// Recursive-budget responses are expected for the baseline. Avoid printing
// data-URL module sources inside their stacks.
if (!live) {
  console.error = (message, error) => originalError(message, error?.message ?? "");
  console.warn = (message, error) => originalWarn(message, error?.message ?? "");
}
const manifest = JSON.parse(await readFile("public/data/earthquake-history/manifest.json", "utf8"));
const fixtures = live ? [] : (await Promise.all(manifest.years.map(({file}) => readFile(`public/data/earthquake-history/${file}`, "utf8").then(JSON.parse)))).flat();
const rank = value => ({felt:1,"1":1,"2":2,"3":3,"4":4,"5":5,"5-":5,"5+":6,"6":7,"6-":7,"6+":8,"7":9})[value] ?? 0;
const toLive = r => ({id:r.id,ot:r.t.replace(/^(\d{4})-(\d{2})-(\d{2})T/u,"$1/$2/$3 ").replace(/\+09:00$/u,""),name:r.p,lat:r.la,lon:r.lo,mag:r.m,dep:r.d == null ? "" : `${r.d} km`,maxI:`震度${r.i}`});
async function loadModule(file, version, key) {
  let source = version === "before" ? execFileSync("git",["show",`${baseline}:${file}`],{encoding:"utf8"}) : await readFile(file,"utf8");
  const base = new URL(file,root);
  source=source.replace(/from "(\.{1,2}\/[^"]+)"/gu,(_,relative)=>{
    const url=new URL(relative,base);
    if(relative.endsWith("jmaClient.js"))url.search=`bench=${key}`;
    return `from "${url.href}"`;
  });
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${key}`);
}
const cases = [
  {name:"7 days",filters:{startDate:"2026-09-22",endDate:"2026-09-28"}},
  {name:"1 year",filters:{startDate:"2025-01-01",endDate:"2025-12-31"}},
  {name:"50 years M7 / intensity5-",filters:{startDate:manifest.startDate,endDate:manifest.endDate,minMagnitude:"7",minIntensity:"5-"}},
  {name:"50 years intensity5-",filters:{startDate:manifest.startDate,endDate:manifest.endDate,minIntensity:"5-"}}
];
const summaries = [];
for(let index=0;index<cases.length;index++){
 const scenario=cases[index];const pair=[];
 for(const version of ["before","after"]){
  if(live && version==="before" && index>=2)continue;
  const key=`${version}-${index}-${Date.now()}`;
  const {searchEarthquakeHistory}=await loadModule("src/jma/earthquakeHistory.js",version,key);
  const proxy=live?null:await loadModule("functions/api/earthquake-history.js",version,key);
  let browserRequests=0,upstreamRequests=0,firstResultMs=null;
  const started=performance.now();
  globalThis.fetch=async(url,init={})=>{
   const u=new URL(String(url),"https://benchmark.invalid");
   if(u.hostname==="www.data.jma.go.jp"){
    upstreamRequests++;
    const f=init.body;
    const [startDate,startTime]=f.getAll("dateTimeF[]"),[endDate,endTime]=f.getAll("dateTimeT[]");
    const intensity=({A:"5-",B:"5+",C:"6-",D:"6+"})[f.get("maxInt")] ?? f.get("maxInt");
    const mag=Number(f.getAll("mag[]")[0]),depth=Number(f.getAll("dep[]")[1]);
    const rows=fixtures.filter(r=>r.t.slice(0,16)>=`${startDate}T${startTime}` && r.t.slice(0,16)<=`${endDate}T${endTime}`
      && rank(r.i)>=rank(intensity) && (mag===0 || r.m!=null && r.m>=mag) && (depth===999 || r.d!=null && r.d<=depth));
    rows.sort(f.get("Sort")==="S1"?(a,b)=>a.t.localeCompare(b.t):f.get("Sort")==="S2"?(a,b)=>rank(b.i)-rank(a.i)||b.t.localeCompare(a.t):
      f.get("Sort")==="S3"?(a,b)=>(b.m??-10)-(a.m??-10)||b.t.localeCompare(a.t):(a,b)=>b.t.localeCompare(a.t));
    await new Promise(resolve=>setTimeout(resolve,2));
    return Response.json({res:rows.length?rows.slice(0,1000).map(toLive):"検索結果地震数 ： ありませんでした",
      str:[rows.length>1000?"検索結果地震数 ： 上限を超えました":`検索結果地震数 ： ${rows.length} 地震`]});
   }
   browserRequests++;
   if(live){
    const base=version==="before"?"https://7fe9f303.meteoscope.pages.dev":"https://meteoscope.pages.dev";
    return nativeFetch(new URL(u.pathname+u.search,base),init);
   }
   if(u.pathname.startsWith("/data/earthquake-history/"))return new Response(await readFile("public"+u.pathname,"utf8"));
   return proxy.onRequestGet({request:new Request(u,{signal:init.signal}),waitUntil:p=>p});
  };
  try{
   const result=await searchEarthquakeHistory(scenario.filters,{onProgress:r=>{if(firstResultMs===null)firstResultMs=Math.round(performance.now()-started);}});
   const summary={scenario:scenario.name,version,mode:live?"live":"fixture / 2ms mock upstream delay",browserRequests,upstreamRequests:live?null:upstreamRequests,
    firstResultMs,completionMs:Math.round(performance.now()-started),items:result.items.length,totalMatched:result.totalMatched,complete:result.complete,fallbackYears:result.fallbackYears};
   console.log(JSON.stringify(summary));summaries.push(summary);pair.push(result);
  }finally{globalThis.fetch=nativeFetch;}
 }
 if(!live)assert.deepEqual(pair[0].items.map(r=>r.id),pair[1].items.map(r=>r.id),"displayed results must remain equivalent");
}
