import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import * as core from "../src/simulation/earthquakeSimulation.js";
import {normalizeSimulationMagnitudeInput,PointMagnitudeInputError} from "../src/simulation/magnitudeInput.js";
import {referenceMjFromMw,referenceMwFromMj} from "../src/simulation/magnitudeDisplay.js";

const input={model:"point",earthquakeType:"crustal",longitude:139.76,latitude:35.68,depthKm:10,
  magnitude:7,magnitudeInputScale:"Mj",groundCorrection:"none"};
const options=core.normalizeSimulationOptions(input);
assert.equal(options.magnitude,6.54);
assert.equal(options.magnitudeInputValue,7);
assert.equal(options.magnitudeBasis,"Mw");
assert.deepEqual(core.normalizeSimulationOptions(options),options,"normalizing again must not apply conversion twice");
for(let tenth=51;tenth<=80;tenth++) {
  const mj=tenth/10;
  const result=core.normalizeSimulationOptions({...input,magnitude:mj});
  assert(Math.abs(referenceMjFromMw(result.magnitude)-mj)<1e-12);
  assert.equal(result.magnitude,referenceMwFromMj(mj));
}
for (const patch of [
  {magnitude:5},{magnitude:8.1},{magnitude:NaN},{magnitudeInputValue:""},
  {depthKm:21},{depthKm:172},{earthquakeType:"interplate"},{earthquakeType:"intraslab"},
  {model:"nankai-trough"},{model:"kuril-trench"},{model:"japan-trench"},{magnitudeInputScale:"M"}
]) assert.throws(()=>core.normalizeSimulationOptions({...input,...patch}),RangeError);
assert.throws(()=>core.normalizeSimulationOptions({...input,magnitudeBasis:"Mj"}),/Only calculation Mw/,"legacy published-M data must not become an explicit conversion request");
const geography=JSON.parse(readFileSync(new URL("../public/data/earthquake-areas.geojson",import.meta.url)));
const stations={a:{longitude:139.77,latitude:35.69},b:{longitude:140,latitude:36}};
const settings={forecastAreas:geography,yieldTask:async()=>{}};
const fromM=await core.prepareEarthquakeSimulation(input,stations,settings);
const fromMw=await core.prepareEarthquakeSimulation({...input,magnitude:6.54,magnitudeInputScale:"Mw"},stations,settings);
assert.deepEqual(fromM.stations,fromMw.stations,"shaking uses converted Mw rather than raw M");
assert.deepEqual(fromM.reports,fromMw.reports,"bulletin timing and estimates also use converted Mw");
for(const t of [0,5,30,fromM.duration,5]) {
  assert.equal(fromM.frame(t).event.magnitude,fromMw.frame(t).event.magnitude);
}
await assert.rejects(()=>core.prepareEarthquakeSimulation(input,stations,{yieldTask:async()=>{}}),e=>e instanceof PointMagnitudeInputError&&e.reason==="land","missing geography cannot validate inland conversion");
await assert.rejects(()=>core.prepareEarthquakeSimulation({...input,longitude:135,latitude:32},stations,settings),e=>e instanceof PointMagnitudeInputError&&e.reason==="land","offshore input cannot silently become Mw");

// Execute the actual form reader and field-update logic; no source-only assertions.
const fields=new Map(),elements=new Map();
const field=name=>{if(!fields.has(name))fields.set(name,{value:"",attributes:{},setAttribute(k,v){this.attributes[k]=v;},setCustomValidity(v){this.validationMessage=v;}});return fields.get(name);};
const element=name=>{if(!elements.has(name))elements.set(name,{});return elements.get(name);};
for(const [key,value] of Object.entries(core.SIMULATION_DEFAULTS))field(key).value=value;
field("earthquakeType").value="crustal";
field("magnitudeInputScale").value="Mj";
field("magnitude").value="7.0";
const ui=readFileSync(new URL("../src/ui/earthquakeSimulation.js",import.meta.url),"utf8");
const ctx=vm.createContext({field,core,modal:{querySelector:element},text:ja=>ja,
  normalizeSimulationMagnitudeInput,PointMagnitudeInputError,jshisGeometry:null,selectedFault:null});
vm.runInContext(ui.slice(ui.indexOf("  function readForm("),ui.indexOf("  function renderFaultChoices(")),ctx);
ctx.updatePointMagnitudeFields();
assert.match(element("[data-point-magnitude-note]").textContent,/計算用Mw：6\.540/);
assert.equal(field("magnitude").validationMessage,"");
assert.equal(core.normalizeSimulationOptions(ctx.readForm()).magnitude,6.54);
assert.equal(field("magnitude").attributes["aria-label"],"マグニチュード M（Mj換算参考）");
field("depthKm").value=172;ctx.updatePointMagnitudeFields();
assert.match(field("magnitude").validationMessage,/深さ0〜20km/);
field("magnitudeInputScale").value="Mw";ctx.updatePointMagnitudeFields();
assert.equal(field("magnitude").validationMessage,"");
assert.equal(core.normalizeSimulationOptions(ctx.readForm()).magnitude,7);
field("model").value="nankai-trough";field("magnitudeInputScale").value="Mj";ctx.updatePointMagnitudeFields();
assert.equal(field("magnitudeInputScale").value,"Mw");
assert.equal(element("[data-point-magnitude-scale]").hidden,true);
assert.equal(ctx.readForm().magnitudeInputScale,undefined,"point-only input metadata does not leak into presets");
console.log("Custom M input: explicit restricted conversion, Mw parity, retries, geography rejection and actual form behavior passed");
