import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {escapeHtml} from '../src/utils/html.js';
import { searchEarthquakeHistory, getEarthquakeHistoryPresetRange, EARTHQUAKE_HISTORY_PERIOD_PRESETS, EARTHQUAKE_HISTORY_EARLIEST_DATE } from '../src/jma/earthquakeHistory.js';
import { onRequestGet } from '../functions/api/earthquake-history.js';
import { pointInPolygon } from '../src/jma/hypocenterDistribution.js';

const originalFetch=globalThis.fetch, originalCaches=globalThis.caches;
const polygon=[[137,38],[139,38],[139,40],[137,40]];
const inside=[
 {id:'20240101120000',ot:'2024/01/01 12:00',name:'日本海中部',lat:'39',lon:'138',mag:'4.9',dep:'25 km',maxI:'震度3'},
 {id:'20111012063200',ot:'2011/10/12 06:32',name:'佐渡付近',lat:'38',lon:'139',mag:'4.2',dep:'23 km',maxI:'震度3'}
];
const nationwide=Array.from({length:1000},(_,i)=>({...inside[0],id:'national-'+i,lat:'35',lon:'141'}));
const cache=new Map(), forms=[],clientQueries=[];
let regionalResult;
globalThis.caches={default:{match:async key=>cache.get(key.url)?.clone(),put:async(key,response)=>cache.set(key.url,response.clone())}};
globalThis.fetch=async(url,init)=>{
 const parsed=new URL(String(url),'https://test.local');
 if(parsed.pathname==='/api/earthquake-history'){
  clientQueries.push(parsed);
  return onRequestGet({request:new Request(parsed,{signal:init.signal})});
 }
 assert.equal(parsed.href,'https://www.data.jma.go.jp/eqdb/data/shindo/api/');
 forms.push(init.body);
 const vertices=[];
 for(let i=0;init.body.has(`boundsAr[${i}][]`);i++){
  const [lat,lon]=init.body.getAll(`boundsAr[${i}][]`).map(Number);
  vertices.push([lon,lat]);
 }
 if(!vertices.length)return Response.json({res:nationwide,str:['検索結果地震数 ： 上限を超えました （1000 地震を表示）']});
 const records=inside.filter(row=>pointInPolygon([Number(row.lon),Number(row.lat)],vertices));
 return Response.json({res:records,str:[`検索結果地震数 ： ${records.length} 地震`]});
};
try{
 const base={startDate:'1919-01-01',endDate:'2025-12-31',minIntensity:'3'};
 const all=await searchEarthquakeHistory(base);
 assert.equal(all.complete,false);
 assert.equal(all.limitExceeded,true,'the nationwide result really is capped');
 const regional=await searchEarthquakeHistory({...base,areaPolygon:polygon});
 regionalResult=regional;
 assert.equal(regional.complete,true,'a small polygon must complete instead of scanning nationwide candidates');
 assert.equal(regional.totalMatched,2);
 assert.equal(regional.limitExceeded,false);
 assert.equal(regional.truncated,false);
 assert.equal(regional.queryCount,1);
 assert.equal(regional.scannedRecordCount,2);
 assert.deepEqual(regional.unsearchedRanges,[]);
 assert.deepEqual(regional.items.map(r=>r.id),inside.map(r=>r.id));
 assert.deepEqual(JSON.parse(clientQueries.at(-1).searchParams.get('areaPolygon')),polygon);
 assert.equal(forms.at(-1).get('additionalC'),'true');
 assert.deepEqual(forms.at(-1).getAll('boundsAr[0][]'),['38','137'],'JMA receives latitude then longitude');
 const before=forms.length;
 await searchEarthquakeHistory({...base,areaPolygon:polygon});
 assert.equal(forms.length,before,'the same polygon can reuse its cache');
 const other=await searchEarthquakeHistory({...base,areaPolygon:[[130,30],[131,30],[131,31],[130,31]]});
 assert.equal(other.totalMatched,0);
 assert.equal(forms.length,before+1,'different polygons cannot reuse the nationwide or another polygon cache');
 const savedFetch=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({res:Array.from({length:1000},(_,i)=>({...inside[0],id:'regional-'+i})),str:['検索結果地震数 ： 上限を超えました （1000 地震を表示）']});
 const trulyCapped=await onRequestGet({request:new Request('https://test.local/api/earthquake-history?start=2024-01-01&end=2024-01-02&areaPolygon='+encodeURIComponent(JSON.stringify(polygon)))});
 const limited=await trulyCapped.json();
 assert.equal(limited.limited,true,'a genuinely capped area must still report the limit');
 assert.equal(limited.totalMatched,null,'a genuine limit must not be reported as a complete count');
 globalThis.fetch=savedFetch;
 for(const bad of ['[','{}','[[139,38],[139,38],[139,38]]','[[181,38],[139,38],[139,40]]','[[139,null],[140,38],[139,40]]',JSON.stringify(Array.from({length:201},()=>[139,38]))]){
  const count=forms.length;
  const result=await onRequestGet({request:new Request('https://test.local/api/earthquake-history?start=2024-01-01&end=2024-01-02&areaPolygon='+encodeURIComponent(bad))});
  assert.equal(result.status,400);
  assert.equal(forms.length,count,'invalid polygons must not reach JMA');
 }
}finally{globalThis.fetch=originalFetch;globalThis.caches=originalCaches;}
console.log('Earthquake history area search: client, proxy, JMA bounds, cache isolation, invalid inputs and truthful limit state passed');

const panel=readFileSync(new URL('../src/ui/leftPanel.js',import.meta.url),'utf8');
const renderer=vm.createContext({escapeHtml,getEarthquakeHistoryPresetRange,EARTHQUAKE_HISTORY_PERIOD_PRESETS,EARTHQUAKE_HISTORY_EARLIEST_DATE,getJmaLatestAvailableDate:()=> '2025-12-31',
 buildArchiveSelect:()=>'',buildDistributionAreaControls:()=>'',
 EARTHQUAKE_HISTORY_INTENSITY_OPTIONS:[],EARTHQUAKE_HISTORY_SORT_OPTIONS:[],
 EARTHQUAKE_HISTORY_RESULT_LIMIT:1000,EARTHQUAKE_HISTORY_LIST_VISIBLE_LIMIT:200,
 getEarthquakeIntensityColor:()=>'',getEarthquakeIntensityTextClass:()=>'',formatHistoricalIntensity:v=>v,
 formatArchiveDate:v=>v,formatArchiveDateTime:v=>v,renderExpandedEarthquakeSummary:()=>'',renderFocalMechanism:()=>''});
vm.runInContext(panel.slice(panel.indexOf('function buildEarthquakeArchiveMarkup('),panel.indexOf('function buildArchiveSelect(')),renderer);
const markup=renderer.buildEarthquakeArchiveMarkup({earthquakeArchive:regionalResult,earthquakeArchiveStatus:'ok'});
assert.match(markup,/<strong>2件<\/strong>/);
assert.doesNotMatch(markup,/上限|未取得期間あり|取得済み 2件/,'completed small-area results must not show a limit or partial-results warning');
const partial=renderer.buildEarthquakeArchiveMarkup({earthquakeArchive:{...regionalResult,complete:false,truncated:true,totalMatched:null},earthquakeArchiveStatus:'partial-error'});
assert.doesNotMatch(partial,/地図は先頭2件/,'incomplete acquisition is not the map display limit');
console.log('Earthquake history area UI: complete count and partial acquisition are not mislabeled as display truncation');
