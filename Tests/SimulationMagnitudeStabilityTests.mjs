import assert from "node:assert/strict";
import {prepareEarthquakeSimulation,getSimulationPresetOptions} from "../src/simulation/earthquakeSimulation.js";

// Synthetic land/station geometry tests visible summary values; no provider
// geometry or past-event fitting is needed for a bounded teaching trajectory.
const stations=Object.fromEntries(Array.from({length:48},(_,i)=>[String(i),{
  longitude:135+(i%8),latitude:33+Math.floor(i/8)}]));
const forecastAreas={type:"FeatureCollection",features:[{type:"Feature",properties:{code:"001",name:"Test land"},
  geometry:{type:"Polygon",coordinates:[[[130,20],[150,20],[150,47],[130,47],[130,20]]]}}]};
const drawdown=values=>{let high=-Infinity,drop=0;for(const value of values){high=Math.max(high,value);drop=Math.max(drop,high-value);}return drop;};
const hasDownwardRevision=values=>values.some((value,i)=>i>0&&value<values[i-1]);
const cases=[...([3.5,5.5,6,6.5,7,8.3,9.5].map(magnitude=>({magnitude}))),
  {magnitude:6.3,depthKm:172},{magnitude:8.1,depthKm:590},
  ...["nankai-trough","kuril-trench","japan-trench"].map(model=>getSimulationPresetOptions(model)),
  getSimulationPresetOptions("nankai-trough","east"),getSimulationPresetOptions("nankai-trough","west")];
let smallRevisions=0;
for(const options of cases){
  const simulation=await prepareEarthquakeSimulation(options,stations,{forecastAreas,yieldTask:async()=>{}});
  const {reports}=simulation;
  const values=reports.map(r=>r.magnitude);
  const displayed=reports.map(r=>simulation.frame(r.elapsedSec,{renderOnly:true}).event.simulationMagnitudeDisplay.value);
  assert.ok(drawdown(values)<=.25,`synthetic Mw reversal is bounded: ${simulation.options.model} Mw${simulation.options.magnitude}`);
  assert.ok(drawdown(displayed)<=.31,"empirical M conversion must not amplify reversals into a full-magnitude swing");
  assert.ok(values.every(value=>value<=simulation.options.magnitude+.1+1e-9),"no large synthetic overshoot");
  assert.equal(values.at(-1),simulation.options.magnitude,"final Mw still converges exactly");
  assert.ok(reports.at(-1).isFinal);
  assert.ok(reports.at(-1).elapsedSec>=Math.max(...simulation.sources.map(s=>s.ruptureDelaySec))+2);
  assert.ok(reports[0].elapsedSec-reports[0].detectedAtSec<=.81,"do not delay initial detection to smooth the display");
  if(hasDownwardRevision(values))smallRevisions++;
  const earlier=simulation.frame(reports[1].elapsedSec,{renderOnly:true}).event;
  simulation.frame(simulation.duration,{renderOnly:true});
  assert.deepEqual(simulation.frame(reports[1].elapsedSec,{renderOnly:true}).event,earlier,"rewind is independent of viewing history");
}
assert.ok(smallRevisions>=2,"retain modest downward corrections where the analysis changes; do not make every case mechanically monotonic");
console.log("Simulation magnitude stability: visible drawdown, source-growth convergence, no forced overshoot, initial detection, finalization and rewind across shallow/deep/giant/full/half scenes passed");
