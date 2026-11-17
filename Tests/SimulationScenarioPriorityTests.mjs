import assert from "node:assert/strict";
import {prepareEarthquakeSimulation, getSimulationPresetOptions} from "../src/simulation/earthquakeSimulation.js";
import {validatePublicScenarioData, scenarioMatchesOptions, createPublicScenarioLookup} from "../src/simulation/scenarioIntensity.js";
const options={...getSimulationPresetOptions("nankai-trough"),groundCorrection:"none"};
// Synthetic test values; not a reproduction of a published hazard map.
const data={type:"MeteoScope published scenario intensities",version:1,surface:true,caseId:"synthetic-full-basic",caseLabel:"動作試験用・全割れ基本ケース",
  source:{title:"動作試験（実データではない）",url:"https://www.bousai.go.jp/jishin/nankai/kento_wg/",published:"2025-03-31"},
  conditions:{model:options.model,nankaiCase:"full",shakingCase:"basic",magnitude:options.magnitude,depthKm:options.depthKm,ruptureOrigin:"center"},
  stations:{"00001":6.8,"00002":0},stationCoordinates:{"00001":[135,34],"00002":[136,35]}};
const stations={"00001":{longitude:135,latitude:34},"00002":{longitude:136,latitude:35},"00003":{longitude:134,latitude:34}};
const validated=validatePublicScenarioData(data);
assert.equal(createPublicScenarioLookup(validated,options).at({id:"00001",coordinates:[136,34]}),null,"catalogue IDs alone cannot misapply a value after station relocation or reordering");
assert.throws(()=>validatePublicScenarioData({...data,stationCoordinates:{}}),/Station coordinates/);
assert.equal(scenarioMatchesOptions(validated,options),true);
for(const nankaiCase of ["east","west"]) assert.equal(scenarioMatchesOptions(data,{...options,nankaiCase}),false,"never apply a full rupture to half ruptures");
assert.equal(scenarioMatchesOptions(data,{...options,magnitude:8.6}),false);
assert.equal(scenarioMatchesOptions(data,{...options,depthKm:25}),false);
assert.equal(scenarioMatchesOptions(data,{...options,ruptureOrigin:"start"}),false);
assert.equal(scenarioMatchesOptions(data,{...options,model:"japan-trench"}),false);
for (const sourceCase of ["full","east","west"]) for (const targetCase of ["full","east","west"]) {
  const corresponding={...data,conditions:{...data.conditions,nankaiCase:sourceCase}};
  assert.equal(scenarioMatchesOptions(corresponding,{...options,nankaiCase:targetCase}),sourceCase===targetCase,"all rupture-case pairs are checked even with equal M/depth");
}
assert.throws(()=>validatePublicScenarioData({...data,conditions:{...data.conditions,nankaiCase:"east",shakingCase:"maximum-envelope"}}),/shaking case/);
for(const bad of [{surface:false},{conditions:{...data.conditions,nankaiCase:undefined}},{stations:{"00001":NaN}},
  {stations:[6.8]}, {source:{...data.source,url:"javascript:alert(1)"}}]) assert.throws(()=>validatePublicScenarioData({...data,...bad}));
const emptyMesh=validatePublicScenarioData({...data,coordinateSystem:"WGS84",stations:{},meshes:{"5339461011":6.7}});
assert.equal(createPublicScenarioLookup(emptyMesh,options).at({id:"00001",coordinates:[139.7501,35.6751]}),6.7);
const sim=await prepareEarthquakeSimulation(options,stations,{scenarioIntensity:data,yieldTask:async()=>{}});
assert.equal(sim.stations[0].predictedIntensityValue,6.8);
assert.equal(sim.stations[1].predictedIntensityValue,0,"a genuine zero is not replaced with a calculation");
assert.equal(sim.stations[2].predictedIntensityValue,sim.stations[2].calculatedIntensityValue);
assert.equal(sim.scenarioCoverage.applied,2);
assert.equal(sim.reports.at(-1).maxIntensity,"7");
const end=sim.frame(sim.duration,{intensityDisplay:"maximum"});
assert.equal(end.stations.features[0].properties.recordedIntensity,"7");
assert.equal(end.stations.features[0].properties.intensitySource,"published-scenario");
assert.equal(end.stations.features[2].properties.intensitySource,"approximation");
const ordinary=await prepareEarthquakeSimulation(options,stations,{yieldTask:async()=>{}});
assert.equal(sim.stations[0].pArrivalSec,ordinary.stations[0].pArrivalSec);
assert.equal(sim.stations[0].sArrivalSec,ordinary.stations[0].sArrivalSec);
const {simulationGroundMeshCode}=await import("../src/simulation/groundModel.js");
const groundModel={meshes:Object.fromEntries(Object.values(stations).map(s=>[simulationGroundMeshCode([s.longitude,s.latitude]),[4,150]]))};
const amplified=await prepareEarthquakeSimulation({...options,groundCorrection:"jshis-1km"},stations,{scenarioIntensity:data,groundModel,yieldTask:async()=>{}});
assert.equal(amplified.stations[0].predictedIntensityValue,6.8,"surface scenario does not receive ARV twice");
const half=await prepareEarthquakeSimulation({...getSimulationPresetOptions("nankai-trough","east"),magnitude:8.5,groundCorrection:"none"},stations,{scenarioIntensity:data,yieldTask:async()=>{}});
assert.equal(half.scenarioCoverage.applied,0);assert.equal(half.scenarioCoverage.mismatch,true);
assert.ok(half.stations.every(s=>s.scenarioIntensityValue===null));
console.log("Public scenarios: exact case matching, full/east/west separation, provenance, coverage, zero/missing values, no duplicate ground correction, final EEW and unchanged wave times passed");
