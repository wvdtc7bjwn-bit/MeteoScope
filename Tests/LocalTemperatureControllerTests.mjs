import assert from "node:assert/strict";
import { test } from "node:test";
import { createLocalTemperatureController as createController } from "../src/location/localTemperatureController.js";
import { buildLocalTemperatureButton, buildLocalTemperatureDetails } from "../src/ui/localTemperatureView.js";
import { readFile } from "node:fs/promises";
const now = Date.parse("2026-11-25T15:05:00+09:00");
const data = { mapTime: "20261125150000", points: Array.from({ length: 4 }, (_, i) => ({ id: String(i), name: "<test>", coordinates: [135 + (i % 2 ? .1 : -.1), 35 + (i < 2 ? .1 : -.1)], elevation: 100, temperatureQuality: 0, values: { temperature: 15 } })) };
const input = { enabled: true, data, location: { status: "found", coordinates: [135,35] } };
const settle = () => new Promise(resolve => setImmediate(resolve));
const createLocalTemperatureController = options => createController({ readEnvironment: async coordinates => coordinates.map(()=>null), ...options });
test("no I/O when disabled, no repeated computation on rendering; data refresh recomputes", async () => {
  let reads = 0, changes = 0, clock = now;
  const controller = createLocalTemperatureController({ now: () => clock, readElevation: async () => { reads++; return { elevation: 100 }; }, loadLand: async () => () => true, onChange: () => changes++ });
  assert.equal(controller.update({ ...input, enabled: false }), null); assert.equal(reads, 0);
  assert.equal(controller.update(input).kind, "observed"); await settle();
  const estimated = controller.update(input); assert.equal(estimated.kind, "estimated");
  for (let i = 0; i < 10; i++) assert.equal(controller.update(input), estimated);
  assert.equal(reads, 1); assert.equal(changes, 1);
  clock += 60000; assert.equal(controller.update(input), estimated); assert.equal(reads, 1);
  controller.update({ ...input, data: { ...data, points: [...data.points] } }); await settle(); assert.equal(changes, 2);
  clock += 31 * 60000; assert.equal(controller.update(input).kind, "unavailable");
});
test("late result cannot revive a disabled setting or a previous location", async () => {
  let resolve, signal, changes = 0;
  const controller = createLocalTemperatureController({ now: () => now, readElevation: (coords, options) => { signal = options.signal; return new Promise(r => { resolve = r; }); }, loadLand: async () => () => true, onChange: () => changes++ });
  controller.update(input); controller.update({ ...input, enabled: false }); assert.equal(signal.aborted, true);
  resolve({ elevation: 100 }); await settle(); assert.equal(changes, 0);
});
test("environment context is joined by station ID, refresh retains the estimate, sparse/coincident skip optional I/O", async () => {
  const profile={urban:.8,forest:.1,farm:.1,water:0,sea:0,meanElevation:100,relief:20,slope:1};
  let calls=0, wait;
  const controller=createLocalTemperatureController({now:()=>now,readElevation:async()=>({elevation:100}),loadLand:async()=>()=>true,
    readEnvironment:async coordinates=>{calls++;if(calls===2) await new Promise(r=>{wait=r;});return coordinates.map(()=>profile);}});
  controller.update(input);await settle();assert.equal(controller.update(input).environmentAdjusted,true);
  const refreshed={...input,data:{...data,points:[...data.points]}};
  const pending=controller.update(refreshed);assert.equal(pending.kind,"estimated");assert.equal(pending.updating,true);
  wait();await settle();assert.equal(controller.update(refreshed).loading,false);
  controller.update({...input,data:{...data,points:data.points.slice(0,2)}});assert.equal(calls,2);
  controller.update({...input,location:{status:"found",coordinates:data.points[0].coordinates}});assert.equal(calls,2);
});
test("small movements accumulate from the calculation anchor, and old observations lose confidence", async () => {
  let clock = now, reads = 0;
  const controller = createLocalTemperatureController({ now: () => clock, readElevation: async () => { reads++; return { elevation: 100 }; }, loadLand: async () => () => true });
  controller.update(input); await settle();
  clock += 60000;
  controller.update({ ...input, location: { status: "found", coordinates: [135,35.0007] } }); assert.equal(reads, 1);
  clock += 60000;
  controller.update({ ...input, location: { status: "found", coordinates: [135,35.0014] } }); await settle(); assert.equal(reads, 2);
  clock += 10 * 60000;
  const aged = controller.update({ ...input, location: { status: "found", coordinates: [135,35.0014] } });
  assert.ok(aged.flags.includes("aging-observations")); assert.equal(aged.confidence, "low");
});
test("details distinguish observed/estimated and escape station names, including zero", () => {
  const result = { kind: "estimated", method: "fixed-idw", value: 0, nearest: { name: "<script>", value: 1, distanceKm: 2 }, targetElevation: 0, stationCount: 4, confidence: "low", flags: [], stations: [], observationTime: "2026-11-25T06:00:00.000Z" };
  assert.match(buildLocalTemperatureButton(result), /推定 0.0℃/);
  const html = buildLocalTemperatureDetails(result); assert.match(html, /標高補正済み/); assert.match(html, /&lt;script&gt;/); assert.ok(!html.includes("<script>"));
  assert.match(buildLocalTemperatureDetails({ ...result, kind: "observed", method: "nearest" }), /観測点の実測値/);
});
test("fallback is explicitly observed, with station altitude and a prominent distinction from local estimates",()=>{
  const result={kind:"observed",method:"nearest",value:4,nearest:{name:"Reference",value:4,elevation:860,distanceKm:15},targetElevation:3000,
    stationCount:1,confidence:"low",flags:["height-extrapolation"],stations:[]};
  assert.match(buildLocalTemperatureButton(result),/Reference 実測 4.0℃/);
  const html=buildLocalTemperatureDetails(result);assert.match(html,/現在地の推定気温は表示できません/);assert.match(html,/860 m/);
  assert.ok(!buildLocalTemperatureDetails({...result,loading:true}).includes("現在地の推定気温は表示できません"));
});
test("early access gates runtime work and settings toggle uses the existing switch", async () => {
  const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
  assert.match(app, /enabled: earlyAccessEnabled && temperatureEstimationEnabled/);
  const settings = await readFile(new URL("../src/ui/settingsModal.js", import.meta.url), "utf8");
  assert.match(settings, /estimation.disabled = !state.earlyAccessEnabled/);
});
