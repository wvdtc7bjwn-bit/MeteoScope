import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {hashQuizToken} from "../functions/_shared/quizSecurity.js";
import {loadWarningChatContext} from "../functions/_shared/warningChatContext.js";
import {buildWarningChatMessages, parseWarningChatAnswer} from "../functions/_shared/warningChatAnswer.js";
import {buildWeatherChatFacts, usesWeatherChatFacts} from "../functions/_shared/warningChatWeatherFacts.js";
import {resolveWarningChatQuestionSelection} from "../src/ai/warningChatPolicy.js";
import {weatherChatPeriod, weatherChatQuestionPeriod} from "../src/ai/warningChatWeatherQuery.js";
import {onRequest} from "../functions/api/warning-chat.js";

const NOW = Date.parse("2026-11-16T10:00:00+09:00"), ISSUE = "2026-11-16T05:00:00+09:00";
const D0 = "2026-11-16T00:00:00+09:00", D1 = "2026-11-17T00:00:00+09:00", D2 = "2026-11-18T00:00:00+09:00";
const catalog = {offices:{"130000":{name:"東京都", children:["130010","130020"]}},
  class10s:{"130010":{name:"東京地方", parent:"130000", children:["130011"]},"130020":{name:"島",parent:"130000",children:["130021"]}},
  class15s:{"130011":{parent:"130010",children:["1310100"]},"130021":{parent:"130020",children:["1320100"]}},
  class20s:{"1310100":{name:"千代田区",parent:"130011"},"1320100":{name:"別地域",parent:"130021"}}};
const mapping = {"130000":[{srf:"130020",week:"130020",amedas:"44172"},{srf:"130010",week:"130010",amedas:"44132"}]};
const rawForecast = [{reportDatetime:ISSUE,timeSeries:[
  {timeDefines:[D0,D1],areas:[{area:{code:"130020",name:"島"},weathers:["島の天気","島の天気"]},{area:{code:"130010",name:"東京地方"},weathers:["晴れ","くもり のち 雨"],winds:["北の風","南の風"],waves:["0.5メートル","1メートル"]}]},
  {timeDefines:["2026-11-17T00:00:00+09:00","2026-11-17T06:00:00+09:00"],areas:[{area:{code:"130010",name:"東京地方"},pops:["0","70"]}]},
  {timeDefines:["2026-11-16T09:00:00+09:00",D0,D1,"2026-11-17T09:00:00+09:00"],areas:[{area:{code:"44172",name:"島の地点"},temps:["99","99","99","99"]},{area:{code:"44132",name:"東京"},temps:["19","19","-1","13"]}]}
]},{reportDatetime:"2026-11-15T17:00:00+09:00",timeSeries:[
  {timeDefines:[D0,D1,D2],areas:[{area:{code:"130010",name:"東京地方"},weatherCodes:["100","200","203"],pops:["","60","80"],reliabilities:["","","A"]}]},
  {timeDefines:[D0,D1,D2],areas:[{area:{code:"44132",name:"東京"},tempsMin:["","0","8"],tempsMax:["","14","17"]}]}
]}];
const earlySeries = (code,probabilities) => ({timeDefines:[D1,D2],areas:[{code,properties:[{type:"大雨の警報級の可能性",probabilities},{type:"波の警報級の可能性",probabilities:["高","高"]}]}]});
const earlyRaw = [[{reportDatetime:ISSUE,timeSeries:[earlySeries("130100",["中",""]),earlySeries("130020",["高","高"])]}]];
function fetcher({forecast=rawForecast,early=earlyRaw,fail=""}={}) {
  return async url => {
    url=String(url);
    if(fail && url.includes(fail)) return new Response("unavailable",{status:503});
    if(url.endsWith("common/const/area.json")) return Response.json(catalog);
    if(url.endsWith("forecast/const/week_area.json")) return Response.json(mapping);
    if(url.endsWith("forecast/const/week_area05.json")) return Response.json({"130010":["130100"],"130020":["130020"]});
    if(url.endsWith("warning/const/no_wave_tide.json")) return Response.json({wave:{class20s:{"130010":["1310100"]}},tide:{}});
    if(url.endsWith("forecast/data/forecast/130000.json")) return Response.json(forecast);
    if(url.endsWith("probability/r8/map.json")) return Response.json(early);
    throw new Error(`Unexpected source ${url}`);
  };
}
const input={areaCode:"1310100",topic:"weather",question:"明日の天気は？",language:"ja",consent:true,history:[]};
for(const [question,scope] of [["明日の天気は？","forecast"],["明後日雨は降る？","forecast"],["週間天気予報は？","forecast"],["明日の早期注意情報は？","early"],["大雨の警報級の可能性は？","early"]]) {
  assert.equal(resolveWarningChatQuestionSelection({...input,topic:"earthquake",question}).weatherScope,scope);
}
assert.equal(resolveWarningChatQuestionSelection({...input,weatherScope:"forecast",question:"現在発表中の警報は？"}).weatherScope,undefined);
assert.equal(resolveWarningChatQuestionSelection({...input,question:"降水確率とは？"}).weatherScope,undefined);
assert.equal(resolveWarningChatQuestionSelection({...input,question:"早期注意情報とは？"}).weatherScope,undefined);
assert.equal(resolveWarningChatQuestionSelection({...input,question:"気温は？",history:[{role:"user",content:"明日の天気は？"}]}).weatherScope,"forecast");
assert.equal(weatherChatQuestionPeriod({...input,question:"気温は？",history:[{role:"user",content:"明日の天気は？"}]},NOW).start,"2026-11-17");
assert.equal(weatherChatPeriod("今日",Date.parse("2026-11-16T15:10:00Z")).start,"2026-11-17");
assert.equal(weatherChatPeriod("明日の早期注意情報",NOW,5).end,"2026-11-18");
assert.equal(weatherChatPeriod("2月30日",NOW),null);
const context=await loadWarningChatContext(input.areaCode,{weatherScope:"forecast",fetcher:fetcher(),now:NOW});
assert.equal(context.forecast.days[0].temperature.minC,null,"today's repeated maximum must not become a minimum");
assert.equal(context.forecast.days[1].temperature.minC,-1);
assert.equal(context.forecast.days[1].temperature.maxC,13,"short-term value overrides older weekly value");
assert.equal(context.forecast.days[2].temperature.maxC,17);
assert.ok(context.forecast.days.every(row=>row.areaName==="東京地方"));
assert.equal(context.forecast.precipitationSlots[0].percent,0,"zero is a valid probability");
const sharedBase=fetcher();
const shared=await loadWarningChatContext(input.areaCode,{weatherScope:"forecast",now:NOW,fetcher:async(url,options)=>{
  if(String(url).endsWith("forecast/const/week_area.json")) return Response.json({...mapping,"140000":[{srf:"140010",week:"130010",amedas:"44172"}]});
  if(String(url).endsWith("forecast/130000.json")) return new Response("",{status:404});
  if(String(url).endsWith("forecast/140000.json")) return Response.json(rawForecast);
  return sharedBase(url,options);
}});
assert.equal(shared.forecast.shortTermArea.code,"130010");
assert.ok(shared.sources.some(source=>source.url.endsWith("forecast/140000.json")),"a shared source is used only after confirming the requested region");
const answer=buildWeatherChatFacts(input,context);
assert.match(answer.answer,/2026-11-17.*くもり のち 雨/s);
assert.doesNotMatch(answer.answer,/島の天気|日降水確率70|最高14℃/);
assert.match(answer.answer,/最低-1℃・最高13℃/);
assert.match(answer.answer,/70%/);
assert.deepEqual(answer.evidenceIds,["forecast"]);
assert.ok(usesWeatherChatFacts(input,"forecast"));
assert.equal(usesWeatherChatFacts({...input,question:"大阪の明日の天気は？"},"forecast"),false);
assert.equal(usesWeatherChatFacts({...input,question:"明日15時に雨が降る？"},"forecast"),false);
const tempOnly=buildWeatherChatFacts({...input,question:"明日の気温は？"},context).answer;
assert.doesNotMatch(tempOnly,/くもり|70%/);
assert.match(buildWeatherChatFacts({...input,question:"明後日の降水確率は？"},context).answer,/日降水確率80%/);
assert.match(buildWeatherChatFacts({...input,question:"来週の天気は？"},context).answer,/指定した日の予報は取得した資料にありません/);
assert.equal(weatherChatPeriod("来週",NOW).start,"2026-11-23");
assert.equal(weatherChatPeriod("今週",Date.parse("2026-11-20T10:00:00+09:00")).end,"2026-11-23");
const early=await loadWarningChatContext(input.areaCode,{weatherScope:"early",fetcher:fetcher(),now:NOW});
assert.equal(early.earlyWarning.areaName,"東京地方");
assert.equal(early.earlyWarning.rows.some(row=>row.type==="波浪"),false,"inland exclusions are preserved");
const earlyAnswer=buildWeatherChatFacts({...input,question:"明日の大雨の早期注意情報は？"},early).answer;
assert.match(earlyAnswer,/大雨：.*［中］/s); assert.doesNotMatch(earlyAnswer,/［高］|11\/18[^〜\n]*〜/);
assert.match(earlyAnswer,/警報の発表状況とは異なります/);
assert.match(buildWeatherChatFacts({...input,question:"明後日の大雨の早期注意情報は？"},early).answer,/［高］［中］の掲載はありません/);
const withdrawn=await loadWarningChatContext(input.areaCode,{weatherScope:"early",now:NOW,fetcher:fetcher({early:[
  {reportDatetime:"2026-11-15T17:00:00+09:00",timeSeries:[earlySeries("130100",["高",""])]},
  {reportDatetime:ISSUE,timeSeries:[earlySeries("130100",["",""])]}
]})});
assert.equal(withdrawn.earlyWarning.rows.find(row=>row.type==="大雨").slots[0].level,"掲載なし","a newer blank clears an older high potential");
for(const scope of ["forecast","early"]) {
  await assert.rejects(loadWarningChatContext(input.areaCode,{weatherScope:scope,fetcher:fetcher({fail:scope==="forecast"?"forecast/data":"probability/"}),now:NOW}));
}
await assert.rejects(loadWarningChatContext(input.areaCode,{weatherScope:"forecast",fetcher:fetcher({forecast:rawForecast.map(report=>({...report,reportDatetime:"2026-11-01T05:00:00+09:00"}))}),now:NOW}));
await assert.rejects(loadWarningChatContext("1320100",{weatherScope:"early",fetcher:fetcher({early:[]}),now:NOW}));
const updated=structuredClone(rawForecast); updated[0].timeSeries[0].areas[1].weathers[1]="雨";
assert.notEqual((await loadWarningChatContext(input.areaCode,{weatherScope:"forecast",fetcher:fetcher({forecast:updated}),now:NOW})).revision,context.revision);
for(const value of [context,early]) {
  const messages=buildWarningChatMessages({...input,language:"en"},value);
  assert.ok(new TextEncoder().encode(JSON.stringify(messages)).length<12288);
  assert.match(messages[1].content,/todayJst/);
  const id=value.forecast?"forecast":"early";
  assert.equal(parseWarningChatAnswer({response:JSON.stringify({answer:"情報を確認しました。",evidenceIds:[id]})},value).evidenceIds[0],id);
  assert.throws(()=>parseWarningChatAnswer({response:JSON.stringify({answer:"9999%です。",evidenceIds:[id]})},value));
}

// The real authenticated route: source extraction, inference and revision checking.
const sql=new DatabaseSync(":memory:");
sql.exec("CREATE TABLE app_records (key TEXT PRIMARY KEY,value TEXT NOT NULL,updated_at TEXT NOT NULL); CREATE TABLE quiz_accounts (id TEXT PRIMARY KEY,display_name TEXT); CREATE TABLE quiz_sessions (token_hash TEXT,account_id TEXT,expires_at TEXT);");
const db={prepare(query){const statement=sql.prepare(query);let args=[];return{bind(...a){args=a;return this;},async first(){return statement.get(...args)??null;},async run(){return{meta:{changes:Number(statement.run(...args).changes)}};}};}};
const token="fixture-weather-chat-session";
sql.prepare("INSERT INTO quiz_accounts VALUES (?,?)").run("fixture-user","Fixture");
sql.prepare("INSERT INTO quiz_sessions VALUES (?,?,?)").run(await hashQuizToken(token),"fixture-user","2026-12-01T00:00:00Z");
sql.prepare("INSERT INTO app_records VALUES (?,?,?)").run("early-access-account:fixture-user",'{"allowed":true}',ISSUE);
const originalFetch=globalThis.fetch, originalNow=Date.now;
let calls=0;
const env={NOTIFICATIONS_DB:db,WARNING_CHAT_ENABLED:"true",WARNING_CHAT_DAILY_LIMIT:"none",AI:{async run(_model,parameters){calls++;const evidence=JSON.parse(parameters.messages[1].content.split("\n").slice(1).join("\n"));assert.ok(evidence.forecast);return{response:JSON.stringify({answer:"The forecast is for Tokyo, not an observation at your exact location.",evidenceIds:["forecast"]})};}}};
const request=body=>new Request("https://meteoscope.pages.dev/api/warning-chat",{method:"POST",headers:{"Content-Type":"application/json",Authorization:`Bearer ${token}`},body:JSON.stringify({...input,...body})});
try {
  Date.now=()=>NOW; globalThis.fetch=fetcher();
  for(const question of ["明日の天気は？","明日の早期注意情報は？"]) {
    const response=await onRequest({request:request({question}),env}); assert.equal(response.status,200);
    const body=await response.json();assert.equal(body.model,null);assert.equal(body.answerKind,"official");assert.ok(body.context.revision);
  }
  assert.equal(calls,0,"straightforward official facts must not be rewritten by AI");
  let excludedFetches=0; globalThis.fetch=async()=>{excludedFetches++;throw new Error("Excluded subject must not fetch sources");};
  for (const body of [{question:"自治体の避難指示は出ている？"},{question:"近くの避難所は開いていますか？"},{question:"そこはどこ？",history:[{role:"user",content:"避難所はどこですか？"}]}]) {
    const excluded=await onRequest({request:request(body),env});assert.equal(excluded.status,200);
    const value=await excluded.json();assert.equal(value.answerKind,"unsupported");assert.equal(value.quota,undefined);assert.match(value.answer,/回答しません/);
  }
  assert.equal(excludedFetches,0);assert.equal(calls,0,"municipal evacuation subjects never invoke inference");
  for(const question of ["最新の天気図は？","館野の高層観測は？","最新のEEWは？","緊急地震速報とは？"]) {
    const excluded=await onRequest({request:request({question}),env});assert.equal(excluded.status,200);
    const value=await excluded.json();assert.equal(value.answerKind,"unsupported");assert.equal(value.quota,undefined);assert.match(value.answer,/回答対象外/);
  }
  assert.equal(excludedFetches,0);assert.equal(calls,0,"excluded products do not fetch sources or invoke inference");
  globalThis.fetch=fetcher();
  const response=await onRequest({request:request({question:"What is tomorrow's weather?",language:"en"}),env});assert.equal(response.status,200);assert.equal(calls,1);
  let reads=0;const base=fetcher();
  globalThis.fetch=async(url,options)=>String(url).includes("forecast/data")?Response.json(++reads===1?rawForecast:updated):base(url,options);
  const changed=await onRequest({request:request({question:"What is tomorrow's weather?",language:"en"}),env});assert.equal(changed.status,409);assert.equal((await changed.json()).answer,undefined);
  globalThis.fetch=fetcher({fail:"forecast/data"});
  const failed=await onRequest({request:request({}),env});assert.equal(failed.status,503);assert.equal((await failed.json()).answer,undefined);
} finally {globalThis.fetch=originalFetch;Date.now=originalNow;sql.close();}
console.log("Weather chat: forecast/early-warning regional scope, dates, missing fields, official answers, auth route, failure and revisions passed.");
