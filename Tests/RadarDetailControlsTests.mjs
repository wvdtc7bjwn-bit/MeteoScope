import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import {escapeHtmlString as escapeHtml} from "../src/utils/html.js";

const panel=await readFile(new URL("../src/ui/leftPanel.js",import.meta.url),"utf8");
const app=await readFile(new URL("../src/app.js",import.meta.url),"utf8");
const element=()=>({hidden:false,disabled:false,textContent:"",innerHTML:"",attrs:{},classes:new Set(),setAttribute(key,value){this.attrs[key]=value},querySelector(){return this.label??=(element())},classList:{toggle(){}}});
const nodes=new Map(["radar-time-controls","radar-time-slider","radar-time-label","radar-time-caption","radar-time-kind","radar-time-range","radar-time-timeline","radar-prev","radar-next","radar-now","radar-play","weather-chart-controls"].map(id=>[id,element()]));
const context=vm.createContext({document:{getElementById:id=>nodes.get(id)},localizeText:x=>x,escapeHtml,
 clampIndex:(i,n)=>Math.max(0,Math.min(n-1,Number(i)||0)),
 findLatestRadarObservationIndex:frames=>frames.findLastIndex(f=>!f.isForecast),
 findLatestWeatherChartAnalysisIndex:frames=>frames.findLastIndex(f=>f.chartKind!=="forecast"),
 getRadarFrameKindLabel:f=>f?.isForecast?"予測":"観測",
 getWeatherChartFrameKindLabel:f=>f?.chartKind==="forecast"?"予想":"実況",
 getWeatherDistributionLabel:()=>"天気分布予報",formatWarningTime:x=>x,renderWeatherTimeTimeline:()=>{}});
vm.runInContext(panel.slice(panel.indexOf("function compactWeatherTimeLabel("),panel.indexOf("function syncWeatherTimelineActiveTick(")),context);
vm.runInContext(panel.slice(panel.indexOf("function buildWeatherTimeTimelineMarkup("),panel.indexOf("function renderWeatherTimeTimeline(")),context);
vm.runInContext(panel.slice(panel.indexOf("function getRadarTimeReadout("),panel.indexOf("function renderTyphoonSelector(")),context);
const frames=[{label:"2026/11/20 23:55"},{label:"2026/11/21 00:00",isForecast:true}];
for(const extra of [{},{lightningEnabled:true,lightningStatus:"ok",lightning:{frames,activeFrameIndex:1}},{weatherDistributionMode:"weather",weatherDistributionStatus:"ok",weatherDistribution:{frames,activeFrameIndex:1}}]) {
 context.renderRadarControls({id:"radar"},{status:"ok",data:{frames,activeFrameIndex:1},...extra});
 assert.equal(nodes.get("radar-time-label").textContent,"00:00");
 assert.match(nodes.get("radar-time-caption").textContent,/11\/21/);
 assert.match(nodes.get("radar-time-slider").attrs["aria-valuetext"],/2026\/11\/21 00:00/);
 assert.equal(nodes.get("radar-next").disabled,true);
 assert.equal(nodes.get("radar-prev").disabled,false);
 assert.match(nodes.get("radar-time-range").innerHTML,/11\/20 23:55[^]*11\/21 00:00/);
}
context.renderRadarControls({id:"radar"},{status:"loading",data:{frames:[]}});
assert.equal(nodes.get("radar-time-label").textContent,"--:--");
assert.equal(nodes.get("radar-play").disabled,true);
assert.equal(nodes.get("radar-prev").disabled,true);
const chart={frames:frames.map((f,i)=>({latestTime:f.label,chartKind:i?"forecast":"analysis"})),activeFrameIndex:1};
context.renderWeatherChartControls({id:"radar"},true,"ok",chart,true);
let markup=nodes.get("weather-chart-controls").innerHTML;
assert.equal((markup.match(/data-weather-chart-action=/g)||[]).length,4);
assert.match(markup,/data-weather-chart-action="play"[^>]*aria-pressed="true"[^>]*><span>停止/);
assert.match(markup,/予測時刻 · 11\/21/);
assert.match(markup,/>00:00</);
for(const count of [0,1,2]) {
 const satellite={enabled:true,status:count?"ok":"loading",frames:frames.slice(0,count).map(f=>({observedAt:f.label})),activeFrameIndex:Math.max(0,count-1),playing:false};
 context.renderRadarControls({id:"radar"},{weatherChartSatellite:satellite});
 assert.equal(nodes.get("radar-time-controls").hidden,false,"Satellite detail container is visible");
 context.renderWeatherChartControls({id:"radar"},false,"idle",null,false,satellite);
 markup=nodes.get("weather-chart-controls").innerHTML;
 assert.equal((markup.match(/data-weather-satellite-action=/g)||[]).length,4);
 assert.match(markup,/data-weather-satellite-slider/);
 const playTag=markup.match(/<button[^>]*data-weather-satellite-action="play"[^>]*>/)[0];
 assert.equal(playTag.includes(" disabled"),count<2,"No playback without multiple real frames");
}

// Exercise the actual satellite timer: looping, latest, tab exit and single-frame guard.
let tick,cleared=0;
const player=vm.createContext({weatherChartSatellitePlayTimer:null,weatherChartSatelliteEnabled:true,activeTab:"radar",weatherChartSatelliteFrames:[{},{},{}],activeWeatherChartSatelliteFrameIndex:0,
 window:{setInterval:callback=>{tick=callback;return 1},clearInterval:()=>cleared++},refreshRadarPanel:()=>{},setWeatherChartSatelliteFrame:index=>{player.activeWeatherChartSatelliteFrameIndex=index;}});
vm.runInContext(app.slice(app.indexOf("  function startWeatherChartSatellitePlayback("),app.indexOf("  function stopWeatherChartPlayback(")),player);
player.startWeatherChartSatellitePlayback();tick();assert.equal(player.activeWeatherChartSatelliteFrameIndex,1);
tick();tick();assert.equal(player.activeWeatherChartSatelliteFrameIndex,0);
player.goLatestWeatherChartSatelliteFrame();assert.equal(player.activeWeatherChartSatelliteFrameIndex,2);assert.equal(cleared,1);
player.startWeatherChartSatellitePlayback();player.activeTab="warnings";tick();assert.equal(player.weatherChartSatellitePlayTimer,null);
player.activeTab="radar";player.weatherChartSatelliteFrames=[{}];player.startWeatherChartSatellitePlayback();assert.equal(player.weatherChartSatellitePlayTimer,null);
console.log("Radar detail controls: all modes, dates, boundaries, disabled states and satellite playback OK");
