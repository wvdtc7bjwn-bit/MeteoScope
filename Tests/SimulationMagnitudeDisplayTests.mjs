import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {canConvertSimulationMagnitude, simulationMagnitudeDisplay} from "../src/simulation/magnitudeDisplay.js";
import {prepareEarthquakeSimulation, getSimulationPresetOptions} from "../src/simulation/earthquakeSimulation.js";
import {createSimulationRegionLookup} from "../src/simulation/epicenterRegion.js";

const options={model:"point",magnitude:7,longitude:139.76,latitude:35.68,depthKm:10,groundCorrection:"none"};
const source={coordinates:[139.76,35.68],ruptureDelaySec:0};
assert.equal(canConvertSimulationMagnitude(options,[source],()=>true),true);
assert.deepEqual(simulationMagnitudeDisplay(7,true),{value:7.6,scale:"M",converted:true});
assert.deepEqual(simulationMagnitudeDisplay(6.9,true),{value:7.5,scale:"M",converted:true});
assert.deepEqual(simulationMagnitudeDisplay(7,false),{value:7,scale:"Mw",converted:false});
for(const magnitude of [4,4.6,8,9.5])assert.equal(simulationMagnitudeDisplay(magnitude,true).scale,"Mw","no extrapolation to tiny or giant M");
for(const value of [null,undefined,NaN,Infinity,"7"])assert.deepEqual(simulationMagnitudeDisplay(value,true),{value:null,scale:"Mw",converted:false});
for(const patch of [{model:"nankai-trough"},{model:"japan-trench"},{model:"kuril-trench"},{depthKm:21},{depthKm:172},{depthKm:590},{magnitude:9}])
  assert.equal(canConvertSimulationMagnitude({...options,...patch},[source],()=>true),false);
assert.equal(canConvertSimulationMagnitude(options,[],()=>true),false);
assert.equal(canConvertSimulationMagnitude(options,[source],null),false);
assert.equal(canConvertSimulationMagnitude(options,[source],()=>false),false);
assert.equal(canConvertSimulationMagnitude({...options,model:"active-fault"},[source,{...source,depthKm:25}],()=>true),false,"every source depth must qualify");
assert.equal(canConvertSimulationMagnitude(options,[source,{coordinates:[135,32]}],p=>p[0]>139),false,"a partly offshore rupture is not treated as entirely inland");

// The same bundled land geometry the application already loads. Do not infer
// inland classification from a Japanese place-name suffix or a bounding box.
const areas=JSON.parse(readFileSync(new URL("../public/data/earthquake-areas.geojson",import.meta.url),"utf8"));
const onLand=createSimulationRegionLookup(areas);
assert.ok(onLand(source.coordinates));assert.equal(onLand([135,32]),null);
assert.equal(canConvertSimulationMagnitude(options,[source],onLand),true);
assert.equal(canConvertSimulationMagnitude(options,[{coordinates:[135,32]}],onLand),false);

const stations={"0001":{longitude:139.77,latitude:35.69},"0002":{longitude:139.8,latitude:35.7}};
const simulation=await prepareEarthquakeSimulation(options,stations,{forecastAreas:areas,yieldTask:async()=>{}});
const noClassification=await prepareEarthquakeSimulation(options,stations,{yieldTask:async()=>{}});
assert.equal(simulation.options.magnitude,7);
assert.deepEqual(simulation.stations.map(s=>[s.predictedIntensityValue,s.pArrivalSec,s.sArrivalSec]),noClassification.stations.map(s=>[s.predictedIntensityValue,s.pArrivalSec,s.sArrivalSec]),"display conversion cannot change motion or travel times");
const numericReports=sim=>sim.reports.map(r=>[r.elapsedSec,r.magnitude,r.depth,r.maxIntensity,r.isFinal]);
assert.deepEqual(numericReports(simulation),numericReports(noClassification),"EEW numeric estimation and timing stay in Mw");
for(const time of [0,5,40,simulation.duration,5]){
  const event=simulation.frame(time).event,report=simulation.reports.findLast(r=>r.elapsedSec<=time);
  assert.equal(event.magnitude,report?.magnitude??null);
  assert.deepEqual(event.simulationMagnitudeDisplay,simulationMagnitudeDisplay(event.magnitude,true));
}
const final=simulation.frame(simulation.duration).event;
assert.equal(final.magnitude,7);assert.equal(final.simulationMagnitudeDisplay.value,7.6);
assert.equal(final.simulationMagnitudeBasis,"Mw");assert.equal(final.simulationMagnitudeDisplay.converted,true);
const missing=noClassification.frame(noClassification.duration).event;
assert.deepEqual(missing.simulationMagnitudeDisplay,{value:7,scale:"Mw",converted:false},"missing classification data falls back without changing the calculation");
for(const model of ["nankai-trough","japan-trench","kuril-trench"]){
  const sea=await prepareEarthquakeSimulation(getSimulationPresetOptions(model),stations,{forecastAreas:areas,yieldTask:async()=>{}});
  const event=sea.frame(sea.duration).event;
  assert.deepEqual(event.simulationMagnitudeDisplay,{value:sea.options.magnitude,scale:"Mw",converted:false});
}
console.log("Magnitude display: conditional inland conversion, offshore/deep/giant/missing-data fallback, original Mw physics/EEW, report revisions and rewind passed");
