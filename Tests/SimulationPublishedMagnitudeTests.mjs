import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {getFaultAssessment, faultAssessmentCaseId, publishedMagnitudeBounds, publishedMagnitudeDefault} from "../src/simulation/faultAssessment.js";
import {normalizeSimulationOptions, prepareEarthquakeSimulation, getSimulationPresetOptions} from "../src/simulation/earthquakeSimulation.js";
import {scenarioMatchesOptions} from "../src/simulation/scenarioIntensity.js";
import {NANKAI_LONG_TERM_ASSESSMENT, NANKAI_RUPTURE_CASES, NANKAI_HALF_REFERENCE_MOMENTS, FAULT_MODEL_PRESETS} from "../src/simulation/faultPresets.js";

assert.deepEqual(publishedMagnitudeBounds("７．０～７．５程度"), {min:7,max:7.5,value:null});
assert.deepEqual(publishedMagnitudeBounds("7.7程度以上"), {min:7.7,max:9.5,value:null});
assert.deepEqual(publishedMagnitudeBounds("最大7.6程度"), {min:1,max:7.6,value:null});
assert.deepEqual(publishedMagnitudeBounds("6.7程度 もしくはそれ以上"), {min:6.7,max:9.5,value:null});
assert.equal(publishedMagnitudeBounds("未評価"),null);
assert.equal(publishedMagnitudeBounds("7.5~7.0程度"),null);
assert.equal(publishedMagnitudeBounds("最大7.5程度以上"),null);
assert.equal(NANKAI_LONG_TERM_ASSESSMENT.magnitude,"M8～M9クラス");
assert.equal(FAULT_MODEL_PRESETS["nankai-trough"].magnitudeValue,9,"full-rupture initial Mw is the Cabinet Office strong-motion value, not an assigned HERP magnitude");
assert.equal(NANKAI_RUPTURE_CASES.east.magnitudeValue,8.6);
assert.equal(NANKAI_RUPTURE_CASES.west.magnitudeValue,8.9);
assert.equal(NANKAI_HALF_REFERENCE_MOMENTS.east.reduce((a,b)=>a+b),9.5e21);
assert.equal(NANKAI_HALF_REFERENCE_MOMENTS.west.reduce((a,b)=>a+b),2.43e22);
for(const side of ["east","west"]){
  const moment=NANKAI_HALF_REFERENCE_MOMENTS[side].reduce((a,b)=>a+b);
  assert.equal(NANKAI_RUPTURE_CASES[side].magnitudeValue,Math.round(((Math.log10(moment)-9.1)/1.5)*10)/10,"sum physical moments, never regional magnitudes");
  assert.match(NANKAI_RUPTURE_CASES[side].magnitudeContext,/MeteoScope/);
}
assert.equal(publishedMagnitudeDefault("7.0～7.5程度"),7.3);
assert.equal(publishedMagnitudeDefault("7.7程度以上"),7.7);
assert.equal(publishedMagnitudeDefault("最大7.6程度"),7.6);
assert.equal(publishedMagnitudeDefault("未評価"),null,"do not manufacture a magnitude without an assessment");

// Synthetic geometry. Its name links published numeric choices only; neither
// these test coordinates nor this ID reproduce the latest assessed geometry.
const fault={FLT_ID:"F000001_00001",LTENAME:"生駒断層帯",MAG:-6.9,LON:135.6,LAT:34.6,DEP:2,LEN:30,WID:15,STR:20,DIP:60};
const assessment=getFaultAssessment(fault.LTENAME);
assert.equal(assessment.matching.magnitude,"7.5程度");
const input={model:"active-fault",activeFault:fault,magnitudeBasis:"herp-M",
  assessmentCase:faultAssessmentCaseId(assessment.matching),magnitude:7.5,depthKm:10};
const normalized=normalizeSimulationOptions(input);
assert.equal(normalized.magnitude,7.5,"use published M instead of model Mw6.9");
assert.equal(normalized.magnitudeBasis,"herp-M","do not relabel the number as verified Mw");
assert.equal(normalized.magnitudeSource.activityNameMatches,true);
assert.equal(normalized.magnitudeSource.url,assessment.matching.url);
assert.match(normalized.magnitudeSource.approximation,/Mw-based/);
for(const invalid of [{magnitude:6.9},{assessmentCase:""},{assessmentCase:'["別断層",""]'},
  {magnitude:NaN},{model:"point"},{magnitudeBasis:"Mj"}]) assert.throws(()=>normalizeSimulationOptions({...input,...invalid}),RangeError);
assert.equal(normalizeSimulationOptions({...input,magnitudeBasis:"Mw",magnitude:6.9}).magnitudeSource,null);

const stations={"00001":{longitude:135.65,latitude:34.7},"00002":{longitude:136,latitude:35}};
for(const side of ["east","west"]){
  const initial=getSimulationPresetOptions("nankai-trough",side);
  const simulation=await prepareEarthquakeSimulation(initial,stations,{yieldTask:async()=>{}});
  assert.equal(simulation.frame(simulation.duration).event.magnitude,side==="east"?8.6:8.9,"half rupture can finish with its reference initial magnitude without manual input");
}
const published=await prepareEarthquakeSimulation(input,stations,{yieldTask:async()=>{}});
const model=await prepareEarthquakeSimulation({...input,magnitudeBasis:"Mw",magnitude:6.9},stations,{yieldTask:async()=>{}});
assert.ok(published.stations[0].predictedIntensityValue>model.stations[0].predictedIntensityValue,"published input actually changes the calculated shaking");
const final=published.frame(published.duration).event;
assert.equal(final.magnitude,7.5);
assert.equal(final.simulationMagnitudeBasis,"herp-M");
assert.equal(final.simulationMagnitudeSource.magnitude,"7.5程度");

const uemachi=getFaultAssessment("上町断層帯");
assert.equal(uemachi.matching,null,"do not automatically assign a revised section to the old geometry");
const main=uemachi.rows.find(row=>row.caseName==="主部区間");
const selected=normalizeSimulationOptions({...input,activeFault:{...fault,LTENAME:"上町断層帯"},
  assessmentCase:faultAssessmentCaseId(main),magnitude:7.6});
assert.equal(selected.magnitudeSource.activityNameMatches,false,"explicit numeric use retains mismatch provenance");

const ranged=getFaultAssessment("函館平野西縁断層帯").rows[0];
const rangeOptions={...input,activeFault:{...fault,LTENAME:ranged.name},assessmentCase:faultAssessmentCaseId(ranged)};
assert.throws(()=>normalizeSimulationOptions({...rangeOptions,magnitude:""}),/Missing/);
assert.throws(()=>normalizeSimulationOptions({...rangeOptions,magnitude:7.6}),/bounds/);
assert.equal(normalizeSimulationOptions({...rangeOptions,magnitude:7.2}).magnitude,7.2);

const conditions={...input,activeFaultId:fault.FLT_ID,ruptureOrigin:"center"};
const profile={conditions};
assert.equal(scenarioMatchesOptions(profile,normalized),true);
assert.equal(scenarioMatchesOptions(profile,{...normalized,magnitudeBasis:"Mw"}),false,"equal numbers in different magnitude bases cannot share official intensities");
assert.equal(scenarioMatchesOptions({...profile,conditions:{...conditions,assessmentCase:"other"}},normalized),false);
assert.equal(scenarioMatchesOptions({...profile,conditions:{...conditions,magnitudeBasis:undefined}},normalized),false,"legacy scenario files mean Mw, never published M");

// Exercise the real form update: missing assessments must not leave an empty,
// required published-M selector in front of a valid model Mw.
const ui=readFileSync(new URL("../src/ui/earthquakeSimulation.js",import.meta.url),"utf8");
const update=ui.slice(ui.indexOf("  function updateMagnitudeFields("),ui.indexOf("  function renderFaultChoices("));
const elements=new Map(),fields=new Map(),publishedOption={disabled:false};
const element=key=>{if(!elements.has(key))elements.set(key,{});return elements.get(key);};
const field=name=>{if(!fields.has(name))fields.set(name,{value:"",dataset:{},options:[],
  replaceChildren(...options){this.options=options;},add(option){this.options.push(option);},
  setAttribute(name,value){this[name]=value;},querySelector(){return publishedOption;}});return fields.get(name);};
field("model").value="active-fault";
const form=vm.createContext({field,modal:{querySelector:element},Option:function(label,value){this.text=label;this.value=value;},
  text:ja=>ja,publishedMagnitudeBounds,publishedMagnitudeDefault,faultAssessmentCaseId,
  selectedFault:{...fault,LTENAME:"雫石盆地西縁断層帯",MAG:-6.4},selectedCaseId:"unmatched",lastValues:null,
  core:{activeFaultCaseId:()=>"unmatched",buildActiveFaultPreset:()=>({magnitudeValue:6.4})}});
vm.runInContext(update,form);
const missing=getFaultAssessment(form.selectedFault.LTENAME);
assert.equal(missing.rows.length,0);
form.updateMagnitudeFields(missing);
assert.equal(field("magnitudeBasis").value,"Mw");assert.equal(field("magnitude").value,6.4);
assert.equal(publishedOption.disabled,true);assert.equal(field("assessmentCase").required,false);
assert.equal(element("[data-assessment-case-label]").hidden,true);assert.equal(element("[data-assessment-value-label]").hidden,true);
assert.equal(field("magnitude").readOnly,false);
field("magnitude").value=6.8;form.updateMagnitudeFields(missing);assert.equal(field("magnitude").value,6.8,"do not reset an edited Mw during other field updates");
form.selectedCaseId="published";form.selectedFault=fault;form.updateMagnitudeFields(assessment);
assert.equal(field("magnitudeBasis").value,"herp-M");assert.equal(field("magnitude").value,7.5);
assert.equal(publishedOption.disabled,false);assert.equal(element("[data-assessment-case-label]").hidden,false);
form.selectedCaseId="unmatched";form.lastValues={model:"active-fault",activeFault:form.selectedFault,magnitudeBasis:"herp-M",magnitude:7.5};
form.updateMagnitudeFields(missing);assert.equal(field("magnitudeBasis").value,"Mw");assert.equal(field("magnitude").value,6.4,"a stale published M must not become model Mw");
console.log("Published magnitude: source priority, bounds, explicit activity choice, provenance, actual shaking/EEW and scenario isolation passed");
