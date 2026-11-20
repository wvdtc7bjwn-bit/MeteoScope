import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createTsunamiSourceStore,normalizeP2pTsunami,normalizeWolfxObservations} from '../src/tsunami/sourceStore.js';
import {createRealtimeEarthquakeClient} from '../src/earthquake/realtimeEarthquake.js';
import {createWolfxTsunamiObservationClient} from '../src/tsunami/wolfxObservations.js';
import {mergeRefreshedData} from '../src/app/refreshedData.js';
import {attachTsunamiMapData,buildTsunamiAreaLookup,buildTsunamiStationLookup} from '../src/jma/earthquakeXml.js';
const base=Date.parse('2026-11-18T01:00:00Z'), t=n=>new Date(base+n*60000).toISOString();let now=base+120*60000;
const p2p=(n,grade='Warning')=>({code:552,id:`p${n}`,time:t(n),issue:{time:t(n),type:'Focus'},cancelled:grade==='cleared',areas:grade==='cleared'?[]:[{name:'青森県太平洋沿岸',grade,maxHeight:{description:'３ｍ',value:3}}]});
const xml=(n,level='warning')=>({id:`x${n}`,xmlCode:'VTSE41',eventId:'E1',reportTimeRaw:t(n),status:'発表',areas:[{code:'201',name:'青森県太平洋沿岸',level,grade:level==='none'?'津波警報解除':'津波警報'}]});
const obs=(n,height='1m',extra={})=>({id:`o${n}`,source:'xml',xmlCode:'VTSE51',eventId:'E1',reportTimeRaw:t(n),status:'発表',areas:[],observations:[{id:'021001',stationCode:'021001',stationName:'八戸',maxHeight:height,maxHeightTime:t(n),offshore:false}],offshoreObservations:[],...extra});
const wolf=(n,height=1,extra={})=>({trusted:true,status:'active',validUntil:t(200),report:{product:'VTSE41',eventIds:['E1']},observations:[{id:`w${n}`,product:'VTSE51',time:t(n),status:'issued',observed:[{code:'201',name:'青森県太平洋沿岸',stations:[{code:'021001',name:'八戸',maxWave:{height,time:t(n)}}]}]}],...extra});
const store=createTsunamiSourceStore({now:()=>now});store.setConnection('connected');
assert(store.acceptP2p(p2p(1)));
assert.equal(store.snapshot().tsunami.highestLevel,'warning');
assert.equal(store.acceptP2p(p2p(0,'Watch')),false);
assert.equal(store.acceptXml([xml(0,'none')]),false,'an older XML all-clear cannot replace a live warning');
assert(store.acceptWolfx(wolf(2)));
assert.equal(store.snapshot().tsunami.observations[0].maxHeight,'1m');
assert.equal(store.snapshot().tsunami.reportTimeRaw,t(1),'observation issue time must not advance the warning watermark');
store.acceptXml([obs(1,'0.2m')]);
assert.equal(store.snapshot().tsunami.observations[0].maxHeight,'1m','late XML cannot replace newer Wolfx observation');
store.acceptXml([obs(3,'0.6m')]);
assert.equal(store.snapshot().tsunami.observations[0].maxHeight,'0.6m','a newer correction can legitimately reduce a measured value');
store.acceptWolfx(wolf(3,9));
assert.equal(store.snapshot().tsunami.observations[0].source,'xml','XML wins observation ties');
assert(store.acceptP2p(p2p(4,'cleared')));
const clear=store.snapshot();
store.acceptWolfx(wolf(5,1.2));store.acceptXml([xml(1),obs(2,'9m')]);store.acceptP2p(p2p(3),{history:true});
assert.equal(store.snapshot().tsunami.isCancellation,true,'observations, old XML and reconnected history never reactivate warnings');
store.setConnection('disconnected');assert.match(store.snapshot().tsunami.updateNotice,/最後に受信/);
assert.equal(store.snapshot().tsunami.isCancellation,true);
assert(store.acceptP2p(p2p(7,'Watch')));assert.equal(store.snapshot().tsunami.observations.length,0,'a new cycle cannot inherit old observations without matching event IDs');
store.acceptWolfx(wolf(8,0));assert.equal(store.snapshot().tsunami.observations[0].maxHeight,'0m');
assert.equal(store.snapshot().tsunami.highestLevel,'advisory','Wolfx contributes observations only');
for(const patch of [{trusted:false},{status:'unknown'},{status:'uninitialized'},{validUntil:t(100)},{validUntil:null}]) {
  assert.equal(normalizeWolfxObservations(wolf(9,9,patch),{now}),null);
  store.acceptWolfx(wolf(9,9,patch));
  assert.notEqual(store.snapshot().tsunami.observations[0]?.maxHeight,'9m','invalid observations are never adopted');
}
store.acceptWolfx(wolf(10,1,{status:'cleared'}));assert.equal(store.snapshot().tsunami.highestLevel,'advisory','Wolfx cleared status cannot erase P2P warnings');
const cancel=wolf(11);cancel.observations[0].status='cancelled';store.acceptWolfx(cancel);
assert.equal(store.snapshot().tsunami.observations.length,0,'product cancellation tombstone prevents old alternate-source values from resurfacing');
store.acceptXml([obs(9,'99m')]);assert.equal(store.snapshot().tsunami.observations.length,0);
store.acceptXml([obs(12,'1.5m')]);assert.equal(store.snapshot().tsunami.observations[0].maxHeight,'1.5m');
assert.equal(normalizeP2pTsunami(p2p(-2000),{now,history:true}),null);
assert.equal(normalizeP2pTsunami({...p2p(20),cancelled:false,areas:[]},{now}),null);
assert.equal(normalizeP2pTsunami({...p2p(20),training:true},{now}),null);
assert.equal(normalizeP2pTsunami(p2p(1000),{now}),null);
const restricted=wolf(13);restricted.observations[0].estimated=restricted.observations[0].observed;restricted.observations[0].observed=[];
assert.equal(normalizeWolfxObservations(restricted,{now})[0].observations.length,0,'coastal estimates are not labeled as observations');
const unrelated=createTsunamiSourceStore({now:()=>now});unrelated.acceptXml([xml(1),obs(2)]);unrelated.acceptXml([{...xml(4),eventId:'E2'}]);assert.equal(unrelated.snapshot().tsunami.observations.length,0);
const withdrawn={...xml(5),eventId:'E2',status:'取消'};unrelated.acceptXml([withdrawn]);assert.equal(unrelated.snapshot().tsunami.highestLevel,'unknown');assert.equal(unrelated.snapshot().tsunami.isCancellation,false,'report withdrawal differs from an all-clear');
const invalid=createTsunamiSourceStore({now:()=>now});invalid.acceptP2p(p2p(10));invalid.acceptXml([{...xml(11),areas:[]}]);assert.equal(invalid.snapshot().tsunami.reportTimeRaw,t(10));
const stale=createTsunamiSourceStore({now:()=>now});stale.acceptXml([xml(1)]);stale.acceptWolfx(wolf(2));now=base+201*60000;assert.equal(stale.snapshot().tsunami.observations[0].stale,true);stale.acceptWolfx(wolf(2,1,{validUntil:t(250)}));assert.equal(stale.snapshot().tsunami.observations[0].stale,false,'trust renewal refreshes freshness without changing old values');now=base+120*60000;
const older={earthquakes:[],...clear};const newer={earthquakes:[],...store.snapshot()};assert.equal(mergeRefreshedData('earthquake',newer,older).tsunami.highestLevel,'advisory','a completed older app refresh cannot replace a newer tsunami state');
const geo=JSON.parse(readFileSync(new URL('../public/data/jma-tsunami-forecast-areas.geojson',import.meta.url)));
const mapped=attachTsunamiMapData({...store.snapshot().tsunami,areas:normalizeP2pTsunami(p2p(7,'Watch'),{now}).areas},buildTsunamiAreaLookup(geo),buildTsunamiStationLookup({stations:[]}));
assert.equal(mapped.areas[0].code,'201');assert(mapped.mapFeatures.length>0,'name-only P2P areas must map to official coastal geometry');

// One existing socket receives 551 and 552. Delay initial tsunami history until
// after a new warning and all-clear; stale history must remain inert.
class Socket {static all=[];constructor(url){this.url=url;this.readyState=1;Socket.all.push(this);}close(){this.closed=true;}}
let releaseHistory;const received=createTsunamiSourceStore({now:()=>now});
const client=createRealtimeEarthquakeClient({now:()=>now,WebSocketImpl:Socket,fetchImpl:async url=>({ok:true,json:()=>url.includes('552')?new Promise(r=>{releaseHistory=r;}):Promise.resolve([])}),onTsunami:(data,meta)=>received.acceptP2p(data,meta)});
client.start();await Promise.resolve();const socket=Socket.all[0];socket.onopen();
socket.onmessage({data:JSON.stringify(p2p(10))});socket.onmessage({data:JSON.stringify(p2p(12,'cleared'))});releaseHistory([p2p(9)]);await new Promise(r=>setImmediate(r));
assert.equal(received.snapshot().tsunami.isCancellation,true);assert.equal(Socket.all.length,1);client.stop();assert(socket.closed);

// HTTP fallback coalesces calls, ignores responses after stop, and retries.
const timers=new Map();let timerId=0,requests=0,resolveFetch,updates=0;
const polling=createWolfxTsunamiObservationClient({setTimer:(fn,ms)=>{timers.set(++timerId,{fn,ms});return timerId;},clearTimer:id=>timers.delete(id),fetchImpl:()=>{requests++;return new Promise(r=>resolveFetch=r);},onUpdate:()=>updates++});
polling.start();polling.refresh();polling.setActive(true);assert.equal(requests,1);polling.stop();resolveFetch({ok:true,json:async()=>wolf(2)});await new Promise(r=>setImmediate(r));assert.equal(updates,0);assert.equal(timers.size,0);
polling.start();resolveFetch({ok:false,status:503});await new Promise(r=>setImmediate(r));assert([...timers.values()].some(t=>t.ms===30000));polling.stop();
console.log('Realtime tsunami: source ordering, clear/withdrawal, observation revisions, freshness, map, shared socket and HTTP recovery passed');


// The actual app merge waits for geometry; a later source revision must win.
const source=readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const raceStore=createTsunamiSourceStore({now:()=>now});raceStore.acceptP2p(p2p(1));let releaseMap;
const geometry=new Promise(resolve=>releaseMap=resolve);
const app=vm.createContext({tsunamiSourceStore:raceStore,wolfxTsunamiClient:null,
 loadTsunamiAreaLookup:()=>geometry,loadTsunamiStationLookup:async()=>new Map(),
 attachTsunamiMapData:tsunami=>({...tsunami,mapped:true})});
vm.runInContext(source.slice(source.indexOf('  async function mergeTsunamiSourceData('),source.indexOf('  async function mergeEarthquakeRealtimeData(')),app);
const pending=app.mergeTsunamiSourceData({});raceStore.acceptP2p(p2p(4,'cleared'));releaseMap(new Map());
assert.equal((await pending).tsunami.isCancellation,true,'delayed geometry cannot publish a pre-clear warning');
assert.equal((await pending).tsunamiRevision,raceStore.revision);
// Timeout and reconnect produce new requests, not an all-clear.
const recoveryTimers=new Map();let recoveryId=0,recoveryRequests=0;const states=[];
const recovery=createWolfxTsunamiObservationClient({setTimer:(fn,ms)=>{const id=++recoveryId;recoveryTimers.set(id,{fn:()=>{recoveryTimers.delete(id);fn();},ms});return id;},clearTimer:id=>recoveryTimers.delete(id),onStatus:s=>states.push(s),
 fetchImpl:(_url,{signal})=>{recoveryRequests++;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));}});
recovery.start();[...recoveryTimers.values()].find(t=>t.ms===15000).fn();await new Promise(r=>setImmediate(r));assert.deepEqual(states,['error']);
[...recoveryTimers.values()].find(t=>t.ms===300000).fn();assert.equal(recoveryRequests,2);recovery.stop();await new Promise(r=>setImmediate(r));
assert.equal(recoveryTimers.size,0);
console.log('Tsunami app race and timeout recovery passed');

const availability=createTsunamiSourceStore({now:()=>now});assert.equal(availability.snapshot().tsunamiStatus,'loading');
availability.acceptXml([],{status:'none'});assert.equal(availability.snapshot().tsunamiStatus,'not-reported');assert.equal(availability.snapshot().tsunami,null);
availability.acceptWolfx(wolf(2,1,{observations:[]}));assert.equal(availability.snapshot().tsunamiStatus,'checking','known Wolfx activity cannot be reported as no bulletin while primary sources are still catching up');
availability.acceptWolfx(wolf(2,1,{status:'expired',observations:[]}));assert.equal(availability.snapshot().tsunamiStatus,'not-reported');assert.equal(availability.snapshot().tsunami,null,'expired metadata never fabricates a warning cancellation');
const expiredOnly=createTsunamiSourceStore({now:()=>now});
expiredOnly.acceptXml([],{status:'unavailable'});
expiredOnly.acceptWolfx(wolf(2,1,{status:'expired',observations:[]}));
assert.equal(expiredOnly.snapshot().tsunamiStatus,'unavailable','expired Wolfx data alone cannot establish no current bulletin');
expiredOnly.acceptWolfx(wolf(2,1,{status:'none_reported',observations:[]}));
assert.equal(expiredOnly.snapshot().tsunamiStatus,'not-reported');
assert.equal(expiredOnly.acceptWolfx(wolf(2,1,{trusted:false,status:'unknown',observations:[]})),true);
assert.equal(expiredOnly.snapshot().tsunamiStatus,'unavailable','explicit trust loss overrides the previous unexpired deadline');
const trustLoss=createTsunamiSourceStore({now:()=>now});trustLoss.acceptWolfx(wolf(2));
trustLoss.acceptWolfx(wolf(2,1,{trusted:false,status:'unknown'}));
assert.equal(trustLoss.snapshot().tsunami.observations[0].stale,true,'retained observations immediately become stale after trust loss');
trustLoss.acceptWolfx(wolf(2));
assert.equal(trustLoss.snapshot().tsunami.observations[0].stale,false,'trust can be renewed without inventing a newer official observation');
let deadlineNow=now,deadlineId=0;
const deadlineTimers=new Map(),deadlineStates=[];
const deadlineStore=createTsunamiSourceStore({now:()=>deadlineNow});
let deadlinePayload=wolf(2,1,{validUntil:t(121)});
const deadlineClient=createWolfxTsunamiObservationClient({now:()=>deadlineNow,
 setTimer:(fn,ms)=>{const id=++deadlineId;deadlineTimers.set(id,{fn:()=>{deadlineTimers.delete(id);fn();},ms});return id;},clearTimer:id=>deadlineTimers.delete(id),
 fetchImpl:async()=>({ok:true,json:async()=>deadlinePayload}),onUpdate:payload=>deadlineStore.acceptWolfx(payload),onStatus:s=>deadlineStates.push(s)});
deadlineClient.start();await new Promise(r=>setImmediate(r));
assert.equal(deadlineStore.snapshot().tsunami.observations[0].stale,false);
const expiredTimer=[...deadlineTimers.values()].find(timer=>timer.ms===60001);
assert(expiredTimer,'the trust deadline is checked before the five-minute idle poll');
deadlinePayload={};await deadlineClient.refresh();
assert([...deadlineTimers.values()].includes(expiredTimer),'malformed later JSON must preserve the last valid response expiry timer');
deadlineNow+=60001;expiredTimer.fn();
assert.equal(deadlineStore.snapshot().tsunami.observations[0].stale,true);
assert.equal(deadlineStates.at(-1),'expired');
deadlinePayload=wolf(2,1,{validUntil:t(130)});await deadlineClient.refresh();
assert.equal(deadlineStore.snapshot().tsunami.observations[0].stale,false);
expiredTimer.fn();
assert.equal(deadlineStore.snapshot().tsunami.observations[0].stale,false,'a canceled old deadline cannot revoke renewed trust');
deadlineClient.stop();assert.equal(deadlineTimers.size,0,'stop releases polling and trust-deadline timers');
const panel=readFileSync(new URL('../src/ui/leftPanel.js',import.meta.url),'utf8');
const presentation=vm.createContext({getEarthquakeTsunamiState:()=>{throw new Error('current reception must not use an unrelated earthquake comment');}});
vm.runInContext(panel.slice(panel.indexOf('function getCurrentTsunamiState('),panel.indexOf('function buildTsunamiDedicatedDetailMarkup(')),presentation);
for(const status of ['loading','checking']){
 const state=presentation.getCurrentTsunamiState({tsunamiComment:'津波の心配はありません'},null,status);
 assert.equal(state.waiting,true);assert.equal(state.level,'unknown');assert.doesNotMatch(state.label,/確認できません|解除|心配なし/);
}
const notIssued=presentation.getCurrentTsunamiState(null,null,'not-reported');
assert.equal(notIssued.label,'現在、津波情報は発表されていません');assert.equal(notIssued.level,'none');assert.equal(notIssued.noBulletin,true);assert.equal(notIssued.tsunami,null);
console.log('Tsunami reception: loading, no bulletin, cross-check and transport error remain distinct');
