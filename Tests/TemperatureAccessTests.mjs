import assert from "node:assert/strict";
import { test } from "node:test";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { buildEarlyAccessState } from "../src/ui/earlyAccess.js";
import { canUseTemperatureEstimation, effectiveTemperatureSource, createTemperatureSourceSelector } from "../src/preferences/temperatureSource.js";
import { getAccountEarlyAccess, setAccountEarlyAccess } from "../functions/_shared/accountEarlyAccess.js";

test("production requires authenticated administrator grant; local development remains available", () => {
  for (const access of [null, {}, {active:true}, {active:true,authenticated:false}, {active:false,authenticated:true}, {active:"true",authenticated:true}]) {
    const state=buildEarlyAccessState(access);
    assert.equal(state.temperatureEstimationAllowed,false);
    assert.equal(canUseTemperatureEstimation({...state,earlyAccessEnabled:state.active}),false);
    assert.equal(effectiveTemperatureSource("meteoscope",state.temperatureEstimationAllowed),"nearest");
  }
  const state=buildEarlyAccessState({active:true,authenticated:true});
  assert.equal(canUseTemperatureEstimation({...state,earlyAccessEnabled:state.active}),true);
  const local=buildEarlyAccessState(null,{localDevelopment:true});
  assert.equal(local.temperatureEstimationAllowed,true);assert.equal(local.active,true);
  assert.equal(canUseTemperatureEstimation({...local,earlyAccessEnabled:local.active}),true);
  assert.equal(canUseTemperatureEstimation({earlyAccessEnabled:true}),false);
  assert.equal(effectiveTemperatureSource("jma",false),"jma");
});

test("the existing account grant is account-specific and revocation removes independent estimation access", async () => {
  const records=new Map();
  const db={prepare(sql){return {bind(...args){this.args=args;return this;},async first(){
    if(sql.includes("FROM quiz_sessions"))return {id:"test-account"};
    const value=records.get(this.args[0]);return value===undefined?null:{value};
  },async run(){
    if(sql.startsWith("INSERT"))records.set(this.args[0],this.args[1]);
    if(sql.startsWith("DELETE"))records.delete(this.args[0]);
  }}}};
  const request=new Request("https://example.test/api/public/early-access",{headers:{Authorization:"Bearer test-session"}});
  const allowed=async()=>buildEarlyAccessState(await getAccountEarlyAccess(request,db)).temperatureEstimationAllowed;
  assert.equal(await allowed(),false);await setAccountEarlyAccess(db,"different-account",true);assert.equal(await allowed(),false);
  await setAccountEarlyAccess(db,"test-account",true);assert.equal(await allowed(),true);
  await setAccountEarlyAccess(db,"test-account",false);assert.equal(await allowed(),false);
});

test("settings hide custom source, explanation, terms and feature-list entry, including an old saved custom choice", async () => {
  const file=await readFile(new URL("../src/ui/settingsModal.js",import.meta.url),"utf8");
  const body=file.slice(file.indexOf("function renderSettingsAmedasChart()"),file.indexOf("function renderSettingsMyAreas()"));
  const element=(dataset={})=>({hidden:false,disabled:false,dataset,attributes:{},setAttribute(k,v){this.attributes[k]=v;}});
  const nearest=element({settingsTemperatureSource:"nearest"}),custom=element({settingsTemperatureSource:"meteoscope"}),jma=element({settingsTemperatureSource:"jma"});
  const protectedElements=[custom,element(),element(),element()];
  let state={earlyAccessEnabled:true,temperatureEstimationAllowed:false,temperatureEstimationEnabled:true,temperatureSource:"meteoscope"};
  const ctx=vm.createContext({canUseTemperatureEstimation,effectiveTemperatureSource,settingsOptions:{getState:()=>state},document:{
    querySelector:s=>s.includes('="meteoscope"')?custom:null,
    querySelectorAll:s=>s==="[data-settings-temperature-access]"?protectedElements:s==="[data-settings-temperature-source]"?[nearest,custom,jma]:[]
  }});
  vm.runInContext(body,ctx);ctx.renderSettingsAmedasChart();
  assert.ok(protectedElements.every(e=>e.hidden));assert.equal(custom.disabled,true);assert.equal(nearest.attributes["aria-checked"],"true");
  state={...state,temperatureEstimationAllowed:true};ctx.renderSettingsAmedasChart();
  assert.ok(protectedElements.every(e=>!e.hidden));assert.equal(custom.disabled,false);assert.equal(custom.attributes["aria-checked"],"true");
  state={...state,earlyAccessEnabled:false};ctx.renderSettingsAmedasChart();assert.ok(protectedElements.every(e=>e.hidden));
  const html=await readFile(new URL("../index.html",import.meta.url),"utf8");
  const tags=[...html.matchAll(/<[^/!][^>]*data-settings-temperature-access[^>]*>/g)].map(m=>m[0]);
  assert.equal(tags.length,4);assert.ok(tags.every(tag=>/\bhidden\b/.test(tag)),"no initial-load flash before authentication");
});

test("saved opt-in cannot enable an unapproved user, and revocation while consent is open cancels enable", async () => {
  let state={earlyAccessEnabled:true,temperatureEstimationAllowed:false,temperatureEstimationEnabled:true};let changes=0,confirmations=0,reply;
  const select=createTemperatureSourceSelector({getState:()=>state,onChange:()=>changes++,confirm:()=>{confirmations++;return new Promise(r=>reply=r);}});
  assert.equal(await select("meteoscope"),false);assert.equal(confirmations,0);assert.equal(changes,0);
  state={...state,temperatureEstimationAllowed:true,temperatureEstimationEnabled:false};const pending=select("meteoscope");
  state={...state,temperatureEstimationAllowed:false};reply(true);assert.equal(await pending,false);assert.equal(changes,0);
  assert.equal(await select("jma"),true);assert.equal(changes,1);
});
