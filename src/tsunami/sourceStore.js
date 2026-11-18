import { parseJstDateTime } from "../utils/jstDateTime.js";
import { getHighestTsunamiLevel } from "../tsunami.js";

export const tsunamiTime = value => parseJstDateTime(value);
export const tsunamiTimestamp = value => Date.parse(tsunamiTime(value) ?? "");
export const tsunamiDisplayTime = value => {
  const date = tsunamiTime(value);
  return date ? new Intl.DateTimeFormat("ja-JP", { timeZone:"Asia/Tokyo", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", minute:"2-digit", second:"2-digit", hour12:false }).format(new Date(date)) : "";
};
const text = value => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const waveHeight = wave => text(wave?.text) || (wave?.height != null && Number.isFinite(Number(wave.height)) && Number(wave.height) >= 0 ? `${Number(wave.height)}m` : "");
const eventIds = value => (Array.isArray(value) ? value : [value]).map(text).filter(Boolean);
const levels = {MajorWarning:"major-warning",Warning:"warning",Watch:"advisory"};
export function normalizeP2pTsunami(payload, {now=Date.now(), history=false}={}) {
  if (Number(payload?.code)!==552 || typeof payload.cancelled!=="boolean" || payload.test || payload.training) return null;
  const time = tsunamiTime(payload.issue?.time), stamp=tsunamiTimestamp(time);
  // A historic packet is not proof that an old warning is still in effect.
  if (!Number.isFinite(stamp) || stamp>now+120000 || history && now-stamp>86400000) return null;
  if (!payload.cancelled && !Array.isArray(payload.areas)) return null;
  const areas = payload.cancelled ? [] : payload.areas.filter(area=>area&&typeof area==="object").map(area=>({
    code:"",name:text(area.name),level:levels[area.grade]??"unknown",
    grade:({MajorWarning:"大津波警報",Warning:"津波警報",Watch:"津波注意報"})[area.grade]??"発表内容不明",
    height:text(area.maxHeight?.description) || (area.maxHeight?.value!=null && Number.isFinite(Number(area.maxHeight.value))&&Number(area.maxHeight.value)>=0?`${Number(area.maxHeight.value)}m`:""),
    arrivalTime:tsunamiDisplayTime(area.firstHeight?.arrivalTime),
    arrivalCondition:text(area.firstHeight?.condition)||(area.immediate?"ただちに津波来襲と予測":""),heightCondition:""
  })).filter(area=>area.name||area.code);
  if (!payload.cancelled && !areas.length) return null;
  return {id:text(payload.id),source:"p2p",reportTimeRaw:time,issuedAtRaw:tsunamiTime(payload.time),eventIds:[],areas,
    corrected:payload.issue?.correct==="Correct",status:payload.cancelled?"cleared":"issued",isCancellation:payload.cancelled,
    title:"津波警報・注意報",headline:payload.cancelled?"津波警報・注意報は解除されました。":"",sourceUrls:["https://www.p2pquake.net/"]};
}
export function normalizeXmlTsunami(report) {
  if (!report || report.training || !tsunamiTime(report.reportTimeRaw)) return null;
  return {...report,source:"xml",eventIds:eventIds(report.eventId),corrected:report.status==="訂正",
    status:report.status==="取消"?"withdrawn":"issued",sourceUrls:report.url?[report.url]:[]};
}
export function normalizeWolfxObservations(payload,{now=Date.now()}={}) {
  if(payload?.trusted!==true || !Number.isFinite(Date.parse(payload.validUntil)) || Date.parse(payload.validUntil)<=now
      || !["active","forecast_only","cleared","expired","none_reported"].includes(payload.status))return null;
  if(!Array.isArray(payload.observations))return null;
  const contextIds=eventIds(payload.report?.eventIds);
  return payload.observations.flatMap(report=>{
    if(!report||!["VTSE51","VTSE52"].includes(report.product)||!tsunamiTime(report.time)||!["issued","corrected","cancelled"].includes(report.status))return [];
    const offshore=report.product==="VTSE52";
    const observations=(Array.isArray(report.observed)?report.observed:[]).flatMap(area=>
      (Array.isArray(area?.stations)?area.stations:[]).filter(station=>station&&(station.code||station.name)).map(station=>({
        id:text(station.code)||`${text(area.code)}:${text(station.name)}`,stationCode:text(station.code),stationName:text(station.name)||text(station.code),
        areaCode:text(area.code),areaName:text(area.name),offshore,
        arrivalTime:tsunamiDisplayTime(station.firstWave?.time),arrivalCondition:text(station.firstWave?.text),
        maxHeightTime:tsunamiDisplayTime(station.maxWave?.time),maxHeight:waveHeight(station.maxWave),maxHeightCondition:""
      })));
    return [{id:text(report.id),source:"wolfx",xmlCode:report.product,reportTimeRaw:tsunamiTime(report.time),issuedAtRaw:tsunamiTime(report.issuedAt),
      eventIds:report.eventIds?eventIds(report.eventIds):contextIds,corrected:report.status==="corrected",cancelled:report.status==="cancelled",
      observations:offshore?[]:observations,offshoreObservations:offshore?observations:[],validUntil:payload.validUntil}];
  });
}

// Compare official publication times, never arrival order, observed wave time,
// severity, or the transport hash. On ties prefer a correction then XML detail.
function newer(next,previous,{alert=false}={}) {
  if(!previous)return true;
  const delta=tsunamiTimestamp(next.reportTimeRaw)-tsunamiTimestamp(previous.reportTimeRaw);
  if(delta)return delta>0;
  if(Boolean(next.corrected)!==Boolean(previous.corrected))return Boolean(next.corrected);
  const issued=tsunamiTimestamp(next.issuedAtRaw)-tsunamiTimestamp(previous.issuedAtRaw);
  if(Number.isFinite(issued)&&issued)return issued>0;
  const priority=source=>alert?(source==="p2p"?2:1):(source==="xml"?2:1);
  return priority(next.source)>priority(previous.source);
}
export function createTsunamiSourceStore({now=()=>Date.now()}={}) {
  let alert=null,cycleStart=-Infinity,connection="stopped",xmlStatus="loading",revision=0,wolfxVerifiedUntil=0,wolfxState="";
  const observationReports=new Map();
  function acceptAlert(next) {
    if(!next||!Number.isFinite(tsunamiTimestamp(next.reportTimeRaw))||tsunamiTimestamp(next.reportTimeRaw)>now()+120000||!newer(next,alert,{alert:true}))return false;
    const unrelated=next.eventIds?.length&&alert?.eventIds?.length&&!next.eventIds.some(id=>alert.eventIds.includes(id));
    if(!alert || alert.isCancellation && !next.isCancellation || unrelated)cycleStart=tsunamiTimestamp(next.reportTimeRaw);
    alert=next; revision++; return true;
  }
  function acceptObservation(report) {
    if(!report||!["VTSE51","VTSE52"].includes(report.xmlCode)||!Number.isFinite(tsunamiTimestamp(report.reportTimeRaw))||tsunamiTimestamp(report.reportTimeRaw)>now()+120000)return false;
    const key=`${report.xmlCode}:${[...(report.eventIds??[])].sort().join(",")}`;
    const previous=observationReports.get(key);
    if(!newer(report,previous)){
      if(report.source==="wolfx"&&previous?.source==="wolfx"&&report.id===previous.id&&report.reportTimeRaw===previous.reportTimeRaw&&report.cancelled===previous.cancelled&&report.corrected===previous.corrected&&Date.parse(report.validUntil)>Date.parse(previous.validUntil)){
        const wasStale=Date.parse(previous.validUntil)<=now();
        previous.validUntil=report.validUntil;revision++;return wasStale;
      }
      return false;
    }
    observationReports.set(key,report);
    revision++;
    if(observationReports.size>64)observationReports.delete(observationReports.keys().next().value);
    return true;
  }
  return {
    get revision(){return revision;},
    acceptP2p(payload,options) {return acceptAlert(normalizeP2pTsunami(payload,{now:now(),...options}));},
    acceptXml(reports,{status="available"}={}) {
      if(xmlStatus!==status){xmlStatus=status;revision++;}let changed=false;
      if(status==="unavailable")return false;
      for(const raw of reports??[]){
        const report=normalizeXmlTsunami(raw);if(!report)continue;
        if(report.xmlCode==="VTSE41"){
          if(!report.areas?.length&&report.status!=="withdrawn"&&!/解除/u.test(report.headline??""))continue;
          changed=acceptAlert({...report,isCancellation:report.status!=="withdrawn" && ((report.areas??[]).length>0 && (report.areas??[]).every(a=>a.level==="none")||/解除/u.test(report.headline??""))})||changed;
        }
        else changed=acceptObservation({...report,cancelled:report.status==="withdrawn"})||changed;
      }
      return changed;
    },
    acceptWolfx(payload) {
      const reports=normalizeWolfxObservations(payload,{now:now()});if(!reports)return false;
      let changed=wolfxVerifiedUntil<=now()||wolfxState!==payload.status;
      wolfxState=payload.status;
      if(wolfxVerifiedUntil!==Date.parse(payload.validUntil)){wolfxVerifiedUntil=Date.parse(payload.validUntil);revision++;}
      for(const report of reports)changed=acceptObservation(report)||changed;return changed;
    },
    setConnection(status){if(connection!==status){connection=status;revision++;}},
    snapshot() {
      const rows=new Map();
      for(const report of observationReports.values()){
        if(report.cancelled)continue;
        const superseded=[...observationReports.values()].some(other=>other!==report&&other.xmlCode===report.xmlCode&&newer(other,report)
          && (!(other.eventIds?.length&&report.eventIds?.length)||other.eventIds.some(id=>report.eventIds.includes(id))));
        if(superseded)continue;
        const known=alert?.eventIds?.length&&report.eventIds?.length;
        if(known ? !report.eventIds.some(id=>alert.eventIds.includes(id)) : tsunamiTimestamp(report.reportTimeRaw)<cycleStart)continue;
        for(const row of [...(report.observations??[]),...(report.offshoreObservations??[])]){
          const key=`${row.offshore?"offshore":"coastal"}:${row.stationCode||row.id||row.stationName}`;
          const previous=rows.get(key);
          if(!previous||newer(report,previous.report))rows.set(key,{row,report});
        }
      }
      const observations=[...rows.values()].map(({row,report})=>({...row,reportTimeRaw:report.reportTimeRaw,reportTime:tsunamiDisplayTime(report.reportTimeRaw),source:report.source,
        stale:report.source==="wolfx"&&Date.parse(report.validUntil)<=now() || report.source==="xml"&&xmlStatus==="unavailable"}));
      if(!alert && !observations.length){
        const wolfxCurrent=wolfxVerifiedUntil>now();
        const status=wolfxCurrent&&["active","forecast_only"].includes(wolfxState)?"checking"
          :xmlStatus==="none"||wolfxCurrent?"not-reported":xmlStatus==="loading"?"loading":"unavailable";
        return {tsunami:null,tsunamiStatus:status,tsunamiRevision:revision};
      }
      const withdrawn=alert?.status==="withdrawn";
      const areas=withdrawn?[]:(alert?.areas??[]);
      const level=withdrawn||!alert?"unknown":getHighestTsunamiLevel(areas);
      const expired=level==="forecast"&&alert?.validDateTimeRaw&&tsunamiTimestamp(alert.validDateTimeRaw)<=now();
      const coastal=observations.filter(o=>!o.offshore),offshore=observations.filter(o=>o.offshore);
      return {tsunamiRevision:revision,tsunamiStatus:"available",tsunami:{...alert,id:alert?.id||"observations",eventId:alert?.eventIds?.[0]||"",title:alert?.title||"津波観測情報",
        reportTime:tsunamiDisplayTime(alert?.reportTimeRaw),reportTimeRaw:alert?.reportTimeRaw||"",areas:expired?[]:areas,
        highestLevel:expired?"unknown":level,isActive:!expired&&["major-warning","warning","advisory"].includes(level),isCancellation:!expired&&Boolean(alert?.isCancellation),
        headline:withdrawn?"津波情報が取り消されています。最新の発表を確認してください。":expired?"津波予報の有効期限を過ぎています。解除を意味しません。":alert?.headline||"",
        updateNotice:connection!=="connected"&&alert?.source==="p2p"?"リアルタイム受信を確認中です。最後に受信した発表を表示しています。":"",
        observations:coastal,offshoreObservations:offshore,mapFeatures:[]}};
    }
  };
}
