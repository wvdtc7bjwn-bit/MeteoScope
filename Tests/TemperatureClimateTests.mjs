import assert from "node:assert/strict";
import {test} from "node:test";
import {applyTemperatureClimate,shouldUseTemperatureClimate} from "../src/location/temperatureClimate.js";
import {createTemperatureClimateReader} from "../src/location/temperatureClimateData.js";
import {createLocalTemperatureController} from "../src/location/localTemperatureController.js";
import {buildLocalTemperatureDetails} from "../src/ui/localTemperatureView.js";

const coordinates=[140,36],elevation=100,environment={sea:.3,urban:.2,forest:.2,farm:.3,water:0,meanElevation:100,relief:50,slope:1};
const points=Array.from({length:16},(_,i)=>({id:String(10000+i),coordinates:[140+(i%4-1.5)*.1,36+(Math.floor(i/4)-1.5)*.1],
  elevation,sea:i%2?.5:0,urban:.2,normal:10+(i%2?2.5:0)}));
const stations=points.filter(s=>s.sea===0).slice(0,4).map(s=>({id:s.id,weight:.25}));
const base={kind:"estimated",method:"fixed-idw",value:10,stations,flags:["outside-station-hull"],diagnostics:{},observationTime:"2026-11-26T10:00:00.000Z"};
const options={coordinates,elevation,environment,climate:{points,period:"1991-2020",date:"20261126"}};
test("historical regional contrast adjusts only eligible estimates and never twice",()=>{
  const adjusted=applyTemperatureClimate(base,options);
  assert.equal(adjusted.climateAdjusted,true);assert.ok(adjusted.value>base.value);assert.ok(adjusted.value<=base.value+2);
  assert.equal(applyTemperatureClimate(adjusted,options),adjusted);
  assert.equal(applyTemperatureClimate({...base,kind:"observed"},options).climateAdjusted,undefined);
  const inland={...base,flags:[]};assert.equal(shouldUseTemperatureClimate(inland,{sea:0,urban:.2}),false);
  assert.equal(applyTemperatureClimate(inland,{...options,environment:{...environment,sea:0}}),inland);
  assert.equal(applyTemperatureClimate(base,{...options,climate:{...options.climate,date:"20261125"}}),base);
  assert.match(buildLocalTemperatureDetails({...adjusted,nearest:null,stationCount:4,targetElevation:100}),/平年差/);
});
test("constant background cancels; real zero, duplicate and missing values do not invent contrast",()=>{
  const constant={...options,climate:{points:points.map(s=>({...s,normal:0})),period:"1991-2020"}};
  assert.ok(Math.abs(applyTemperatureClimate(base,constant).value-base.value)<1e-10);
  assert.equal(applyTemperatureClimate(base,{...options,elevation:null}),base);
  assert.equal(applyTemperatureClimate(base,{...options,environment:null}),base);
  assert.equal(applyTemperatureClimate(base,{...options,climate:{points:points.slice(0,7)}}),base);
  assert.equal(applyTemperatureClimate(base,{...options,climate:{points:points.filter(p=>p.id!==stations[0].id)}}),base);
  const once=applyTemperatureClimate(base,options);
  const duplicates=applyTemperatureClimate(base,{...options,climate:{points:[...points,...points]}});
  assert.equal(once.value,duplicates.value);
  const huge={...options,climate:{points:points.map(s=>({...s,normal:s.sea*1000}))}};
  const limited=applyTemperatureClimate(base,huge);assert.equal(limited.value,12);assert.equal(limited.confidence,"low");assert.ok(limited.flags.includes("climate-correction-limited"));
});
const normalData={schema:2,quality:"RMK=8",period:"1991-2020",stations:Object.fromEntries(points.map(s=>[s.id,
  {maximum:Array(372).fill(s.normal*10),minimum:Array(372).fill(s.normal*10)}]))};
const metadata={schema:1,period:"1991-2020",stations:points.map(s=>[s.id,...s.coordinates,s.elevation,s.sea,s.urban])};
test("normal data is shared by dates, bounded and retried only after backoff; cancellation does not create values",async()=>{
  let requests=0,loads=0,clock=0,offline=true;
  const read=createTemperatureClimateReader({now:()=>clock,loadNormals:async()=>{loads++;return normalData;},fetcher:async()=>{requests++;if(offline)throw Error("offline");return Response.json(metadata);}});
  assert.equal(await read("bad"),null);assert.equal(requests,0);
  await assert.rejects(read("20261126190000"),/offline/);offline=false;
  await assert.rejects(read("20261126190000"),/offline/);assert.equal(requests,1);
  clock+=15*60000;
  const [a,b]=await Promise.all([read("20261126190000"),read("20261126200000")]);assert.equal(a,b);assert.equal(requests,2);
  assert.equal(a.points.length,16);assert.equal(a.date,"20261126");
  await read("20261127190000");assert.equal(requests,2);assert.equal(loads,2);
  const cancel=new AbortController();cancel.abort();assert.equal(await read("20261128190000",{signal:cancel.signal}),null);
});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test("controller publishes baseline before climate I/O, ignores a late result after OFF, and reuses the anchor",async()=>{
  let complete,calls=0,changed=[];
  const now=Date.parse("2026-11-26T10:05:00.000Z"),mapTime="20261126190000";
  const live=points.map(s=>({...s,temperatureQuality:0,values:{temperature:10},observationTime:mapTime}));
  const input={enabled:true,data:{mapTime,points:live},location:{status:"found",coordinates}};
  const controller=createLocalTemperatureController({now:()=>now,readElevation:async()=>({elevation}),loadLand:async()=>()=>true,
    readEnvironment:async coords=>coords.map(()=>environment),readClimate:()=>{calls++;return new Promise(resolve=>{complete=resolve;});},onChange:r=>changed.push(r)});
  controller.update(input);await settle();assert.equal(changed.length,1);assert.equal(changed[0].kind,"estimated");assert.equal(changed[0].climateAdjusted,undefined);assert.equal(calls,1);
  controller.update({...input,enabled:false});complete(options.climate);await settle();assert.equal(changed.length,1);
  controller.update(input);await settle();complete(options.climate);await settle();assert.equal(changed.at(-1).climateAdjusted,true);
  const saved=controller.update(input);for(let i=0;i<5;i++)assert.equal(controller.update(input),saved);assert.equal(calls,2);
  controller.update({...input,data:{...input.data,points:live.slice(0,2)}});await settle();assert.equal(calls,2);
  controller.update({...input,location:{status:"found",coordinates:live[0].coordinates}});await settle();assert.equal(calls,2);
});
