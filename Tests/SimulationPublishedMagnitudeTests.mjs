import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {getFaultAssessment} from "../src/simulation/faultAssessment.js";
import {normalizeMagnitudeBasis} from "../src/simulation/magnitudeBasis.js";
import * as core from "../src/simulation/earthquakeSimulation.js";
import {scenarioMatchesOptions, validatePublicScenarioData} from "../src/simulation/scenarioIntensity.js";
import {NANKAI_LONG_TERM_ASSESSMENT, NANKAI_RUPTURE_CASES, NANKAI_HALF_REFERENCE_MOMENTS, FAULT_MODEL_PRESETS} from "../src/simulation/faultPresets.js";

// Synthetic geometry, used to test the real form -> normalization -> shaking
// and EEW path. Its name links reference M only, not current official geometry.
const plane={FLT_ID:"F000001_00001",LTENAME:"生駒断層帯",MAG:-6.9,LON:135.6,LAT:34.6,DEP:2,LEN:30,WID:15,STR:20,DIP:60};
const fault={...plane,planes:[plane],modelVersion:"Y2024"};
const assessment=getFaultAssessment(fault.LTENAME);
assert.equal(assessment.matching.magnitude,"7.5程度");
assert.equal(core.normalizeSimulationOptions({model:"active-fault",activeFault:fault}).magnitude,6.9,"direct callers also default to the matching model Mw, not the generic point-source default");
for(const MAG of [7.5,null])assert.throws(()=>core.normalizeSimulationOptions({model:"active-fault",activeFault:{...plane,MAG}}),/Missing magnitude/);
const ui=readFileSync(new URL("../src/ui/earthquakeSimulation.js",import.meta.url),"utf8");
const fields=new Map(),elements=new Map();
const field=name=>{if(!fields.has(name))fields.set(name,{value:""});return fields.get(name);};
const element=key=>{if(!elements.has(key))elements.set(key,{});return elements.get(key);};
for(const [key,value] of Object.entries(core.SIMULATION_DEFAULTS))field(key).value=value;
field("model").value="active-fault";
const form=vm.createContext({field,core,text:ja=>ja,modal:{querySelector:element},
  selectedFault:null,selectedCaseId:"",faultCatalog:[],faultModelLoading:false,
  getFaultAssessment,renderFaultChoices(){},loadFaultChoices(){},updateScenarioStatus(){},faultCatalogController:null,faultModelController:null});
vm.runInContext(ui.slice(ui.indexOf("  function readForm("),ui.indexOf("  function renderFaultChoices(")),form);
vm.runInContext(ui.slice(ui.indexOf("  function updateModelFields("),ui.indexOf("  async function open(")),form);
form.applyActiveFault(fault);form.updateModelFields();
assert.equal(field("magnitude").value,6.9,"model Mw6.9 is the default even when reference M is 7.5");
assert.match(element("[data-active-assessment]").textContent,/7.5程度/);
const input=form.readForm();
assert.equal(input.magnitudeBasis,"Mw");assert.equal(input.assessmentCase,undefined);
assert.equal(core.normalizeSimulationOptions(input).magnitude,6.9);
field("magnitude").value=7.1;field("depthKm").value=12;form.updateModelFields();
assert.equal(field("magnitude").value,7.1,"depth/ground/reference refresh must preserve explicitly edited calculation Mw");
// Reference data cannot change calculated inputs, even if updated to a much
// larger value or a range. Activity-case wording remains unmodified.
form.getFaultAssessment=()=>({...assessment,rows:[{...assessment.rows[0],magnitude:"9.0～9.5程度"}]});
form.updateModelFields();assert.equal(field("magnitude").value,7.1);assert.match(element("[data-active-assessment]").textContent,/9.0～9.5程度/);
for(const MAG of [7.5,null]){
  const missing={...plane,MAG};form.applyActiveFault(missing);form.updateModelFields();
  assert.equal(field("magnitude").value,"","Mj/missing Mw never receives the reference M number");
  assert.throws(()=>core.normalizeSimulationOptions(form.readForm()),/Missing magnitude/);
}
form.getFaultAssessment=getFaultAssessment;form.applyActiveFault(fault);
form.updateModelFields();const options=core.normalizeSimulationOptions(form.readForm());
const stations={"00001":{longitude:135.65,latitude:34.7},"00002":{longitude:136,latitude:35}};
const model=await core.prepareEarthquakeSimulation(options,stations,{yieldTask:async()=>{}});
const explicit=await core.prepareEarthquakeSimulation({...options,magnitudeBasis:undefined},stations,{yieldTask:async()=>{}});
assert.equal(model.options.magnitude,6.9);
assert.deepEqual(model.stations.map(s=>s.predictedIntensityValue),explicit.stations.map(s=>s.predictedIntensityValue));
const final=model.frame(model.duration).event;
assert.equal(final.magnitude,6.9);assert.equal(final.simulationMagnitudeBasis,"Mw");assert.equal(final.simulationMagnitudeSource,null);
assert.equal(model.reports.at(-1).magnitude,6.9,"EEW converges to calculation Mw, never the reference M7.5");

// Reject old/injected public-M settings before any scene preparation. Never
// remove a scale tag and silently reinterpret its old number as Mw.
let preparationYields=0;
for(const legacy of [
  {magnitudeBasis:"herp-M",magnitude:7.5,assessmentCase:'["生駒断層帯",""]'},
  {magnitudeBasis:"Mj",magnitude:7.5}, {magnitudeBasis:"invalid"},
  {magnitudeSource:{magnitude:"7.5程度"}}, {assessmentCase:'["生駒断層帯",""]'}
]){
  const old={...options,...legacy};
  assert.throws(()=>normalizeMagnitudeBasis(old),/Only calculation Mw/);
  assert.throws(()=>core.normalizeSimulationOptions(old),/Only calculation Mw/);
  assert.throws(()=>core.buildSimulationSources(old),/Only calculation Mw/);
  await assert.rejects(core.prepareEarthquakeSimulation(old,stations,{yieldTask:async()=>{preparationYields++;}}),/Only calculation Mw/);
}
assert.equal(preparationYields,0);

const conditions={model:"active-fault",magnitude:6.9,magnitudeBasis:"Mw",depthKm:options.depthKm,
  activeFaultId:fault.FLT_ID,activeFaultPlaneIds:[plane.FLT_ID],activeFaultVersion:"Y2024",ruptureOrigin:"center"};
const profile={type:"MeteoScope published scenario intensities",version:1,surface:true,caseId:"test-mw",
  caseLabel:"Synthetic Mw test",source:{url:"https://www.j-shis.bosai.go.jp/",title:"Synthetic test only",published:"2026-11-17"},
  conditions,stations:{"00001":6.8},stationCoordinates:{"00001":[135.65,34.7]}};
assert.equal(scenarioMatchesOptions(validatePublicScenarioData(profile),options),true);
assert.equal(scenarioMatchesOptions({...profile,conditions:{...conditions,magnitudeBasis:undefined}},options),true,"existing Mw files remain usable");
for(const old of [{magnitudeBasis:"herp-M"},{magnitudeBasis:"Mj"},{assessmentCase:"old"},{magnitudeSource:{magnitude:7.5}}]){
  const data={...profile,conditions:{...conditions,...old}};
  assert.throws(()=>validatePublicScenarioData(data),/calculation Mw/);
  assert.equal(scenarioMatchesOptions(data,options),false);
  assert.equal(scenarioMatchesOptions(profile,{...options,...old}),false);
  assert.equal(scenarioMatchesOptions(data,{...options,...old}),false,"two identical legacy M settings must not validate each other");
}
const published=await core.prepareEarthquakeSimulation(options,stations,{scenarioIntensity:profile,yieldTask:async()=>{}});
assert.equal(published.stations[0].predictedIntensityValue,6.8,"matching official-intensity priority is preserved");
assert.equal(published.stations[1].predictedIntensityValue,published.stations[1].calculatedIntensityValue);
assert.equal(published.stations[0].pArrivalSec,model.stations[0].pArrivalSec);
assert.equal(published.stations[0].sArrivalSec,model.stations[0].sArrivalSec);
assert.equal(published.frame(published.duration).event.magnitude,6.9);

// Full/half rupture defaults remain derived from their own Mw/moment data.
assert.equal(NANKAI_LONG_TERM_ASSESSMENT.magnitude,"M8～M9クラス");
assert.equal(FAULT_MODEL_PRESETS["nankai-trough"].magnitudeValue,9);
for(const side of ["east","west"]){
  const moment=NANKAI_HALF_REFERENCE_MOMENTS[side].reduce((a,b)=>a+b);
  assert.equal(NANKAI_RUPTURE_CASES[side].magnitudeValue,Math.round(((Math.log10(moment)-9.1)/1.5)*10)/10);
  const initial=core.getSimulationPresetOptions("nankai-trough",side);
  const simulation=await core.prepareEarthquakeSimulation(initial,stations,{yieldTask:async()=>{}});
  assert.equal(simulation.frame(simulation.duration).event.magnitude,side==="east"?8.6:8.9);
}
console.log("Magnitude separation: reference M cannot alter model Mw, form -> shaking/EEW, edited/missing Mw, legacy rejection, scenario priority and full/half isolation passed");
