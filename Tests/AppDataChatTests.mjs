import assert from "node:assert/strict";
import {loadWarningChatContext} from "../functions/_shared/warningChatContext.js";
import {buildWarningChatMessages,parseWarningChatAnswer} from "../functions/_shared/warningChatAnswer.js";
import {resolveWarningChatQuestionSelection,isMunicipalEvacuationQuestion,excludedWarningChatSubject} from "../src/ai/warningChatPolicy.js";
import {normalizeWorldTyphoonForecast} from "../src/worldTyphoon.js";

const NOW=Date.parse("2026-11-16T10:00:00+09:00"),ISSUE="2026-11-16T10:00:00+09:00";
const catalog={offices:{"130000":{name:"東京都"}},class10s:{"130010":{parent:"130000"}},class15s:{"130011":{parent:"130010"}},class20s:{"1310100":{name:"千代田区",parent:"130011"}}};
const stations={"44132":{kjName:"東京",lat:[35,41],lon:[139,45]},"44172":{kjName:"別地点",lat:[34,45],lon:[139,21]}};
const forecast=[{part:"title",typhoonNumber:"2609",name:{jp:"試験台風",en:"Fixture"},issue:{JST:ISSUE}},
  {advancedHours:0,center:{lat:25,lon:135},validtime:{JST:ISSUE}},
  {advancedHours:24,center:{lat:27,lon:134},validtime:{JST:"2026-11-17T10:00:00+09:00"},probabilityCircle:{radius:100}}];
const feedEntry=(title,stamp,url)=>`<entry><title>${title}</title><updated>${stamp}</updated><id>${url}</id></entry>`;
const riverOld="https://www.data.jma.go.jp/developer/xml/data/20261115000000_VXKO50_130000.xml";
const riverNew="https://www.data.jma.go.jp/developer/xml/data/20261116000000_VXKO50_130000.xml";
let calls=[];
function fetcher(extra={}) {
  return async(url,options)=>{
    url=String(url);calls.push(url);
    if(Object.hasOwn(extra,url)) return extra[url] instanceof Response?extra[url].clone():Response.json(extra[url]);
    if(url.endsWith("common/const/area.json")) return Response.json(catalog);
    if(url.endsWith("amedas/data/latest_time.txt")) return new Response(ISSUE);
    if(url.endsWith("amedastable.json")) return Response.json(stations);
    if(url.includes("amedas/data/map/")) return Response.json({"44132":{temp:[13.2,0],precipitation1h:[0,0],wind:[2.1,0],humidity:[null,1]},"44172":{temp:[18.2,0],precipitation1h:[5,0]}});
    if(url.endsWith("forecast/const/week_area.json")) return Response.json({"130000":[{srf:"130010",week:"130010",amedas:"44132"}]});
    if(url.endsWith("typhoon/data/targetTc.json")) return Response.json([{tropicalCyclone:"TC2609"}]);
    if(url.endsWith("TC2609/forecast.json")) return Response.json(forecast);
    if(url.endsWith("TC2609/specifications.json")) return Response.json([{advancedHours:0,pressure:975,maximumWind:{sustained:{"m/s":35},gust:{"m/s":50}}}]);
    if(url.endsWith("volcano/data/info/900.json")) return Response.json({reportDatetime:"2026-11-01T16:00:00+09:00",volcanoInfos:[]});
    if(url.endsWith("volcano/const/volcano_list.json")) return Response.json([{code:"506",name_jp:"桜島",latlon:["31.5","130.6"],levelOperation:true}]);
    if(url.endsWith("volcano/data/warning.json")) return Response.json([{reportDatetime:"2026-11-01T16:00:00+09:00",eventId:"506",volcanoInfos:[{type:"噴火警報・予報（対象火山）",items:[{code:"13",name:"レベル３（入山規制）",condition:"継続",areas:[{code:"506",name:"桜島"}]}]}]}]);
    if(url.includes("targetTimes")) return Response.json([{basetime:"20261116000000",validtime:"20261116003000"},{basetime:"20261116000500",validtime:"20261116004000"}]);
    if(url.endsWith("tidelevel/const/tide_area.json")) return Response.json({"130000":{class30s:[{stations:[{code:"130001",name:"東京",lat:35,lon:139,reference:"TP"}]}]}});
    if(url.endsWith("tide_time.json")) return Response.json({time:ISSUE});
    if(url.includes("tide_obs_")) return Response.json({time:ISSUE,interval:60,tide:[120]});
    if(url.includes("tide_astro_")) return new Response("",{status:503});
    if(url.endsWith("extra.xml")) return new Response(`<feed>${feedEntry("利根川洪水予報","2026-11-15T10:00:00+09:00",riverOld)}${feedEntry("利根川洪水予報",ISSUE,riverNew)}</feed>`);
    if(url===riverOld) throw new Error("Old duplicate must not be read");
    if(url===riverNew) return new Response(`<Report><Head><ReportDateTime>${ISSUE}</ReportDateTime><Title>利根川洪水予報</Title><InfoType>発表</InfoType><Headline><Text>利根川の資料見出し</Text></Headline></Head><Body><Text>対象河川の公表資料</Text></Body></Report>`);
    throw new Error(`Unexpected URL: ${url}`);
  };
}
const load=(kind,question,source=fetcher())=>loadWarningChatContext("1310100",{weatherScope:kind,question,fetcher:source,fresh:true,now:NOW});
const cases=[["今の気温は？","amedas"],["現在の台風は？","typhoon"],["桜島の火山の警戒は？","volcano"],["雷ナウキャストはいつ？","lightning"],["東京の潮位は？","tide"],["利根川の氾濫情報は？","river"],["雨雲レーダーの時刻は？","radar"],["ECMWFの台風予測は？","models"],["千代田区のハザードマップは？","hazard"]];
for(const [question,kind] of cases) assert.equal(resolveWarningChatQuestionSelection({topic:"earthquake",question,language:"ja"}).weatherScope,kind);
for(const question of ["避難指示は？","避難所はどこ？","安全な避難経路は？","Are nearby shelters open?"]) assert.equal(isMunicipalEvacuationQuestion(question),true);
assert.equal(isMunicipalEvacuationQuestion("地震のとき身を守るには？"),false);
for(const question of ["最新のEEWは？","館野のエマグラムは？","最新の天気図は？"]) assert.ok(excludedWarningChatSubject(question));
const amedas=await load("amedas","現在の気温は？");
assert.equal(amedas.appData.stations[0].name,"東京");assert.equal(amedas.appData.stations[0].values.temperature,13.2);assert.equal(amedas.appData.stations[0].values.precipitation1h,0);
assert.equal(amedas.appData.stations[0].values.humidity,null);assert.equal(amedas.appData.stations[0].coordinates,undefined);assert.match(amedas.appData.selection,/代表地点/);
assert.equal((await load("amedas","別地点のアメダスの気温は？")).appData.stations[0].name,"別地点");
assert.equal((await load("amedas","全国の気温ランキングは？")).appData.ranking.highest[0].name,"別地点");
assert.match((await load("amedas","全国の気温ランキングは？")).appData.ranking.meaning,/日最高.*ではない/);
const tropical=await load("typhoon","台風の現在の中心気圧は？");assert.equal(tropical.appData.systems[0].details.pressure,"975 hPa");assert.equal(tropical.appData.systems[0].forecastTimes[0].validAt,"2026-11-17T10:00:00+09:00");
const empty=await load("typhoon","台風は？",fetcher({"https://www.jma.go.jp/bosai/typhoon/data/targetTc.json":[]}));assert.equal(empty.appData.availability,"empty");
await assert.rejects(load("typhoon","台風は？",fetcher({"https://www.jma.go.jp/bosai/typhoon/data/targetTc.json":new Response("",{status:503})})));
await assert.rejects(load("typhoon","台風は？",fetcher({"https://www.jma.go.jp/bosai/typhoon/data/targetTc.json":[{id:"../admin"}]})));
const volcano=await load("volcano","桜島の火山の警戒は？");assert.equal(volcano.appData.volcanoes[0].level,3);assert.match(volcano.appData.volcanoes[0].issuedAt,/11-01/);
const rain=await load("radar","雨雲の時刻は？");assert.equal(rain.appData.series[0].lastValidTime,"2026-11-16T00:40:00Z");assert.equal(rain.appData.rainfall,undefined);assert.match(rain.appData.interpretation,/画像そのものをAIへ送信・解析していない/);
await assert.rejects(load("radar","雨雲は？",fetcher({"https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json":[]})));
const tide=await load("tide","東京の潮位は？");assert.equal(tide.appData.latest.observed,120);assert.equal(tide.appData.latest.astronomical,null);assert.equal(tide.appData.unit,"cm");
assert.equal((await load("tide","現在の潮位は？")).appData.availability,"choose-station");
const river=await load("river","利根川の氾濫情報は？");assert.equal(river.appData.reports[0].issuedAt,ISSUE);assert.match(river.appData.reports[0].headline,/利根川/);assert.equal(calls.includes(riverOld),false);
assert.equal((await load("river","指定河川洪水予報は？")).appData.reports.length,1,"generic river query does not accidentally search for a river named 指定河川");
const unknown=await load("river","荒川の氾濫情報は？");assert.equal(unknown.appData.availability,"extended-source-unavailable");assert.equal(unknown.appData.reports.length,0);assert.match(unknown.appData.limitation,/洪水予報なし.*意味しない/);
for(const kind of ["simulation","geology","community"]) {
  const reference=await load(kind,"資料について教えて");assert.equal(reference.appData.availability,"reference-only");assert.ok(reference.appData.explanation);
}
const modelFixture={schemaVersion:1,source:{model:"IFS",license:"CC BY 4.0",attribution:"ECMWF"},systems:[]};
assert.deepEqual(normalizeWorldTyphoonForecast(modelFixture).systems,[]);
assert.throws(()=>normalizeWorldTyphoonForecast({...modelFixture,source:{...modelFixture.source,license:"wrong"}}));
for(const context of [amedas,tropical,empty,volcano,rain,tide,river]) {
  const messages=buildWarningChatMessages({question:"取得した内容は？",language:"ja",history:[]},context);
  assert.ok(new TextEncoder().encode(JSON.stringify(messages)).length<12288);
  assert.match(messages[0].content,/Municipal evacuation orders.*excluded/);
  assert.match(messages[0].content,/Image time metadata is NOT an image analysis/);
  assert.deepEqual(parseWarningChatAnswer({response:JSON.stringify({answer:"取得した資料を確認しました。",evidenceIds:["app-data"]})},context).evidenceIds,["app-data"]);
  assert.throws(()=>parseWarningChatAnswer({response:JSON.stringify({answer:"999999mmです。",evidenceIds:["app-data"]})},context));
}
assert.ok(calls.every(url=>/^https:\/\/(?:www\.jma\.go\.jp|www\.data\.jma\.go\.jp|api\.wolfx\.jp)\//u.test(url)),"only fixed public sources were fetched");
console.log("App data chat: dispatch, observations/forecasts, missing/stale values, source boundaries, named stations, river revisions, image limits, model validation and inference evidence passed.");
