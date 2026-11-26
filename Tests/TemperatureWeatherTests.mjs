import assert from "node:assert/strict";
import { test } from "node:test";
import { temperatureSnapshot, createTemperatureHistory, selectTemperatureHistory, temperatureWeatherContext, applyTemperatureWeather } from "../src/location/temperatureWeather.js";
import { estimateLocalTemperature } from "../src/location/temperatureEstimation.js";
import { createLocalTemperatureController } from "../src/location/localTemperatureController.js";
import { buildLocalTemperatureDetails } from "../src/ui/localTemperatureView.js";
import { buildAmedasPoints } from "../src/jma/amedas.js";

const minute = 60000, time = Date.parse("2026-11-25T15:30:00+09:00");
const profile = { urban: .5, forest: .5, farm: 0, water: 0, sea: 0, meanElevation: 100, relief: 100, slope: 3 };
const points = Array.from({ length: 8 }, (_, i) => ({ id: String(i), name: `Test ${i}`, coordinates: [135 + .1 * Math.sin(i*Math.PI/4), 35 + .1 * Math.cos(i*Math.PI/4)],
  elevation: 100, temperatureQuality: 0, value: i===7 ? 10 : 15, values: { temperature: i===7 ? 10 : 15, wind: 4 },
  windDirection: i===7 ? 8 : 16, environment: i===7 ? { ...profile, urban: 0, forest: 0, sea: 1 } : profile, landConnected: true }));
const entries = points.map(point => ({ point, weight: 1/8, corrected: point.value }));
const earlier = temperatureSnapshot(points, time-30*minute);
const contextInput = { entries, coordinates: [135,35], elevation: 100, environment: profile, timeMs: time, history: [earlier] };
const estimatorInput = { points, coordinates: [135,35], elevation: 100, environment: profile, observationTime: "20261125153000", now: time+5*minute,config:{weatherEnabled:true} };

test("wind vectors average through north; opposite-flow terrain receives a bounded penalty", () => {
  const context = temperatureWeatherContext(contextInput);
  assert.ok(context.regional.y > .99);
  assert.ok(context.features[7].windContrast > 0);
  const adjusted = applyTemperatureWeather(entries, context, { weatherWindStrength: .5 });
  assert.ok(adjusted[7].weight < entries[7].weight);
  adjusted.forEach((entry,i) => { assert.ok(entry.weight >= entries[i].weight*.5); assert.ok(entry.weight <= entries[i].weight); assert.equal(entry.corrected,entries[i].corrected); });
  assert.deepEqual(applyTemperatureWeather(entries, context, { weatherWindStrength: 0 }), entries);
  assert.deepEqual(applyTemperatureWeather(entries, context, { weatherWindStrength: 999 }), adjusted);
  assert.deepEqual(applyTemperatureWeather(entries, context, { weatherWindStrength: NaN }), entries);
});

test("no adjustment without usable history, coherent persistent wind or terrain context", () => {
  for (const input of [
    { ...contextInput, history: [] }, { ...contextInput, history: [{ ...earlier, timeMs: time+minute }] },
    { ...contextInput, environment: null },
    { ...contextInput, entries: entries.map(entry => ({ ...entry, point: { ...entry.point, windDirection: 0, values: { ...entry.point.values, wind: .1 } } })) },
    { ...contextInput, history: [temperatureSnapshot(points.map(point => ({ ...point, windDirection: 8 })), time-30*minute)] }
  ]) {
    const context = temperatureWeatherContext(input);
    assert.deepEqual(applyTemperatureWeather(input.entries, context, { weatherWindStrength: .5 }), input.entries);
  }
});

test("circular direction handling and calm/missing/invalid winds are not interpreted as north", () => {
  const northPoints = points.map((point,i) => ({ ...point, windDirection: i%2 ? 1 : 16 }));
  const northEntries = entries.map((entry,i) => ({ ...entry, point: northPoints[i] }));
  const c = temperatureWeatherContext({ ...contextInput, entries: northEntries, history: [temperatureSnapshot(northPoints,time-30*minute)] });
  assert.ok(c.regional.coherence > .98); assert.ok(c.regional.y > .97);
  const badPoints = points.map((point,i) => ({ ...point, windDirection: [null,0,17,-1,NaN,1.2,undefined,16][i], values: { ...point.values, wind: i===7 ? null : 4 } }));
  const badEntries = entries.map((entry,i) => ({ ...entry, point: badPoints[i] }));
  const bad = temperatureWeatherContext({ ...contextInput, entries: badEntries });
  assert.equal(bad.regional.n,0); assert.ok(bad.features.every(feature => feature.windContrast===0));
});

test("snapshots discard invalid quality and mismatched timestamps; selection excludes present/future/stale frames", () => {
  const invalid = points.map((point,i) => ({ ...point, temperatureQuality: i===0 ? null : 0,
    observationTime: i===1 ? "20261125152000" : "20261125153000" }));
  const snapshot = temperatureSnapshot(invalid,time);
  assert.equal(snapshot.values.size,6);
  assert.equal(temperatureSnapshot(points,NaN),null);
  const history = [time+minute,time,time-10*minute,time-25*minute,time-30*minute,time-61*minute].map(timeMs => ({ ...earlier,timeMs }));
  assert.equal(selectTemperatureHistory(history,time).timeMs,time-30*minute);
  assert.equal(selectTemperatureHistory(history.slice(0,3),time),null);
});

test("history deduplicates frames, rejects out-of-order updates, stays bounded, and clears", () => {
  const history = createTemperatureHistory();
  for (let i=0;i<25;i++) history.add([...points],time+i*10*minute);
  const latest=time+24*10*minute;
  assert.ok(history.before(latest+minute).length<=10);
  assert.ok(history.before(latest+minute).every(frame => latest-frame.timeMs<=90*minute));
  history.add([...points],time); assert.ok(!history.before(latest+minute).some(frame => frame.timeMs===time));
  history.add([...points],latest); assert.equal(history.before(latest+minute).filter(frame => frame.timeMs===latest).length,1);
  const sample=history.before(latest+minute)[0].values.values().next().value;
  assert.ok(!("coordinates" in sample));
  history.clear();assert.deepEqual(history.before(latest+minute),[]);
});

test("production estimates reuse observed wind history, retain fallback guards, and never change lapse or timestamps", () => {
  const baseline=estimateLocalTemperature({ ...estimatorInput,config:{weatherEnabled:false} });
  const cold=estimateLocalTemperature(estimatorInput);
  assert.equal(cold.value,baseline.value);assert.equal(cold.weatherAdjusted,false);
  const result=estimateLocalTemperature({ ...estimatorInput,history:[earlier] });
  assert.equal(result.kind,"estimated");assert.equal(result.weatherAdjusted,true);assert.ok(result.value>baseline.value);
  assert.equal(result.lapseRate,baseline.lapseRate);assert.equal(result.observationTime,baseline.observationTime);
  assert.ok(Math.abs(result.stations.reduce((sum,station)=>sum+station.weight,0)-1)<1e-12);
  assert.equal(estimateLocalTemperature({ ...estimatorInput,history:[earlier],now:time+31*minute }).kind,"unavailable");
  const observed=estimateLocalTemperature({ ...estimatorInput,history:[earlier],coordinates:points[0].coordinates });
  assert.equal(observed.kind,"observed");assert.equal(observed.value,points[0].value);
  const noHeight=estimateLocalTemperature({ ...estimatorInput,elevation:null,history:[earlier] });
  assert.equal(noHeight.weatherAdjusted,false);assert.equal(noHeight.method,"idw");
});

test("unused station history and historical temperatures cannot leak into the adopted wind-only estimate", () => {
  const reference=estimateLocalTemperature({...estimatorInput,history:[earlier]});
  const values=new Map([...earlier.values].map(([id,value])=>[id,{...value,temperature:999}]));
  values.set("held-out",{temperature:-999,speed:100,direction:8});
  const result=estimateLocalTemperature({...estimatorInput,history:[{...earlier,values}]});
  assert.equal(result.value,reference.value);assert.deepEqual(result.stations,reference.stations);
});

test("JMA wind quality filtering remains shared with existing observations", () => {
  const table={a:{lat:[35,0],lon:[135,0],alt:100,kjName:"Test"}};
  const [bad]=buildAmedasPoints({a:{temp:[10,0],wind:[5,1],windDirection:[16,1]}},table,null,"20261125153000");
  assert.equal(bad.values.wind,null);assert.equal(bad.windDirection,null);
});

test("controller leaves the rejected wind adjustment disabled even with earlier observations", async () => {
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  let clock=time-25*minute,reads=0;
  const controller=createLocalTemperatureController({ now:()=>clock,readElevation:async()=>{reads++;return {elevation:100};},
    loadLand:async()=>()=>true,readEnvironment:async coordinates=>coordinates.map((_,i)=>i===8?points[7].environment:profile) });
  const input={enabled:true,data:{mapTime:"20261125150000",points:[...points]},location:{status:"found",coordinates:[135,35]}};
  controller.update(input);await settle();assert.equal(controller.update(input).weatherAdjusted,false);
  clock=time+5*minute;
  const latest={...input,data:{mapTime:"20261125153000",points:[...points]}};
  controller.update(latest);await settle();const result=controller.update(latest);
  assert.equal(result.weatherAdjusted,false);assert.equal(reads,2);
  for(let i=0;i<10;i++)assert.equal(controller.update(latest),result);
  assert.equal(reads,2);
  controller.update({enabled:false});controller.update(latest);await settle();
  assert.equal(controller.update(latest).weatherAdjusted,false);assert.equal(reads,3);
});

test("the application default retains baseline results with or without wind history", () => {
  const baseline=estimateLocalTemperature({...estimatorInput,config:{weatherEnabled:false}});
  const actual=estimateLocalTemperature({...estimatorInput,config:{},history:[earlier]});
  assert.equal(actual.weatherAdjusted,false);assert.equal(actual.value,baseline.value);
  assert.deepEqual(actual.stations,baseline.stations);assert.equal(actual.diagnostics.weather,null);
});

test("details identify wind weighting without claiming a wind measurement at the current location", () => {
  const result=estimateLocalTemperature({...estimatorInput,history:[earlier]});
  const html=buildLocalTemperatureDetails(result);
  assert.match(html,/周辺環境と風/);assert.match(html,/現在地の風を実測したものではありません/);assert.match(html,/15:00/);
  const plain=buildLocalTemperatureDetails(estimateLocalTemperature(estimatorInput));
  assert.ok(!plain.includes("周辺観測点から求めた風速"));
});
