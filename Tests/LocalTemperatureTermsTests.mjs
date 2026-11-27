import assert from "node:assert/strict";
import {test} from "node:test";
import {buildLocalTemperatureTerms,createLocalTemperatureToggle} from "../src/ui/localTemperatureTerms.js";
import {buildLocalTemperatureDetails} from "../src/ui/localTemperatureView.js";

test("terms contain the moved precision notice, independent estimate attribution, sources and location disclosure",()=>{
  const html=buildLocalTemperatureTerms({english:false});
  for(const text of ["小数第1位は表示の桁数", "統計的な信頼区間", "夜間の逆転層", "MeteoScopeが独自に推定", "実際の気温とは異なる", "周辺タイルの番号", "約80km", "同意してオン"])assert.ok(html.includes(text),text);
  assert.match(html,/https:\/\/www.jma.go.jp\/bosai\/amedas\//);assert.match(html,/https:\/\/maps.gsi.go.jp\/development\/demtile.html/);
  assert.ok(!buildLocalTemperatureTerms({english:true}).includes("小数第1位"));
  const review=buildLocalTemperatureTerms({english:false,review:true});assert.ok(!review.includes("data-temperature-terms-accept"));assert.ok(review.includes("data-temperature-terms-close"));
});
test("enable only follows confirmation; cancel remains off; disabling needs no confirmation; next enable prompts again",async()=>{
  const state={earlyAccessEnabled:true,temperatureEstimationAllowed:true,temperatureEstimationEnabled:false};let reply,prompts=0;const changes=[];
  const toggle=createLocalTemperatureToggle({getState:()=>state,onChange:enabled=>{state.temperatureEstimationEnabled=enabled;changes.push(enabled);},confirm:()=>{prompts++;return new Promise(r=>reply=r);}});
  let pending=toggle();assert.equal(state.temperatureEstimationEnabled,false);assert.equal(changes.length,0);reply(false);assert.equal(await pending,false);
  pending=toggle();reply(true);assert.equal(await pending,true);assert.equal(state.temperatureEstimationEnabled,true);
  await toggle();assert.equal(state.temperatureEstimationEnabled,false);assert.equal(prompts,2);
  pending=toggle();assert.equal(prompts,3);reply(false);await pending;assert.deepEqual(changes,[true,false]);
});
test("duplicate requests and loss of early access cannot enable the feature",async()=>{
  const state={earlyAccessEnabled:true,temperatureEstimationAllowed:true,temperatureEstimationEnabled:false};let reply,prompts=0,changes=0;
  const toggle=createLocalTemperatureToggle({getState:()=>state,onChange:()=>changes++,confirm:()=>{prompts++;return new Promise(r=>reply=r);}});
  const pending=toggle();assert.equal(await toggle(),false);assert.equal(prompts,1);
  state.earlyAccessEnabled=false;reply(true);assert.equal(await pending,false);assert.equal(changes,0);
  assert.equal(await toggle(),false);assert.equal(prompts,1);
});
test("details keep condition-specific cautions and a review link without repeating general terms",()=>{
  const html=buildLocalTemperatureDetails({kind:"estimated",method:"fixed-idw",value:10,nearest:{name:"Reference",value:11,distanceKm:10},
    targetElevation:100,stationCount:4,confidence:"low",flags:["outside-station-hull"],stations:[]});
  assert.match(html,/data-local-temperature-terms/);assert.match(html,/利用規約・出典/);assert.match(html,/観測点が現在地を囲んでいません/);
  for(const text of ["小数第1位は表示の桁数", "統計的な信頼区間", "MeteoScopeが独自に推定", "maps.gsi.go.jp/development/demtile.html"])assert.ok(!html.includes(text),text);
});
