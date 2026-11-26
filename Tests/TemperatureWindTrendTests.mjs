import assert from "node:assert/strict";
import {test} from "node:test";
import {windTrendContext,physicalWindTrendCandidates,observedMotion,excludeTemperatureTarget} from "../scripts/temperatureWindTrendCandidates.mjs";
import {temperatureSnapshot} from "../src/location/temperatureWeather.js";
import {buildAmedasPoints} from "../src/jma/amedas.js";
const timeMs=Date.parse("2026-11-26T08:00:00+09:00"),coordinates=[140,36],elevation=100;
const environment={sea:.1,urban:.3,forest:.3,meanElevation:100,relief:50,slope:2};
const points=Array.from({length:8},(_,i)=>({id:String(i+1),coordinates:[140+.1*Math.sin(i*Math.PI/4),36+.1*Math.cos(i*Math.PI/4)],
 elevation,value:10,temperatureQuality:0,values:{temperature:10,wind:4},windDirection:16,environment}));
const entries=points.map(point=>({point,corrected:10,weight:1/8}));
function past(minutes,temperature=10-minutes/30){return temperatureSnapshot(points.map(p=>({...p,values:{...p.values,temperature}})),timeMs-minutes*60000);}
const input={entries,coordinates,elevation,environment,timeMs,history:[past(30),past(60)],lapseRate:.0065};

test("FROM bearings move air in the opposite direction; calm never becomes a north wind",()=>{
 assert.ok(observedMotion(4,16).v<0);assert.ok(observedMotion(4,8).v>0);
 assert.ok(Math.abs(observedMotion(4,16).u)<1e-10);assert.deepEqual(observedMotion(.2,0),{speed:.2,u:0,v:0});
 assert.equal(observedMotion(2,0),null);assert.equal(observedMotion(null,16),null);assert.equal(observedMotion(3,17),null);
});
test("uniform observed warming produces no invented spatial adjustment",()=>{
 const context=windTrendContext(input);assert.ok(context);assert.equal(context.morning,true);
 assert.ok(Math.abs(context.short.mean-2)<1e-10);assert.ok(Math.abs(context.long.mean-2)<1e-10);
 const candidate=physicalWindTrendCandidates(input,context);
 for(const v of Object.values(candidate))assert.ok(Math.abs(v)<1e-9);
});
test("own historical temperature and wind are removed, and arbitrary unused own data cannot affect features",()=>{
 const own={temperature:999,speed:99,direction:8};
 const dirty=input.history.map(f=>({...f,values:new Map([...f.values,["target",own]])}));
 const held=excludeTemperatureTarget(dirty,"target");assert.ok(held.every(f=>!f.values.has("target")));
 assert.deepEqual(windTrendContext({...input,history:held}).features,windTrendContext(input).features);
 assert.ok(dirty.every(f=>f.values.has("target")),"removal does not mutate another fold");
});
test("future, stale, missing-history, height and wind-quality failures keep the baseline",()=>{
 for(const history of [[],[past(30)],[{...past(30),timeMs:timeMs+60000},past(60)],[past(90),past(120)]])assert.equal(windTrendContext({...input,history}),null);
 assert.equal(windTrendContext({...input,elevation:null}),null);
 const invalidEntries=entries.map(e=>({...e,point:{...e.point,values:{...e.point.values,wind:null}}}));
 assert.equal(windTrendContext({...input,entries:invalidEntries}),null);
 assert.deepEqual(physicalWindTrendCandidates(input,null),{legacy:0,advection30:0,advection60:0,trend:0});
 const [bad]=buildAmedasPoints({a:{temp:[10,0],wind:[4,1],windDirection:[16,1]}},{a:{lat:[36,0],lon:[140,0],alt:100}},null,"20261126080000");
 assert.equal(bad.values.wind,null);assert.equal(bad.windDirection,null);
});
test("rapidly diverging temperatures and winds still produce bounded research corrections",()=>{
 const changed={...input,history:[past(30,-5),past(60,25)]};const context=windTrendContext(changed);
 assert.ok(Object.values(context.features).every(Number.isFinite));
 for(const v of Object.values(physicalWindTrendCandidates(changed,context)))assert.ok(Number.isFinite(v)&&Math.abs(v)<=2+1e-9);
});
