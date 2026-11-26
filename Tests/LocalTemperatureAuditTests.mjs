import assert from "node:assert/strict";
import {test} from "node:test";
import {auditTemperatureFrame,summarizeAudit} from "../scripts/audit-local-temperature.mjs";
const observationTime="20261126120000",now=Date.parse("2026-11-26T12:05:00+09:00");
const points=[[135,35],[135.05,35.05],[135.05,34.95],[134.95,35.05],[134.95,34.95]].map((coordinates,i)=>({
  id:String(i+1),name:`Reference ${i+1}`,coordinates,elevation:100,temperatureQuality:0,observationTime,values:{temperature:10}}));
test("audit removes each target, preserves exact application observations and has one row per valid station",()=>{
  const rows=auditTemperatureFrame({points,observationTime,now,connection:()=>true});assert.equal(rows.length,points.length);
  for(const row of rows){assert.ok(Math.abs(row.errorC)<1e-9);assert.equal(row.observedC,10);assert.ok(row.stations.every(s=>s.id!==row.stationId));}
});
test("bad quality is not a target; sparse/absent coverage is reported instead of erased",()=>{
  const two=[...points.slice(0,2),{...points[2],temperatureQuality:1}];
  const rows=auditTemperatureFrame({points:two,observationTime,now});assert.equal(rows.length,2);assert.ok(rows.every(r=>r.kind==="observed"));
  const single=auditTemperatureFrame({points:points.slice(0,1),observationTime,now});assert.equal(single[0].kind,"unavailable");assert.equal(single[0].errorC,null);
});
test("land-route screen is applied to training candidates and missing screen lowers confidence",()=>{
  const blocked=auditTemperatureFrame({points,observationTime,now,connection:()=>false});assert.ok(blocked.every(r=>r.kind==="observed"));
  const unknown=auditTemperatureFrame({points,observationTime,now});assert.ok(unknown.every(r=>r.flags.includes("land-screen-unavailable")));assert.ok(unknown.every(r=>r.confidence==="low"));
});
test("error summaries retain unavailable denominators and signed bias",()=>{
  const m=summarizeAudit([{errorC:-2},{errorC:1},{errorC:null}]);assert.equal(m.count,2);assert.equal(m.total,3);assert.equal(m.coverage,2/3);
  assert.equal(m.mae,1.5);assert.equal(m.bias,-.5);assert.equal(m.p95AbsoluteError,2);assert.equal(m.within1C,.5);
});
