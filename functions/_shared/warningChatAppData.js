import {JMA_BOSAI, fetchWarningChatJson, fetchWarningChatText, getWarningChatArea, revisionOf, validIssueTime} from "./warningChatSources.js";
import {WARNING_CHAT_DATA_PRODUCTS} from "../../src/ai/warningChatDataProducts.js";
import {buildAmedasPoints} from "../../src/jma/amedas.js";
import {normalizeTyphoon} from "../../src/jma/typhoon.js";
import {buildVolcanoBaselineReports} from "../../src/jma/volcanoXml.js";
import {parseTideStationCatalog, buildTideObservationPoints} from "../../src/jma/tideLevel.js";
import {weatherChatDate} from "../../src/ai/warningChatWeatherQuery.js";
import {getMunicipalHazardLinks} from "../../src/domain/municipalHazardMaps.js";
import {WORLD_TYPHOON_URLS, normalizeWorldTyphoonForecast} from "../../src/worldTyphoon.js";

const JMA = "https://www.jma.go.jp";
const clean = (value, length=500) => String(value ?? "").replace(/<[^>]*>/gu," ").replace(/\s+/gu," ").trim().slice(0,length);
const compactTime = value => /^\d{14}$/u.test(value ?? "") ? `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}T${value.slice(8,10)}:${value.slice(10,12)}:${value.slice(12,14)}Z` : null;
const withoutCoordinates = ({coordinates, ...value}) => value;

export async function loadAppDataChatContext(areaCode, options = {}) {
  const {fetcher=fetch, fresh=false, now=Date.now(), weatherScope:kind, question=""} = options;
  if (!Object.hasOwn(WARNING_CHAT_DATA_PRODUCTS,kind)) throw new TypeError("unsupported_data_product");
  const place=await getWarningChatArea(areaCode,{fetcher,fresh,now});
  const sources=[];
  const json=async(url,title="気象庁 公開データ")=>{sources.push({title,url});return fetchWarningChatJson(url,{fetcher,fresh});};
  const text=async(url,title="気象庁 公開資料")=>{sources.push({title,url});return fetchWarningChatText(url,{fetcher,fresh});};
  let data;
  if(kind==="amedas") data=await amedas();
  else if(kind==="typhoon") data=await typhoon();
  else if(kind==="models") data=await models();
  else if(kind==="volcano") data=await volcano();
  else if(kind==="tide") data=await tide();
  else if(kind==="hazard") data=await hazard();
  else if(kind==="river") data=await bulletins();
  else if(["radar","lightning","satellite","kikikuru"].includes(kind)) data=await imageTimes();
  else data=guide();
  const context={topic:"weather",weatherScope:kind,areaCode,areaName:place.areaName,todayJst:weatherChatDate(now),
    fetchedAt:new Date(now).toISOString(),issuedAt:data.issuedAt ?? null,
    appData:{kind,label:WARNING_CHAT_DATA_PRODUCTS[kind].label,...data},
    limitations:"自治体の避難指示・避難所の開設・避難経路は回答対象外。受信できた資料の範囲だけを回答する。取得失敗・未掲載・欠測を発表なしや0や安全と解釈しない。画像の更新時刻だけから地点の値や危険度を推測しない。",
    sources:[...new Map(sources.map(source=>[source.url,source])).values()]};
  context.revision=await revisionOf({areaCode,todayJst:context.todayJst,appData:context.appData,sources:context.sources});
  return context;

  async function amedas() {
    const latest=(await text(`${JMA_BOSAI}/amedas/data/latest_time.txt`)).trim();
    if(!validIssueTime(latest,now)||now-Date.parse(latest)>90*60_000) throw new Error("stale_amedas_source");
    const stamp=latest.replace(/[-T:]/gu,"").slice(0,14);
    const [stations,raw]=await Promise.all([json(`${JMA_BOSAI}/amedas/const/amedastable.json`),json(`${JMA_BOSAI}/amedas/data/map/${stamp}.json`)]);
    const snowStamp=`${stamp.slice(0,10)}0000`;
    const snow=snowStamp===stamp?raw:await json(`${JMA_BOSAI}/amedas/data/map/${snowStamp}.json`).catch(()=>null);
    const points=buildAmedasPoints(raw,stations,snow);
    if(!points.length) throw new Error("empty_amedas_source");
    const named=points.filter(point=>point.name.length>1 && question.includes(point.name)).sort((a,b)=>b.name.length-a.name.length);
    let selected=named.slice(0,3), selection="質問中の観測地点名に一致";
    if(!selected.length) {
      const mapping=await json(`${JMA_BOSAI}/forecast/const/week_area.json`);
      const own=(mapping[place.officeCode]??[]).filter(item=>item.srf===place.class10Code);
      const station=(own.find(item=>item.week===place.class10Code)??own[0])?.amedas;
      selected=points.filter(point=>point.id===station); selection="選択した予報区域の代表地点。市区町村や現在地そのものの観測ではない";
    }
    const field=/雨量|降水/u.test(question)?"precipitation1h":/風/u.test(question)?"wind":/湿度/u.test(question)?"humidity":/積雪/u.test(question)?"snow":/気圧/u.test(question)?"pressure":"temperature";
    const valid=points.filter(point=>Number.isFinite(point.values[field]));
    const ranking=/ランキング|全国|一番|最高|最低|top|highest|lowest/iu.test(question)?{metric:field,meaning:"この観測時刻の全国地点比較。日最高・日最低の記録ではない",highest:[...valid].sort((a,b)=>b.values[field]-a.values[field]).slice(0,5).map(withoutCoordinates),lowest:[...valid].sort((a,b)=>a.values[field]-b.values[field]).slice(0,5).map(withoutCoordinates)}:null;
    return {issuedAt:latest,selection,stations:selected.map(withoutCoordinates),ranking,
      units:{temperature:"℃",precipitation1h:"直前1時間のmm",precipitation10m:"直前10分のmm",precipitation3h:"直前3時間のmm",precipitation24h:"直前24時間のmm",wind:"m/s",humidity:"%",pressure:"hPa",snow:"cm"},
      snowObservedAt:snow?`${latest.slice(0,13)}:00:00+09:00`:null,missing:"nullは欠測。予報・現在地の推定値ではない。日最高/日最低・過去日の推移はこの取得範囲に含まれない"};
  }
  async function typhoon() {
    const raw=await json(`${JMA_BOSAI}/typhoon/data/targetTc.json`);
    const targets=Array.isArray(raw)?raw:raw?.targetTc;
    if(!Array.isArray(targets)) throw new Error("invalid_typhoon_list");
    const results=await Promise.all(targets.slice(0,8).map(async(target,index)=>{
      const id=String(typeof target==="object"?target.tropicalCyclone??target.id:target);
      if(!/^(?:TC\d{4}|TD-[a-z0-9]{1,8}|\d{4,12})$/iu.test(id)) throw new Error("invalid_typhoon_id");
      const [forecast,specifications]=await Promise.all([json(`${JMA_BOSAI}/typhoon/data/${id}/forecast.json`),json(`${JMA_BOSAI}/typhoon/data/${id}/specifications.json`)]);
      const value=normalizeTyphoon({...(typeof target==="object"?target:{}),id,tropicalCyclone:id,forecast,specifications},index);
      if(!value) throw new Error("invalid_typhoon_detail");
      return {name:value.name,issuedAt:value.updatedAt,details:value.details,strongWindRadiusKm:value.strongWindRadius,stormRadiusKm:value.stormRadius,
        forecastPoints:value.forecastCircles?.slice(0,8).map(point=>({label:point.label,center:point.center,radiusKm:point.radius,details:point.details}))??[],
        forecastTimes:forecast.filter(row=>Number(row.advancedHours)>0).slice(0,8).map(row=>({advancedHours:row.advancedHours,validAt:row.validtime?.JST??row.validtime?.UTC??null}))};
    }));
    return {issuedAt:null,availability:targets.length?"available":"empty",systemCount:targets.length,scope:"気象庁が現在一覧に掲載する台風・熱帯低気圧。空の正常応答と通信失敗を区別",systems:results};
  }
  async function models() {
    const model=/AIFS.*(?:ENS|アンサンブル)/iu.test(question)?"aifs-ens":/AIFS/iu.test(question)?"aifs-single":/HRES/iu.test(question)?"ifs-hres":/GEFS|NOAA/iu.test(question)?(/平均|mean/iu.test(question)?"gefs-mean":"gefs"):"ecmwf";
    const url=WORLD_TYPHOON_URLS[model];
    sources.push({title:`MeteoScope配信 ${model} の台風予測データ`,url});
    const value=normalizeWorldTyphoonForecast(await fetchWarningChatJson(url,{fetcher,fresh,maxBytes:8*1024*1024}),model);
    const systems=value.systems.slice(0,5).map(system=>({name:system.name,kind:system.kind,memberCount:system.memberCount,genesisProbability:system.genesisProbability,
      observedCenter:system.observedCenter,points:(system.controlPoints??[]).filter((_,i)=>i%4===0).slice(0,6)}));
    return {issuedAt:value.generatedAt??value.runTime??null,model,source:value.source,systems,
      limitation:"気象庁の公式台風予報とは別の数値モデル出力。メンバー支持本数と発生確率は別。空間分布・全メンバーを読み込んだ比較ではなく、候補上位5系の代表点抜粋。モデルの更新日時と予報対象日時を区別し、発生・上陸・進路の確定情報として答えない"};
  }
  async function volcano() {
    const [status,catalog,warnings]=await Promise.all([json(`${JMA_BOSAI}/volcano/data/info/900.json`),json(`${JMA_BOSAI}/volcano/const/volcano_list.json`),json(`${JMA_BOSAI}/volcano/data/warning.json`)]);
    if(!Array.isArray(catalog)||!Array.isArray(warnings)) throw new Error("invalid_volcano_source");
    const all=buildVolcanoBaselineReports(status,catalog,warnings);
    const named=catalog.filter(item=>question.includes(item.name_jp)||item.name_en?.length>3&&question.toLowerCase().includes(item.name_en.toLowerCase()));
    const rows=named.length?all.filter(row=>named.some(item=>item.code===row.volcanoCode)):all.filter(row=>row.alertPriority>0).sort((a,b)=>b.alertPriority-a.alertPriority).slice(0,12);
    return {issuedAt:status.reportDatetime,scope:named.length?"質問で指定された火山":"全国の警戒対象のうち優先度上位。選択自治体の危険判定ではない",volcanoes:rows.map(({volcanoName,level,kindName,condition,reportTimeRaw,isWarningSnapshot})=>({volcanoName,level,kindName,condition,issuedAt:reportTimeRaw,isWarningSnapshot})),
      limitation:"火山ごとの警報・予報の発表日時を保持。継続中の警報は発表日が古くてもあり得る。この資料だけで最新の噴火発生時刻・降灰量や分布を推測しない"};
  }
  async function tide() {
    const stations=parseTideStationCatalog(await json(`${JMA_BOSAI}/tidelevel/const/tide_area.json`));
    const selected=stations.filter(station=>station.name.length>1&&question.includes(station.name));
    if(selected.length!==1) return {availability:"choose-station",stations:stations.slice(0,30).map(({name})=>name),limitation:"潮位は地点指定が必要。市区町村から海岸観測点を自動推測しない。希望する観測地点名を質問してください"};
    const stamp=await json(`${JMA_BOSAI}/tidelevel/data/tide/tide_time.json`);
    if(!validIssueTime(stamp.time,now)||now-Date.parse(stamp.time)>90*60_000) throw new Error("stale_tide_source");
    const date=weatherChatDate(Date.parse(stamp.time)),code=selected[0].code;
    const raw=await json(`${JMA_BOSAI}/tidelevel/data/tide/tide_obs_${date.replaceAll("-","")}_${code}.json`);
    const year=date.slice(0,4),astro=await json(`${JMA_BOSAI}/tidelevel/const/tide_astro/tide_astro_${year}_${code}.json`).catch(()=>null);
    const points=buildTideObservationPoints([raw],new Map(astro?[[Number(year),astro]]:[]),{updatedAt:stamp.time,maxPoints:48});
    if(!points.length) throw new Error("empty_tide_source");
    return {issuedAt:stamp.time,station:{name:selected[0].name,reference:selected[0].reference},unit:"cm",latest:points.at(-1),recent:points.slice(-6),limitation:"観測潮位・天文潮位・偏差を区別。津波の高さや今後の満干潮時刻をこの抜粋から推定しない"};
  }
  async function hazard() {
    const root="https://meteoscope.pages.dev/data/municipal-hazard-maps/";
    const index=await json(`${root}index.json`,"MeteoScope 自治体ハザードマップ索引");
    if(!/^[a-f0-9]{12}$/u.test(index.version??"")) throw new Error("invalid_hazard_index");
    const pref=areaCode.slice(0,2),raw=await json(`${root}${index.version}/${pref}.json`,"国土地理院の一覧をMeteoScopeが整理した資料");
    const city=raw.municipalities?.find(city=>city.code===areaCode.slice(0,5));
    const links=getMunicipalHazardLinks(city);
    for(const link of links.slice(0,8)) sources.push({title:`ハザードマップ：${link.categories.join("/")}${link.replacements?.length?"（MeteoScopeが独自にリンクを置換）":""}`,url:link.url});
    return {availability:city?"available":"unlisted",municipality:city?.name??null,types:links.map(link=>({categories:link.categories,independentlyReplaced:Boolean(link.replacements?.length),checkedAt:link.checkedAt??null})),limitation:"自治体が公開する地図へのリンク一覧。個別住所の災害リスク・地図内の浸水深・避難先は読み取っていない。未掲載は安全を意味しない"};
  }
  async function imageTimes() {
    const urls={radar:[`${JMA_BOSAI}/jmatile/data/nowc/targetTimes_N1.json`,`${JMA_BOSAI}/jmatile/data/rasrf/targetTimes.json`],lightning:[`${JMA_BOSAI}/jmatile/data/nowc/targetTimes_N3.json`],satellite:[`${JMA_BOSAI}/himawari/data/satimg/targetTimes_fd.json`],kikikuru:[`${JMA_BOSAI}/jmatile/data/risk/targetTimes.json`]};
    const series=await Promise.all(urls[kind].map(async url=>{
      const raw=await json(url),items=Array.isArray(raw)?raw:raw?.targetTimes;
      if(!Array.isArray(items)) throw new Error("invalid_image_time_source");
      const times=items.map(row=>({baseTime:compactTime(row.basetime??row),validTime:compactTime(row.validtime??row.basetime??row)}))
        .filter(row=>row.baseTime&&row.validTime&&validIssueTime(row.baseTime,now)&&Number.isFinite(Date.parse(row.validTime))).sort((a,b)=>a.validTime.localeCompare(b.validTime));
      if(!times.length) throw new Error("empty_image_time_source");
      const latestAnalysisTime=times.map(row=>row.baseTime).sort().at(-1);
      return {latestAnalysisTime,olderThan90Minutes:now-Date.parse(latestAnalysisTime)>90*60_000,firstValidTime:times[0].validTime,lastValidTime:times.at(-1).validTime,frameCount:times.length};
    }));
    return {issuedAt:series.map(row=>row.latestAnalysisTime).sort().at(-1),series,interpretation:"元データの配信・対象時刻を確認。画像そのものをAIへ送信・解析していない。地点の雨量・落雷数・キキクル色・雲の種類・今後の降雨開始時刻はこの時刻一覧から判定できない"};
  }
  async function bulletins() {
    const url="https://www.data.jma.go.jp/developer/xml/feed/extra.xml";
    let feed=await text(url);
    const pattern=/_VXKO\d{2}_/u;
    const parseEntries=feed=>[...feed.matchAll(/<entry\b[^>]*>([\s\S]*?)<\/entry>/gu)].flatMap(([,entry])=>{
      const source=entry.match(/https:\/\/www\.data\.jma\.go\.jp\/developer\/xml\/data\/[0-9A-Z_]+\.xml/u)?.[0];
      if(!source||!pattern.test(source)) return [];
      return [{title:xmlText(entry,"title"),updated:xmlText(entry,"updated"),url:source}];
    }).filter(entry=>validIssueTime(entry.updated,now)).sort((a,b)=>b.updated.localeCompare(a.updated));
    let entries=parseEntries(feed),extendedUnavailable=false;
    const named=(question.match(/[\p{Script=Han}]{1,10}川/gu)??[]).filter(name=>!name.includes("指定河川")&&name!=="河川");
    const matches=entries=>named.length?entries.filter(entry=>named.some(name=>entry.title.includes(name))):entries;
    if(!matches(entries).length) {
      const longUrl=url.replace(".xml","_l.xml");
      try {sources.push({title:"気象庁 長期配信フィード",url:longUrl});feed=await fetchWarningChatText(longUrl,{fetcher,fresh,maxBytes:8*1024*1024});entries=parseEntries(feed);}
      catch {extendedUnavailable=true;}
    }
    const newest=new Map();
    for(const entry of matches(entries)) if(!newest.has(entry.title)) newest.set(entry.title,entry);
    const chosen=[...newest.values()].slice(0,3);
    const reports=await Promise.all(chosen.map(async entry=>{
      const body=await text(entry.url,entry.title);
      const reportTime=xmlText(body,"ReportDateTime"),headline=xmlText(body.match(/<(?:\w+:)?Headline\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Headline>/u)?.[1]??"","Text");
      if(!validIssueTime(reportTime,now)) throw new Error("invalid_bulletin_time");
      return {title:entry.title,issuedAt:reportTime,targetTime:xmlText(body,"TargetDateTime"),infoType:xmlText(body,"InfoType"),headline,
        excerpt:clean(body.match(/<(?:\w+:)?Body\b[^>]*>([\s\S]*?)<\/(?:\w+:)?Body>/u)?.[1]??"",1600)};
    }));
    return {issuedAt:reports[0]?.issuedAt??null,availability:reports.length?"available":extendedUnavailable?"extended-source-unavailable":"no-matching-recent-bulletin",scope:named.length?"指定河川名で最近の配信資料を照合":"全国の最近の配信資料の抜粋。選択自治体との区域照合は行っていない",reports,
      limitation:"一覧にないことは洪水予報なしや水位低下を意味しない。過去報の解除・継続を現在の地域全体へ適用しない。自治体避難情報は対象外"};
  }
  function guide() {
    const data={
      geology:{source:"https://www.j-shis.bosai.go.jp/",text:"MeteoScopeはJ-SHISの主要活断層、USGSのプレート境界・Slab2、気象庁の推計震度分布などを表示。断層・プレート面は地形・地質の資料で地震の発生日時や安全な地点を予知しない。推計震度分布は観測震度やEEWと区別する。個別の形状・イベント分布をこの回答へ読み込んでいない。"},
      simulation:{source:"https://itachi-kun-itc.github.io/WE-Simulator/",text:"MeteoScopeの地震シミュレーションは設定した震源・M・深さ、観測点と地盤増幅率を用いる学習用の近似。P/S波円や模擬EEWは実際の受信報ではない。深発地震・巨大地震や異常震域の分布は現実の再現・予測ではない。利用者の現在のシミュレーション設定や再生時刻はチャットサーバーへ送っていない。"},
      community:{source:"https://meteoscope.pages.dev/",text:"投稿は利用者の天気・季節・周辺状況の報告であり、気象庁の観測や公的な警報ではない。表示期間は12時間。投稿者や投稿本文・位置をAIの根拠にしていない。チャットから個人の投稿・投稿地点の実況を断定しない。"}
    }[kind];
    sources.push({title:WARNING_CHAT_DATA_PRODUCTS[kind].label,url:data.source});
    return {availability:"reference-only",explanation:data.text};
  }
}

function xmlText(value, tag) {
  const found=String(value).match(new RegExp(`<(?:[\\w.-]+:)?${tag}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w.-]+:)?${tag}>`,"u"));
  return clean(found?.[1]??"").replace(/&amp;/gu,"&").replace(/&lt;/gu,"<").replace(/&gt;/gu,">");
}
