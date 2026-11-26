import assert from "node:assert/strict";
import {test} from "node:test";
import {estimateLocalTemperature} from "../src/location/temperatureEstimation.js";
const observationTime="20261126150000", now=Date.parse("2026-11-26T15:05:00+09:00"), coordinates=[135,35];
const point=(id,x,y,elevation=100)=>({id,name:id,coordinates:[135+x,35+y],elevation,temperatureQuality:0,values:{temperature:15}});
const far=[point("a",.32,0),point("b",-.32,0),point("c",0,.30),point("d",0,-.30),point("e",.22,.22),point("f",-.22,-.22)];
const run=points=>estimateLocalTemperature({points,coordinates,elevation:100,observationTime,now});
for(const [name,near] of [["height",point("excluded",.01,0,2000)],["water",{...point("excluded",.01,0),landConnected:false}]]) {
  test(`excluded nearby ${name} point cannot improve selected-station quality`,()=>{
    const before=run(far),after=run([...far,near]);
    assert.equal(after.value,before.value);assert.deepEqual(after.stations,before.stations);
    assert.equal(after.confidence,before.confidence);assert.deepEqual(after.flags,before.flags);
    assert.equal(after.nearest.id,"excluded","reference observation remains compatible");
    assert.ok(after.nearestUsed.distanceKm>25);assert.ok(after.flags.includes("distant-stations"));
  });
  test(`excluded nearby ${name} point cannot bypass one-sided extrapolation`,()=>{
    const points=far.map((p,i)=>({...p,coordinates:[135.35+i*.01,35+i*.005]}));
    assert.equal(run(points).kind,"observed");
    const result=run([...points,near]);assert.equal(result.kind,"observed");
    assert.equal(result.nearest.id,"excluded");assert.ok(result.flags.includes("unsupported-extrapolation"));
  });
}
test("an eligible nearby point omitted by selection cannot improve quality",()=>{
  const a=run(far);
  // A different altitude reduces its influence enough to lose all six available slots.
  const near=point("unselected",.15,0,1200);
  const options={coordinates,elevation:100,observationTime,now,config:{maxStations:6}};
  const before=estimateLocalTemperature({...options,points:far});
  const after=estimateLocalTemperature({...options,points:[...far,near]});
  assert.deepEqual(after.stations,before.stations);assert.equal(after.value,a.value);
  assert.deepEqual(after.flags,before.flags);assert.equal(after.confidence,before.confidence);
});
test("contribution diagnostics distinguish interpolation, observation and unavailable",()=>{
  const r=run(far),weights=r.stations.map(s=>s.weight);
  assert.equal(r.diagnostics.maximumContribution,Math.max(...weights));
  assert.ok(Math.abs(r.diagnostics.effectiveStationCount-1/weights.reduce((s,a)=>s+a*a,0))<1e-10);
  const equal=run([point("n",0,.1),point("s",0,-.1),point("e",.1/Math.cos(35*Math.PI/180),0),point("w",-.1/Math.cos(35*Math.PI/180),0)]);
  assert.ok(Math.abs(equal.diagnostics.effectiveStationCount-4)<.001);
  const concentrated=run([point("near",.002,0),...far]);
  assert.ok(concentrated.diagnostics.maximumContribution>.99);assert.ok(concentrated.diagnostics.effectiveStationCount<1.02);
  const observed=run(far.slice(0,1));assert.equal(observed.diagnostics.maximumContribution,1);assert.equal(observed.diagnostics.effectiveStationCount,1);
  assert.equal(observed.nearestUsed,null);
  const empty=run([]);assert.equal(empty.diagnostics.maximumContribution,null);assert.equal(empty.diagnostics.effectiveStationCount,0);
});
