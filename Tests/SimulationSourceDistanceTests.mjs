import assert from "node:assert/strict";
import {pointSourceFaultDistance, rectangularFaultDistance, activeFaultSourceDistances, simulationActiveFaultDistances} from "../src/simulation/sourceDistance.js";
import {estimateSimulationIntensity, estimateReferenceIntensity} from "../src/simulation/intensityModel.js";
const radius = 10 ** (.5 * 7 - 1.85) / 2;
assert.ok(Math.abs(pointSourceFaultDistance(7, 10, 100) - (100 - radius)) < 1e-10);
assert.equal(pointSourceFaultDistance(7, 10, 12), 3);
assert.equal(pointSourceFaultDistance(7, 0, 0), 3, "the shallow reference method has a 3 km floor");
assert.equal(pointSourceFaultDistance(7, 150, 200), 200);
assert.equal(pointSourceFaultDistance(9, 590, 650), 650, "deep path keeps the physical distance");
assert.equal(pointSourceFaultDistance(9.5, 10, 300), pointSourceFaultDistance(8.3, 10, 300), "unknown giant sources use a bounded footprint");
assert.ok(pointSourceFaultDistance(7, 149.999, 200) > 199.99);
assert.throws(() => pointSourceFaultDistance(7, 10, NaN), RangeError);
const fault = {LON: 135, LAT: 35, DEP: 2, STR: 0, DIP: 90, LEN: 20, WID: 12};
assert.ok(Math.abs(rectangularFaultDistance([135,35],fault)-2)<1e-10);
assert.ok(Math.abs(rectangularFaultDistance([135,35],fault,5)-7)<1e-10);
assert.ok(Math.abs(rectangularFaultDistance([135,35],{...fault,DEP:0})-0)<1e-10);
assert.ok(Math.abs(rectangularFaultDistance([135,35],{...fault,DIP:0})-2)<1e-10);
const parts=activeFaultSourceDistances([135,35],fault,[{faultAlongKm:0},{faultAlongKm:10},{faultAlongKm:20}]);
assert.ok(Math.abs(Math.min(...parts)-rectangularFaultDistance([135,35],fault))<1e-10);
assert.ok(parts[2]>parts[0], "unruptured far strip does not become the near strip");
const sources=[{faultAlongKm:0},{faultAlongKm:10},{faultAlongKm:20}], surfaceDistances=[0,10,20];
assert.equal(simulationActiveFaultDistances([135,35],fault,sources,150,8,surfaceDistances),null);
const fading=simulationActiveFaultDistances([135,35],fault,sources,149.999,8,surfaceDistances);
assert.ok(fading.every((distance,index)=>Math.abs(distance-Math.hypot(surfaceDistances[index],149.999))<.01));
const shifted=simulationActiveFaultDistances([135,35],fault,sources,30,8,surfaceDistances);
assert.ok(Math.abs(shifted[0]-24)<1e-9,"EEW depth revisions move the plane rather than retaining its configured depth");
for(const magnitude of [4,6,7,8.3,9.5]) for(const depthKm of [0,10,100,149.99,150,590]) {
  let previous=Infinity;
  for(const distance of [0,1,3,10,30,100,300,600]) {
    const parameters={magnitude,depthKm,ruptureDistanceKm:Math.hypot(distance,depthKm),pointSource:true,simulationCalibration:true};
    if(depthKm>150) continue;
    const intensity=estimateSimulationIntensity(parameters);
    assert.ok(intensity<=previous+1e-9,"no rings of artificially stronger distant shaking");previous=intensity;
    if(depthKm===150) assert.equal(intensity,estimateReferenceIntensity(parameters));
  }
}
console.log("Simulation distances: published finite-source sphere, bounded giants, rectangular planes, source strips, deep continuity and monotonic attenuation passed");
