import assert from 'node:assert/strict';
import {prepareEarthquakeSimulation,getSimulationPresetOptions} from '../src/simulation/earthquakeSimulation.js';
import {createWeSimulatorModel} from '../src/simulation/weSimulatorModel.js';
import {buildSimulationEewReports} from '../src/simulation/eewEstimates.js';
import {createSimulationObservationStream,SIMULATION_OBSERVATION_LIMIT} from '../src/simulation/reportTiming.js';

const signal=(id,p,s=p+3)=>({id,pArrivalSec:p,sArrivalSec:s,epicentralDistanceKm:20,predictedIntensityValue:4,groundArv:1});
const sparse=[signal('a',2,5)];
function analyze(stations,magnitude=7,sources=[{ruptureDelaySec:0}]){
 const schedule=createWeSimulatorModel({magnitude,depthKm:10}).getSimulationInitialReport(magnitude,stations);
 return buildSimulationEewReports({options:{magnitude,depthKm:10,model:'point'},stations,sources,schedule,ruptureCompleteSec:Math.max(...sources.map(s=>s.ruptureDelaySec))});
}
const dense=Array.from({length:20},(_,i)=>signal('s'+i,2+i*.6,5+i*1.2));
const a=analyze(sparse),b=analyze(dense);
assert.equal(a[0].elapsedSec,2.6);assert.equal(b[0].elapsedSec,2.6,'more observations cannot delay the first bulletin');
assert.notEqual(a.length,b.length,'same magnitude has observation-dependent report counts');
assert.ok(b.at(-1).elapsedSec<a.at(-1).elapsedSec,'better growing coverage can confirm a stable solution sooner');
assert.deepEqual(analyze(dense),b,'deterministic sequence');
const delayed=analyze([...sparse,signal('late',40,45)]);
assert.ok(delayed.at(-1).elapsedSec>a.at(-1).elapsedSec,'late useful arrivals restart stability confirmation');
const far=analyze([...sparse,signal('far',500,600)]);
assert.deepEqual(far,a,'future distant observations cannot affect an already completed analysis');
const noS=analyze([signal('a',2,Infinity)]);
assert.ok(noS.at(-1).elapsedSec>a.at(-1).elapsedSec,'missing S coverage needs longer confirmation');
const stream=createSimulationObservationStream([...dense,dense[0],signal('invalid',Infinity)]);
assert.equal(stream.advance(2).pCount,0);
assert.equal(stream.advance(2.6).pCount,1);
assert.equal(stream.advance(100).pCount,20,'duplicate station IDs do not inflate evidence');
const capped=createSimulationObservationStream(Array.from({length:100},(_,i)=>signal('c'+i,2+i)));
assert.equal(capped.advance(1000).pCount,SIMULATION_OBSERVATION_LIMIT,'distant low-value arrivals cannot postpone completion forever');
for(const magnitude of [3.5,4,5.5,6,7,7.49,7.5,8,8.5,9,9.5]){
 const reports=analyze(dense,magnitude),last=reports.at(-1);
 assert.equal(last.isFinal,true);assert.equal(last.finalReason,'stable');assert.equal(last.magnitude,magnitude);assert.equal(last.depth,10);
 assert.ok(last.confirmationForSec>=15,'finish only after a confirmation window following maturity');
 assert.ok(reports.slice(0,-1).every(r=>!r.isFinal));
 assert.ok(new Set(reports.slice(1).map((r,i)=>+(r.elapsedSec-reports[i].elapsedSec).toFixed(2))).size>2,'nonuniform observation-driven cadence');
 for(let i=0;i<reports.length;i++){
  assert.equal(reports[i].reportNumber,i+1);
  if(i)assert.ok(reports[i].elapsedSec>reports[i-1].elapsedSec && reports[i].elapsedSec-reports[i-1].elapsedSec<31);
 }
 for(const r of reports.filter(r=>r.elapsedSec>=last.elapsedSec-14.9)){
  assert.equal(r.magnitude,last.magnitude);assert.equal(r.depth,last.depth);assert.equal(r.maxIntensity,last.maxIntensity);
  assert.deepEqual(r.warnAreas,last.warnAreas,'target regions must also be stable before finalization');
 }
}
assert.ok(Math.abs(analyze(dense,7.49).at(-1).elapsedSec-analyze(dense,7.5).at(-1).elapsedSec)<5,'no artificial M7.5 cadence/duration switch');
const incomplete=analyze([signal('a',2)],7,[{ruptureDelaySec:0},{ruptureDelaySec:100}]);
assert.equal(incomplete.at(-1).isFinal,false,'unobservable configured rupture cannot be called stable');
assert.equal(incomplete.at(-1).finalReason,'insufficient-observations');
const futureSource=analyze([{...signal('a',2),sourcePArrivalSecs:[2,1000]}],7,[{ruptureDelaySec:0},{ruptureDelaySec:100}]);
const missingSource=analyze([{...signal('a',2),sourcePArrivalSecs:[2,Infinity]}],7,[{ruptureDelaySec:0},{ruptureDelaySec:100}]);
assert.deepEqual(futureSource,missingSource,'even the analysis safeguard must not consult future source arrivals');
assert.equal(createSimulationObservationStream([signal('invalid-s',2,1)]).advance(100).sCount,0,'S before P is not valid evidence');

const stations={'00001':{longitude:139.76,latitude:35.68},'00002':{longitude:145,latitude:43}};
for(const options of [{magnitude:4},{magnitude:7},{magnitude:9.5,depthKm:10},{longitude:160.5,latitude:52.5,magnitude:9.5,depthKm:25},
 {magnitude:8.1,depthKm:590},{...getSimulationPresetOptions('nankai-trough'),ruptureSpeed:.5},{...getSimulationPresetOptions('nankai-trough'),nankaiCase:'east'}]){
 const sim=await prepareEarthquakeSimulation(options,stations),last=sim.reports.at(-1);
 assert.equal(last.isFinal,true);assert.ok(last.elapsedSec>=Math.max(...sim.sources.map(s=>s.ruptureDelaySec))+2);
 assert.ok(sim.duration>=last.elapsedSec+8);
 const report=sim.reports[Math.min(10,sim.reports.length-2)],event=sim.frame(report.elapsedSec).event;
 assert.equal(event.serial,report.reportNumber);assert.equal(event.isFinal,false);assert.equal(event.simulationWaveDepthKm,sim.options.depthKm);
 sim.frame(sim.duration);assert.deepEqual(sim.frame(report.elapsedSec).event,event,'seek does not leak final estimates');
 assert.equal(sim.frame(last.elapsedSec).event.isFinal,true);
 if(options.depthKm>150)assert.deepEqual(event.warnAreas,[]);
}
console.log('Simulation reports: causal observation growth, sparse/dense/missing/late data, stable finalization, all magnitudes, nonuniform cadence, finite/deep/offshore cases and deterministic seek passed');
