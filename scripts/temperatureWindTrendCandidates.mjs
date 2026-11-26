// Offline research only. This module is never imported by the application.
import {getDistanceKm} from "../src/location/distance.js";
import {solveLinearSystem} from "../src/utils/linearSystem.js";
import {selectTemperatureHistory,temperatureWeatherContext,applyTemperatureWeather} from "../src/location/temperatureWeather.js";
import {solarAltitude} from "./temperatureWeatherCandidates.mjs";
const finite=v=>typeof v==="number"&&Number.isFinite(v),clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const mean=(values,weights)=>values.reduce((s,v,i)=>s+v*weights[i],0)/weights.reduce((a,b)=>a+b,0);
const deviation=(values,weights)=>{const m=mean(values,weights);return Math.sqrt(mean(values.map(v=>(v-m)**2),weights));};

export const WIND_TREND_FEATURES=Object.freeze({
  static:["urbanContrast","seaContrast","heightContrast","tpiContrast","forestContrast","temperatureSpread","morning","morningUrban","morningSea","morningTpi"],
  wind:["windSpeed","windU","windV","windCoherence","windPersistence","calmFraction","windChange","windTemperatureCovariance","windTerrain","mixUrban","mixTpi"],
  trend:["warming30","warming60","warmingAcceleration","warmingSpread","warmingTargetContrast","warmingUrban","warmingSea","warmingTpi"],
  joint:["windWarming","calmWarming","windWarmingUrban","windWarmingTpi","windTrendContrast"]
});

export function excludeTemperatureTarget(history,id) {
  return history.map(frame=>({...frame,values:new Map([...frame.values].filter(([station])=>String(station)!==String(id)))}));
}

// JMA reports FROM direction. Parcel motion has the opposite sign. Calm has no bearing.
export function observedMotion(speed,direction) {
  if(!finite(speed)||speed<0)return null;
  if(speed===0)return {speed:0,u:0,v:0};
  if(speed<=.2&&direction===0)return {speed,u:0,v:0}; // Official calm code: retain measured speed, no invented bearing.
  if(!Number.isInteger(direction)||direction<1||direction>16)return null;
  const angle=direction*Math.PI/8;return {speed,u:-speed*Math.sin(angle),v:-speed*Math.cos(angle)};
}

function historyTrend(entries,frame,timeMs) {
  if(!frame||timeMs<=frame.timeMs||timeMs-frame.timeMs>60*60000)return null;
  const values=entries.flatMap(e=>{const previous=frame.values.get(String(e.point.id));return finite(previous?.temperature)?[{...e,previous,rate:(e.point.value-previous.temperature)*3600000/(timeMs-frame.timeMs)}]:[];});
  const coverage=values.reduce((s,e)=>s+e.weight,0);
  if(values.length<3||coverage<.7)return null;
  return {values,mean:mean(values.map(e=>e.rate),values.map(e=>e.weight)),spread:deviation(values.map(e=>e.rate),values.map(e=>e.weight)),coverage};
}

function regionalMotion(entries,observation) {
  const values=entries.flatMap(e=>{const o=observation(e.point),motion=observedMotion(o.speed,o.direction);return motion?[{...motion,w:e.weight}]:[];});
  const coverage=values.reduce((s,v)=>s+v.w,0);
  if(values.length<3||coverage<.7)return null;
  const w=values.map(v=>v.w),speed=mean(values.map(v=>v.speed),w),u=mean(values.map(v=>v.u),w),v=mean(values.map(v=>v.v),w);
  return {speed,u,v,coherence:speed>1e-9?Math.hypot(u,v)/speed:0,calm:mean(values.map(v=>v.speed<1?1:0),w),coverage};
}

export function windTrendContext({entries,coordinates,elevation,environment,timeMs,history}) {
  if(!entries?.length||!finite(timeMs)||!environment||!finite(elevation)
    || entries.some(e=>!finite(e.point?.elevation)||!finite(e.point?.value)||!finite(e.corrected)||!finite(e.weight)||e.weight<0)
    || entries.reduce((s,e)=>s+e.weight,0)<=0) return null;
  const previous=selectTemperatureHistory(history,timeMs);
  if(!previous||timeMs-previous.timeMs>40*60000)return null;
  const hour=history.find(f=>timeMs-f.timeMs===60*60000);
  const short=historyTrend(entries,previous,timeMs),long=historyTrend(entries,hour,timeMs);
  const currentWind=regionalMotion(entries,p=>({speed:p.values?.wind,direction:p.windDirection}));
  const priorWind=previous?regionalMotion(entries,p=>{const x=previous.values.get(String(p.id));return {speed:x?.speed,direction:x?.direction};}):null;
  if(!short||!long||!currentWind||!priorWind)return null;
  const w=entries.map(e=>e.weight),weighted=read=>mean(entries.map(e=>read(e.point)),w);
  if(["sea","urban","forest","meanElevation"].some(k=>!finite(environment[k])||entries.some(e=>!finite(e.point.environment?.[k]))))return null;
  const urban=environment.urban-weighted(p=>p.environment.urban),sea=environment.sea-weighted(p=>p.environment.sea),
    height=(elevation-weighted(p=>p.elevation))/500,tpi=(elevation-environment.meanElevation-weighted(p=>p.elevation-p.environment.meanElevation))/300,
    forest=environment.forest-weighted(p=>p.environment.forest);
  const sun=solarAltitude(coordinates,timeMs),oldSun=solarAltitude(coordinates,timeMs-30*60000);
  const morning=sun>=-6&&sun<=35&&sun>oldSun;
  const dot=currentWind.u*priorWind.u+currentWind.v*priorWind.v;
  const persistence=Math.hypot(currentWind.u,currentWind.v)*Math.hypot(priorWind.u,priorWind.v)>1e-9
    ?clamp(dot/Math.hypot(currentWind.u,currentWind.v)/Math.hypot(priorWind.u,priorWind.v),-1,1):0;
  const tempMean=weighted(p=>p.value);
  const cov=weighted(p=>(p.value-tempMean)*((p.values.wind??currentWind.speed)-currentWind.speed));
  const rows=short.values.map(e=>[1,(e.point.coordinates[0]-coordinates[0])*111.195*Math.cos(coordinates[1]*Math.PI/180)/30,
    (e.point.coordinates[1]-coordinates[1])*111.195/30,(e.point.elevation-elevation)/300,
    e.point.environment.urban-environment.urban,e.point.environment.sea-environment.sea]);
  const weights=short.values.map(e=>e.weight/short.coverage),n=rows[0].length;
  const matrix=Array.from({length:n},(_,a)=>Array.from({length:n},(_,b)=>rows.reduce((s,row,i)=>s+weights[i]*row[a]*row[b],0)+(a===b&&a>0?.1:0)));
  const beta=solveLinearSystem(matrix,Array.from({length:n},(_,a)=>rows.reduce((s,row,i)=>s+weights[i]*row[a]*short.values[i].rate,0)));
  const trendContrast=beta?beta[0]-short.mean:0;
  const terrain=weighted(p=>{const dx=(p.coordinates[0]-coordinates[0])*111.195*Math.cos(coordinates[1]*Math.PI/180),dy=(p.coordinates[1]-coordinates[1])*111.195;
    return Math.max(0,-currentWind.u*dx-currentWind.v*dy)/Math.max(1,Math.hypot(currentWind.u,currentWind.v)*Math.hypot(dx,dy))*(p.elevation-elevation)/300;});
  const f={urbanContrast:urban,seaContrast:sea,heightContrast:height,tpiContrast:tpi,forestContrast:forest,
    temperatureSpread:deviation(entries.map(e=>e.corrected),w)/3,morning:morning?1:0,morningUrban:morning?urban:0,morningSea:morning?sea:0,morningTpi:morning?tpi:0,
    windSpeed:currentWind.speed/3,windU:currentWind.u/3,windV:currentWind.v/3,windCoherence:currentWind.coherence,windPersistence:persistence,calmFraction:currentWind.calm,
    windChange:(currentWind.speed-priorWind.speed)/3,windTemperatureCovariance:cov/6,windTerrain:terrain,mixUrban:urban*currentWind.speed/3,mixTpi:tpi*currentWind.speed/3,
    warming30:short.mean/3,warming60:long.mean/3,warmingAcceleration:(short.mean-long.mean)/3,warmingSpread:short.spread/3,
    warmingTargetContrast:trendContrast/3,warmingUrban:short.mean*urban/3,warmingSea:short.mean*sea/3,warmingTpi:short.mean*tpi/3,
    windWarming:currentWind.speed*short.mean/9,calmWarming:currentWind.calm*short.mean/3,windWarmingUrban:currentWind.speed*short.mean*urban/9,
    windWarmingTpi:currentWind.speed*short.mean*tpi/9,windTrendContrast:currentWind.speed*trendContrast/9};
  return {features:Object.fromEntries(Object.entries(f).map(([k,v])=>[k,clamp(v,-5,5)])),morning,short,long,currentWind,previous};
}

export function physicalWindTrendCandidates(input,context) {
  const {entries,coordinates,elevation,timeMs,history,lapseRate=.0065}=input;
  const baseline=mean(entries.map(e=>e.corrected),entries.map(e=>e.weight));
  if(!context)return {legacy:0,advection30:0,advection60:0,trend:0};
  const oldContext=temperatureWeatherContext({...input,history});
  const adjusted=applyTemperatureWeather(entries,oldContext,{weatherWindStrength:.5});
  const legacy=mean(adjusted.map(e=>e.corrected),adjusted.map(e=>e.weight))-baseline;
  function advect(frame,trend){
    const dt=(timeMs-frame.timeMs)/1000,source=entries.flatMap(e=>{
      const p=frame.values.get(String(e.point.id)),motion=observedMotion(p?.speed,p?.direction);
      if(!motion||!finite(p?.temperature))return [];
      const shift=Math.min(1,15000/Math.max(1,motion.speed*dt));
      const moved=[e.point.coordinates[0]+motion.u*dt*shift/(111195*Math.cos(e.point.coordinates[1]*Math.PI/180)),e.point.coordinates[1]+motion.v*dt*shift/111195];
      const distance=getDistanceKm(coordinates,moved),original=getDistanceKm(coordinates,e.point.coordinates);
      const factor=clamp((Math.max(5,original)/Math.max(5,distance))**2,.5,2);
      const value=p.temperature-lapseRate*(elevation-e.point.elevation)+trend.mean*dt/3600;
      return [{weight:e.weight*factor,value}];
    });
    if(source.length<3||source.reduce((s,e)=>s+e.weight,0)<.35)return 0;
    return clamp(mean(source.map(e=>e.value),source.map(e=>e.weight))-baseline,-2,2);
  }
  return {legacy,advection30:advect(context.previous,context.short),advection60:advect(history.find(f=>timeMs-f.timeMs===60*60000),context.long),trend:clamp(.5*context.features.warmingTargetContrast*3,-2,2)};
}
