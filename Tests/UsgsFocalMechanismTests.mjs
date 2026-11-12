import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseUsgsMechanism, matchUsgsEvent, tensorAmplitude, createUsgsMechanismClient } from '../src/earthquake/usgsFocalMechanism.js';
import { doubleCoupleAmplitude } from '../src/earthquake/focalMechanismArchive.js';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/focal-mechanism/usgs-us6000m0xl.json',import.meta.url)));
const event={originTime:'2024-01-01T07:10:00Z',coordinates:[137.3,37.5]};
const target={time:Date.parse(event.originTime),coordinates:event.coordinates};
const summary={...fixture,properties:{...fixture.properties,types:',moment-tensor,'}};
test('USGS observed Noto product: nodal planes, tensor, centroid distinct from origin',()=>{
 const r=parseUsgsMechanism(fixture);
 assert.equal(r.mw,7.5); assert.deepEqual(r.planes[0],[49.23,41.32,102.5]);
 assert.equal(r.time,Date.parse('2024-01-01T07:10:09.7Z'));
 assert.equal(r.centroidTime,Date.parse('2024-01-01T07:10:39.3Z'));
 assert.equal(r.tensor.length,6); assert.equal(Math.max(...r.tensor.map(Math.abs)),1);
});
test('matching rejects ambiguous, distant, missing and invalid events',()=>{
 assert.equal(matchUsgsEvent([summary],target).id,fixture.id);
 assert.equal(matchUsgsEvent([summary,{...summary,id:'another'}],target),null);
 assert.equal(matchUsgsEvent([summary],{...target,time:target.time+300000}),null);
 assert.equal(matchUsgsEvent([summary],{...target,coordinates:[140,40]}),null);
 assert.equal(matchUsgsEvent([{...summary,geometry:{coordinates:[null,37]}}],target),null);
});
test('exclude third-party/deleted products; no invented zero or invalid plane',()=>{
 for(const change of [{source:'gcmt'},{status:'DELETE'},{properties:{'beachball-source':'gcmt'}}]){
  const d=structuredClone(fixture); Object.assign(d.properties.products['moment-tensor'][0],change);
  assert.equal(parseUsgsMechanism(d),null);
 }
 const d=structuredClone(fixture),p=d.properties.products['moment-tensor'][0].properties;
 p['derived-magnitude']=' '; p['derived-depth']=null;
 let r=parseUsgsMechanism(d); assert.equal(r.mw,null); assert.equal(r.centroidDepth,null);
 for(const key of Object.keys(p)) if(key.startsWith('tensor-')) p[key]=null;
 p['nodal-plane-1-dip']=100; p['nodal-plane-2-rake']='';
 assert.equal(parseUsgsMechanism(d),null);
});
test('full tensor projection matches independent double-couple radiation in all quadrants',()=>{
 for(const plane of [[0,90,0],[90,45,90],[123,67,-42]]){
  const [st,di,ra]=plane.map(x=>x*Math.PI/180),s=Math.sin,c=Math.cos;
  const n=[-s(di)*s(st),s(di)*c(st),-c(di)];
  const v=[c(ra)*c(st)+c(di)*s(ra)*s(st),c(ra)*s(st)-c(di)*s(ra)*c(st),-s(ra)*s(di)];
  const M=(i,j)=>n[i]*v[j]+v[i]*n[j];
  const tensor=[M(2,2),M(0,0),M(1,1),M(2,0),-M(2,1),-M(0,1)];
  for(let y=-.9;y<=.9;y+=.15) for(let x=-.9;x<=.9;x+=.15){
   const expected=doubleCoupleAmplitude(plane,x,y), actual=tensorAmplitude(tensor,x,y);
   if(expected===null) assert.equal(actual,null); else assert.ok(Math.abs(expected-actual)<1e-12);
  }
 }
 assert.equal(tensorAmplitude([1,1,1,0,0,0],0,0),1);
 assert.equal(tensorAmplitude([-1,-1,-1,0,0,0],0,0),-1);
});
test('on-demand fetch caches and coalesces, expires, and avoids unnecessary detail queries',async()=>{
 let calls=0, now=0;
 const client=createUsgsMechanismClient(async url=>{ calls++; return {ok:true,json:async()=>url.includes('eventid=')?fixture:{features:[summary]}};},()=>now);
 const [a,b]=await Promise.all([client(event),client(event)]); assert.equal(a.id,b.id); assert.equal(calls,2);
 await client(event); assert.equal(calls,2); now=900001; await client(event); assert.equal(calls,4);
 let missingCalls=0;
 const missing=createUsgsMechanismClient(async()=>{missingCalls++;return {ok:true,json:async()=>({features:[]})};});
 assert.equal(await missing(event),null); await missing(event); assert.equal(missingCalls,1);
});
test('network failure is retryable; invalid event never requests',async()=>{
 let calls=0; const client=createUsgsMechanismClient(async()=>{calls++;throw Error('offline');});
 assert.equal(await client({}),null); assert.equal(calls,0);
 await assert.rejects(client(event)); await assert.rejects(client(event)); assert.equal(calls,2);
});
import { projectMechanismDirection, mechanismPlaneLine } from '../src/earthquake/usgsFocalMechanism.js';
test('Shinshiro USGS axes and radiation agree; plane traces remain inside the focal sphere',()=>{
 const d=JSON.parse(readFileSync(new URL('./fixtures/focal-mechanism/usgs-us7000twt0.json',import.meta.url)));
 const r=parseUsgsMechanism(d);
 assert.deepEqual(r.planes,[[182.97,41.13,-37],[302.55,66.68,-124.9]]);
 assert.deepEqual(r.axes.map(a=>a.name),['P','T']);
 for(const axis of r.axes) assert.equal(tensorAmplitude(r.tensor,axis.x,axis.y)>0,axis.name==='T');
 assert.ok(r.axes[0].y>0 && r.axes[1].y<0);
 assert.deepEqual(projectMechanismDirection(0,90),{x:0,y:-0});
 for(const plane of [...r.planes,[0,90,0],[0,0,0]]) {
  const line=mechanismPlaneLine(plane);
  assert.ok(line.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.hypot(p.x,p.y)<=1+1e-12));
  assert.ok(Math.abs(Math.hypot(line[0].x,line[0].y)-1)<1e-12);
 }
 const invalid=structuredClone(d);invalid.properties.products['moment-tensor']={};
 assert.equal(parseUsgsMechanism(invalid),null);
});
