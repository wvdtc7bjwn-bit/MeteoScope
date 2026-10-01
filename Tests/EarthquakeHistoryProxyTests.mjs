import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/earthquake-history.js";

const originalFetch = globalThis.fetch;
const originalCaches = globalThis.caches;
const cache = new Map();
let requests = [];
let forms = [];
const row = { id: "20240101161000123", ot: "2024/01/01 16:10", name: "石川県能登地方", lat:"37.5",lon:"137.3",mag:"7.6",dep:"16 km",maxI:"震度７" };
let responsePayload = { res:[row], str:["検索結果地震数 ： 1 地震"] };
globalThis.caches = { default: {
  match: async (key) => cache.get(key.url)?.clone(),
  put: async (key,response) => { cache.set(key.url,response.clone()); }
} };
globalThis.fetch = async (url,init) => {
  requests.push(String(url)); forms.push(init.body);
  return Response.json(responsePayload);
};
const query = async (extra = "") => {
  const writes=[];
  const result=await onRequestGet({
    request:new Request(`https://meteoscope.test/api/earthquake-history?start=1976-09-29&end=2026-09-29${extra}`),
    waitUntil:promise=>writes.push(promise)
  });
  await Promise.all(writes);
  return result;
};
try {
  const filtered=await query("&minIntensity=5-&minMagnitude=7&maxDepth=50&sort=magnitude&keyword=能登");
  assert.equal(filtered.status,200);
  assert.equal(requests.length,1,"50年間も条件付きで1回の上流問い合わせ");
  const form=forms.at(-1);
  assert.equal(form.get("maxInt"),"A");
  assert.deepEqual(form.getAll("mag[]"),["7.0","9.9"]);
  assert.deepEqual(form.getAll("dep[]"),["000","050"]);
  assert.equal(form.get("Sort"),"S3");
  assert.equal(form.get("additionalC"),"true");
  assert.equal(form.get("epi[]"),"99","部分一致を震央完全一致へ誤変換しない");
  const payload=await filtered.json();
  assert.equal(payload.totalMatched,1);
  assert.equal(payload.limited,false);
  assert.equal(payload.records[0].lat,"37.5","地図用の座標を直接返す");
  await query("&minIntensity=5-&minMagnitude=7&maxDepth=50&sort=magnitude&keyword=能登");
  assert.equal(requests.length,1,"同じ条件はキャッシュされる");
  for(const variant of [
    "&minIntensity=5%2B&minMagnitude=7&maxDepth=50&sort=magnitude&keyword=能登",
    "&minIntensity=5-&minMagnitude=6&maxDepth=50&sort=magnitude&keyword=能登",
    "&minIntensity=5-&minMagnitude=7&maxDepth=100&sort=magnitude&keyword=能登",
    "&minIntensity=5-&minMagnitude=7&maxDepth=50&sort=oldest&keyword=能登",
    "&minIntensity=5-&minMagnitude=7&maxDepth=50&sort=magnitude&keyword=沖",
    "&minIntensity=5-&minMagnitude=7&maxDepth=50&sort=magnitude&keyword=能登&startTime=12:00"
  ]) await query(variant);
  assert.equal(cache.size,7,"震度・M・深さ・並び順・文字列・時刻ごとにキャッシュを分離する");
  for(const invalid of ["&minIntensity=wrong","&minMagnitude=-1","&maxDepth=1000","&sort=random","&startTime=25:00","&keyword="+encodeURIComponent("x".repeat(41))]) {
    const before=requests.length;
    assert.equal((await query(invalid)).status,400);
    assert.equal(requests.length,before,"入力不備では上流へ問い合わせない");
  }
  const invalidDate=await onRequestGet({request:new Request("https://meteoscope.test/api/earthquake-history?start=2025-02-30&end=2025-03-01")});
  assert.equal(invalidDate.status,400);
  responsePayload={res:"検索結果地震数 ： ありませんでした",str:["検索結果地震数 ： ありませんでした"]};
  const empty=await query("&keyword=empty");
  assert.equal(empty.status,200);
  assert.deepEqual((await empty.json()).records,[]);
  responsePayload={res:Array.from({length:1000},(_,i)=>({...row,id:String(i)})),str:["検索結果地震数 ： 上限を超えました （1000 地震を表示）"]};
  const capped=await (await query("&keyword=capped")).json();
  assert.equal(capped.limited,true);
  assert.equal(capped.limitExceeded,true);
  assert.equal(capped.totalMatched,null,"総件数不明を1000件に偽装しない");
  assert.equal(capped.upstreamQueryCount,1,"上限時もWorkerで自動再帰取得しない");
  responsePayload={res:Array.from({length:1000},(_,i)=>({...row,id:String(i)})),str:["検索結果地震数 ： 1000 地震"]};
  const exact=await (await query("&keyword=exact")).json();
  assert.equal(exact.limited,false,"ちょうど1000件は上限超過ではない");
  responsePayload={res:"検索条件を見直してください",str:[]};
  assert.equal((await query("&keyword=invalid-upstream")).status,400,"上流の検索入力エラーを障害へ変換しない");
  globalThis.fetch=async (url,init)=>new Promise((resolve,reject)=>init.signal.addEventListener("abort",()=>reject(init.signal.reason),{once:true}));
  const controller=new AbortController();
  const cancelled=onRequestGet({request:new Request("https://meteoscope.test/api/earthquake-history?start=2024-01-01&end=2024-01-02",{signal:controller.signal})});
  setTimeout(()=>controller.abort(),5);
  assert.equal((await cancelled).status,499,"下流の中断を上流通信にも伝える");
} finally {
  globalThis.fetch=originalFetch;globalThis.caches=originalCaches;
}
console.log("Earthquake history proxy tests passed.");
