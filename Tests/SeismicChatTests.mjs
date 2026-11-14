import assert from 'node:assert/strict';
import {loadWarningChatContext} from '../functions/_shared/warningChatContext.js';
import {buildWarningChatMessages,parseWarningChatAnswer} from '../functions/_shared/warningChatAnswer.js';
import {normalizeWarningChatSelection,normalizeWarningChatInput,WARNING_CHAT_LIMITS} from '../src/ai/warningChatPolicy.js';
import {onRequest} from '../functions/api/warning-chat.js';
import {renderSeismicChatEvidence} from '../src/ui/seismicChatEvidence.js';
// Synthetic fixtures model the JMA bosai quake/tsunami JSON inspected on
// 2026-11-13 (InfoKindVersion 1.0_1). They are not actual disaster reports.
const NOW=Date.parse('2026-11-13T12:00:00Z'), ID='20261113194233', ISSUE='2026-11-13T19:45:00+09:00';
const catalog={offices:{'130000':{name:'東京都'}},class10s:{'130010':{parent:'130000'}},class15s:{'130011':{parent:'130010'}},class20s:{'1310100':{name:'千代田区',parent:'130011'}}};
function report(body,{info='発表',issued=ISSUE,status='通常',event=ID,title='震源・震度情報'}={}){return{Control:{Status:status},Head:{EventID:event,InfoType:info,ReportDateTime:issued,Title:title,InfoKindVersion:'1.0_1'},...(body?{Body:body}:{})};}
const quake=report({Earthquake:{OriginTime:'2026-11-13T19:42:00+09:00',Hypocenter:{Area:{Name:'試験用震源',Coordinate:'+35.0+139.0-10000/'}},Magnitude:'4.2'},Intensity:{Observation:{MaxInt:'3',Pref:[{Area:[{Name:'試験用区域',MaxInt:'3',City:[{Name:'千代田区',Code:'1310100',MaxInt:'2'}]}]}]}},Comments:{ForecastComment:{Text:'津波については調査中です。'}}});
const quakeEntry={eid:ID,rdt:ISSUE,at:'2026-11-13T19:42:00+09:00',anm:'試験用震源',json:`20261113194514_${ID}_VXSE5k_1.json`};
const tsunami=report({Tsunami:{Forecast:{Item:[{Area:{Name:'試験用沿岸',Code:'310'},Category:{Kind:{Name:'津波警報',Code:'61'}},FirstHeight:{ArrivalTime:'2026-11-13T22:00:00+09:00'},MaxHeight:{TsunamiHeight:'3'}}]}},Text:'試験用の津波警報です。'}, {title:'津波警報'});
const tsunamiEntry={...quakeEntry,json:`20261113194514_${ID}_VTSE41_1.json`,ttl:'津波警報'};
const observationEntry={...quakeEntry,rdt:'2026-11-13T19:50:00+09:00',json:`20261113195014_${ID}_VTSE51_1.json`};
const observation=report({Tsunami:{Observation:{Item:[{Area:{Name:'試験用沿岸',Code:'310'},Station:[{Name:'試験観測点',MaxHeight:{TsunamiHeight:'0.4',DateTime:'2026-11-13T19:49:00+09:00'}},{Name:'欠測観測点',MaxHeight:{TsunamiHeight:null,Condition:'欠測'}}]}]}}},{issued:observationEntry.rdt,title:'津波観測情報'});
function source({qList=[quakeEntry],tList=[tsunamiEntry],qReport=quake,tReport=tsunami,oReport=observation,fail=false}={}){
 const calls=[];
 const fetcher=async(url)=>{const path=String(url);calls.push(path);if(path.endsWith('area.json'))return Response.json(catalog);if(fail)throw Error('offline');if(path.endsWith('/quake/data/list.json'))return Response.json(qList);if(path.endsWith('/tsunami/data/list.json'))return Response.json(tList);if(path.endsWith('/'+observationEntry.json))return Response.json(oReport);if(path.includes('_VTSE41_'))return Response.json(tReport);if(path.includes('_VXSE5k_'))return Response.json(qReport);throw Error('Unexpected source: '+path);};
 return {fetcher,calls};
}
const load=(topic,options={})=>loadWarningChatContext('1310100',{topic,now:NOW,...options});
const earthquake=await load('earthquake',source());
assert.equal(earthquake.earthquake.magnitude,4.2);assert.equal(earthquake.earthquake.depthKm,10);assert.equal(earthquake.earthquake.maxObservedIntensity,'3');assert.equal(earthquake.earthquake.selectedMunicipalityIntensity,'2');
assert.notEqual(earthquake.earthquake.eventTime,earthquake.issuedAt);
assert.match(earthquake.earthquake.tsunamiComment,/調査中/);
const noValues=structuredClone(quake);noValues.Body.Earthquake.Magnitude='';noValues.Body.Earthquake.Hypocenter.Area.Coordinate='bad';noValues.Body.Intensity.Observation.Pref=[];
const missing=await load('earthquake',source({qReport:noValues}));
assert.equal(missing.earthquake.magnitude,null);assert.equal(missing.earthquake.depthKm,null);assert.equal(missing.earthquake.selectedMunicipalityIntensity,null);assert.match(missing.earthquake.selectedMunicipalityNote,/震度0.*意味しません/);
const shallow=structuredClone(quake);shallow.Body.Earthquake.Hypocenter.Area.Coordinate='+35.0+139.0+0/';
assert.equal((await load('earthquake',source({qReport:shallow}))).earthquake.depthKm,0);
const cancelled=await load('earthquake',source({qList:[{...quakeEntry,rdt:'2026-11-13T19:46:00+09:00'},quakeEntry],qReport:report(null,{info:'取消',issued:'2026-11-13T19:46:00+09:00'})}));
assert.equal(cancelled.earthquake.reportState,'取消');assert.equal(cancelled.earthquake.magnitude,undefined);
await assert.rejects(load('earthquake',source({qReport:report(quake.Body,{status:'訓練'})})),/invalid_seismic_report/);
await assert.rejects(load('earthquake',source({qList:[{...quakeEntry,rdt:'2027-01-01T00:00:00Z'}]})),/invalid_seismic_list_time/);
const unsafe=source({qList:[{...quakeEntry,json:'https://evil.test/data.json'}]});await assert.rejects(load('earthquake',unsafe),/unsupported_seismic_list/);assert.ok(unsafe.calls.every(url=>url.startsWith('https://www.jma.go.jp/')));
await assert.rejects(load('earthquake',source({fail:true})),/offline/);
const empty=await load('earthquake',source({qList:[]}));assert.equal(empty.availability,'empty');assert.equal(empty.earthquake,null);
const issued=await load('tsunami',source());assert.equal(issued.tsunami.state,'reported');assert.equal(issued.tsunami.areas[0].expectedHeight,'3');assert.equal(issued.tsunami.observations.length,0);assert.match(issued.tsunami.observationStatus,/高さ0.*意味しません/);
const expiredRaw=structuredClone(tsunami);expiredRaw.Head.ValidDateTime='2026-11-13T20:00:00+09:00';
const expired=await load('tsunami',source({tReport:expiredRaw}));assert.equal(expired.tsunami.state,'expired');assert.notEqual(expired.revision,issued.revision);
const endedRaw=structuredClone(tsunami);endedRaw.Body.Tsunami.Forecast.Item[0].Category.Kind.Name='津波警報解除';
assert.equal((await load('tsunami',source({tReport:endedRaw}))).tsunami.state,'cancelled');
const observed=await load('tsunami',source({tList:[observationEntry,tsunamiEntry]}));assert.equal(observed.tsunami.observations[0].maxHeight,'0.4');assert.equal(observed.tsunami.observations[1].maxHeight,null);assert.equal(observed.tsunami.areas[0].expectedHeight,'3');assert.equal(observed.issuedAt,observationEntry.rdt);
const correctedObservation={...observationEntry,ser:'2',json:observationEntry.json.replace('_1.json','_2.json')};
const oldAndNew=source({tList:[{...observationEntry,ser:'1'},tsunamiEntry,correctedObservation]});
const correctedContext=await load('tsunami',{fetcher:async(url,options)=>{if(String(url).endsWith(correctedObservation.json)){const corrected=structuredClone(observation);corrected.Body.Tsunami.Observation.Item[0].Station[0].MaxHeight.TsunamiHeight='0.6';return Response.json(corrected);}return oldAndNew.fetcher(url,options);}});
assert.equal(correctedContext.tsunami.observations[0].maxHeight,'0.6','a corrected observation at the same report time wins regardless of list order');
await assert.rejects(load('tsunami',{...source(),forecastAreaCode:'999'}),/予報区/);
const selected=await load('tsunami',{...source(),forecastAreaCode:'310'});assert.equal(selected.selection.forecastAreaCode,'310');
const badObservation=await load('tsunami',source({tList:[observationEntry,tsunamiEntry],oReport:report(observation.Body,{issued:observationEntry.rdt,status:'訓練'})}));assert.equal(badObservation.tsunami.observations.length,0);assert.match(badObservation.tsunami.observationStatus,/取得できません/);
for(const input of [{topic:'__proto__'},{topic:'earthquake',eventId:'../../x'},{topic:'tsunami',forecastAreaCode:'https://evil.test'}])assert.throws(()=>normalizeWarningChatSelection(input));
assert.equal(normalizeWarningChatInput({areaCode:'1310100',topic:'earthquake',eventId:ID,question:'震源は？',consent:true,language:'ja'}).eventId,ID);
const prompt=buildWarningChatMessages({language:'ja',question:'震源と規模は？',history:[],revision:''},earthquake);assert.ok(new TextEncoder().encode(JSON.stringify(prompt)).byteLength<WARNING_CHAT_LIMITS.promptBytes);assert.match(prompt[0].content,/OBSERVED intensity/);assert.doesNotMatch(prompt[1].content,/"selection"/);
assert.deepEqual(parseWarningChatAnswer({response:JSON.stringify({answer:'最大観測震度は3です。',evidenceIds:['earthquake']})},earthquake).evidenceIds,['earthquake']);
assert.throws(()=>parseWarningChatAnswer({response:JSON.stringify({answer:'説明',evidenceIds:['current']})},earthquake));
const originalFetch=globalThis.fetch;let inferenceCalls=0;
const db={prepare(sql){return{bind(){return this;},async first(){if(sql.includes('JOIN quiz_accounts'))return{id:'test-user',display_name:'Test'};if(sql.startsWith('SELECT value'))return{value:'{"allowed":true}'};if(sql.includes('INSERT INTO app_records'))return{used:1,accountUsed:1};throw Error('Unexpected SQL');},async run(){return{};}};}};
try{
 let qReads=0;const fixture=source();globalThis.fetch=async(url,opts)=>{if(String(url).endsWith('/quake/data/list.json')&&++qReads===2)return Response.json([{...quakeEntry,rdt:'2026-11-13T19:46:00+09:00'}]);if(String(url).includes('_VXSE5k_')&&qReads>=2)return Response.json(report(quake.Body,{issued:'2026-11-13T19:46:00+09:00'}));return fixture.fetcher(url,opts);};
 const env={NOTIFICATIONS_DB:db,WARNING_CHAT_ENABLED:'true',AI:{async run(){inferenceCalls++;return{response:JSON.stringify({answer:'最大観測震度は3です。',evidenceIds:['earthquake']})};}}};
 // Use fixed report date fixtures without relying on the host date in the route.
 const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}};
 try{const request=new Request('https://meteoscope.pages.dev/api/warning-chat',{method:'POST',headers:{Authorization:'Bearer test-session','Content-Type':'application/json'},body:JSON.stringify({areaCode:'1310100',topic:'earthquake',question:'最新の地震の震源を説明して',language:'ja',consent:true})});const response=await onRequest({request,env});assert.equal(response.status,409,'changed latest event data must not display an old answer');assert.equal((await response.json()).answer,undefined);assert.equal(inferenceCalls,1);}finally{globalThis.Date=RealDate;}
}finally{globalThis.fetch=originalFetch;}
const originalDocument=globalThis.document;function element(){return{textContent:'',children:[],append(...nodes){this.children.push(...nodes);}};}
try{globalThis.document={createElement:element};const root=element();renderSeismicChatEvidence(root,missing);const display=root.children.map(x=>x.textContent).join('\n');assert.match(display,/M調査中/);assert.match(display,/深さ調査中/);assert.doesNotMatch(display,/M0\.0|深さ0km/);const ts=element();renderSeismicChatEvidence(ts,expired);assert.match(ts.children.map(x=>x.textContent).join('\n'),/有効期限を過ぎた過去の資料/);}finally{globalThis.document=originalDocument;}
console.log('Seismic chat tests passed: official JSON, missing values, cancellation, expiry, observations, topic routing, revision conflicts and safe rendering.');
