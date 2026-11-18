import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";
import {createSimulationTermsConsent,simulationTermsMarkup,SIMULATION_TERMS_KEY,SIMULATION_TERMS_VERSION} from "../src/simulation/simulationTerms.js";

const values=new Map(),storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
const consent=createSimulationTermsConsent(()=>storage);
assert.equal(consent.isAccepted(),false);
values.set(SIMULATION_TERMS_KEY,"old-version");assert.equal(consent.isAccepted(),false,"changed terms require new consent");
consent.accept();assert.equal(values.get(SIMULATION_TERMS_KEY),SIMULATION_TERMS_VERSION);
assert.equal(createSimulationTermsConsent(()=>storage).isAccepted(),true,"acceptance survives reload in the same browser");
const blocked=()=>{throw new Error("Storage disabled");};
const privateSession=createSimulationTermsConsent(blocked);
assert.equal(privateSession.isAccepted(),false);privateSession.accept();assert.equal(privateSession.isAccepted(),true);
assert.equal(createSimulationTermsConsent(blocked).isAccepted(),false,"without storage, a new page requires consent again");

// Execute the actual terms UI and open/close routing against a minimal DOM.
// No real consent is stored and no browser/network/data request is made.
const source=readFileSync(new URL("../src/ui/earthquakeSimulation.js",import.meta.url),"utf8");
function harness(termsConsent){
  const controls=new Map();let markup="",formCount=0,focusCount=0;
  const control=key=>{
    if(!controls.has(key))controls.set(key,{disabled:key.includes("terms-accept"),checked:false,
      listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},setAttribute(){},focus(){focusCount++;}});
    return controls.get(key);
  };
  const modalBody={get innerHTML(){return markup;},set innerHTML(value){markup=value;controls.clear();},scrollTop:0};
  const modal={hidden:true,querySelector(key){
    if(key==="#simulation-title"||key===".warning-modal-close"||key==="[data-simulation-close]")return control(key);
    const attr=key.match(/^\[(data-[^\]]+)\]$/u)?.[1];
    return attr&&markup.includes(attr)?control(key):null;
  }};
  const origin={focus(){focusCount++;}};
  const context=vm.createContext({termsConsent,simulationTermsMarkup,showingTerms:false,pendingFault:null,core:null,
    modal,modalBody,button:{setAttribute(){}},document:{activeElement:origin,body:{classList:{add(){},remove(){}}},querySelector:()=>null},
    getMap:()=>null,showNotice(){},player:null,lastFocused:null,picking:false,
    modelImportSequence:0,faultCatalogController:null,faultModelController:null,faultModelLoading:false,marineModelData:null,
    preparation:null,lastValues:null,selectedFault:null,selectedCaseId:"",field:name=>markup==="<form></form>"&&name==="model"?{value:context.lastValues?.model??"point"}:null,
    text:ja=>ja,getCurrentLanguage:()=>"ja",console,
    renderForm(){formCount++;markup="<form></form>";controls.clear();context.showingTerms=false;},loadSelectedFault(){},stop(){},readForm(){return {model:"point",magnitude:6.5};}});
  const labelStart=source.indexOf("  function updateModalLabels("),labelEnd=source.indexOf("  updateModalLabels();",labelStart);
  vm.runInContext(source.slice(labelStart,labelEnd),context);
  vm.runInContext(source.slice(source.indexOf("  function renderTerms("),source.indexOf("  function setPlaybackMinimized(")),context);
  return {context,control,markup:()=>markup,formCount:()=>formCount,focusCount:()=>focusCount,origin};
}
const unaccepted=createSimulationTermsConsent(()=>({getItem:()=>null,setItem(){}}));
const h=harness(unaccepted);
const fault={name:"pending source"};
await h.context.open({fault});
assert.equal(h.context.showingTerms,true);assert.equal(h.context.modal.hidden,false);
assert.equal(h.context.core,null,"first-use gate precedes dynamic model import");
assert.equal(h.formCount(),0);assert.equal(unaccepted.isAccepted(),false,"showing the terms is not consent");
assert.equal(h.context.pendingFault,fault,"fault-map launch retains the requested source");
assert.equal(h.control("[data-simulation-terms-accept]").disabled,true);
h.control("[data-simulation-terms-accept]").listeners.click();assert.equal(unaccepted.isAccepted(),false,"an unchecked checkbox cannot be bypassed");
h.context.close();assert.equal(h.context.modal.hidden,true);assert.equal(unaccepted.isAccepted(),false);
assert.equal(h.context.pendingFault,null);assert.ok(h.focusCount()>0);

await h.context.open();
const checkbox=h.control("[data-simulation-terms-check]"),accept=h.control("[data-simulation-terms-accept]");
checkbox.checked=true;checkbox.listeners.change();assert.equal(accept.disabled,false);
checkbox.checked=false;checkbox.listeners.change();assert.equal(accept.disabled,true);
checkbox.checked=true;checkbox.listeners.change();
h.context.core={}; // A loaded core is sufficient; renderForm is counted above.
accept.listeners.click();await Promise.resolve();
assert.equal(unaccepted.isAccepted(),true);assert.equal(h.formCount(),1);
assert.equal(h.context.modal.hidden,false,"accepted settings open without a routing failure");
assert.equal(h.context.lastFocused,h.origin,"acceptance must not replace return-focus with a removed button");
h.context.close();await h.context.open();assert.equal(h.formCount(),2,"subsequent opens skip the terms");
h.context.renderTerms(true);assert.ok(h.markup().includes("data-simulation-terms-back"));
assert.ok(!h.markup().includes("data-simulation-terms-accept"),"review does not ask to accept again");
h.control("[data-simulation-terms-back]").listeners.click();await Promise.resolve();assert.equal(h.formCount(),3);
assert.equal(unaccepted.isAccepted(),true);

// The start path is gated too, even if called from a stale form callback.
let shown=0;
const startContext=vm.createContext({termsConsent:createSimulationTermsConsent(()=>null),renderTerms:()=>shown++,
  modal:{querySelector(){throw new Error("Should not access form/data before consent");}}});
vm.runInContext(source.slice(source.indexOf("  async function start("),source.indexOf("  function stop(")),startContext);
await startContext.start();assert.equal(shown,1);

const launch=harness(createSimulationTermsConsent(()=>null));
await launch.context.open({fault});
launch.context.core={SIMULATION_DEFAULTS:{},buildActiveFaultPreset:input=>({fault:input,longitude:135,latitude:35,depthKm:10,magnitudeValue:6.9})};
launch.control("[data-simulation-terms-check]").checked=true;
launch.control("[data-simulation-terms-accept]").listeners.click();await Promise.resolve();
assert.equal(launch.context.selectedFault,fault);assert.equal(launch.context.lastValues.magnitude,6.9,"fault details survive first-use consent");
for(const [english,expected] of [[false,"低い震度表示は安全を意味しません"],[true,"A lower displayed intensity does not mean safety"]]){
  const markup=simulationTermsMarkup(english);assert.ok(markup.includes(expected));
  assert.match(markup,/Mw(?:を)?8\.3/u);assert.ok(markup.includes("SMGA"));assert.ok(markup.includes("data-simulation-terms-accept disabled"));
}
console.log("Simulation terms: first-open gate, no model import before consent, explicit checkbox, decline/reopen, stored version, blocked storage, review/return, source preservation and start guard passed");
