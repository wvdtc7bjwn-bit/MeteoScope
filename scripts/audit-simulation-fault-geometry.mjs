import {writeFile} from "node:fs/promises";
import {buildActiveFaultPreset} from "../src/simulation/activeFault.js";
import {getDistanceKm} from "../src/location/distance.js";
import {readActiveFaultModel} from "../src/simulation/activeFaultCatalog.js";

// Live official geometry is compared in memory, never copied into public assets.
const ids=process.argv.slice(2);
if(!ids.length)throw new Error("Pass official activity-case IDs");
const results=[];
for(const id of ids){
  if(!/^F[0-9A-Z]{6}$/u.test(id))throw new Error("Invalid case ID");
  const url=`https://www.j-shis.bosai.go.jp/map/api/pshm/Y2024/MAX/${id}/fltinfo.geojson?epsg=4326&lang=ja`;
  try {
  const response=await fetch(url,{signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`${id}: HTTP ${response.status}`);
  const data=await response.json();
  if(data.status!=="Success"||data.metaData.version!=="Y2024"||data.metaData.ltecode!==id
    ||data.crs.properties.name!=="urn:ogc:def:crs:EPSG:4326"||data.features.length!==Number(data.seisact_model.geom_num))throw new Error("Incomplete official data");
  readActiveFaultModel(data,id); // Same validation used by the live selector.
  const planes=data.features.map(feature=>{
    const properties=Object.fromEntries(Object.entries(feature.properties).map(([k,v])=>[k.toUpperCase(),v]));
    const ring=feature.geometry?.coordinates?.[0];
    if(feature.geometry?.type!=="Polygon"||ring?.length!==5||!ring.every(p=>p.length===3&&p.every(Number.isFinite)))throw new Error("Unsupported official rectangle");
    const before=buildActiveFaultPreset({...properties,LTENAME:data.seisact_model.ltename,MAG:null});
    const preset=buildActiveFaultPreset({...properties,LTENAME:data.seisact_model.ltename,MAG:null,CORNERS:ring.slice(0,4)});
    const corners=[preset.areaSides.left[0],preset.areaSides.left[1],preset.areaSides.right[1],preset.areaSides.right[0]];
    const distances=corners.map((p,i)=>getDistanceKm(p,ring[i])*1000);
    const middle=[ring[0],ring[1]].map((p,i)=>p.slice(0,2).map((v,d)=>(v+ring[3-i][d])/2));
    const beforeCorners=[before.areaSides.left[0],before.areaSides.left[1],before.areaSides.right[1],before.areaSides.right[0]];
    return {id:properties.FLT_ID,dip:Number(properties.DIP),cornerErrorsM:distances,beforeCornerErrorsM:beforeCorners.map((p,i)=>getDistanceKm(p,ring[i])*1000),
      midlineErrorsM:middle.map((p,i)=>getDistanceKm(p,preset.path[i])*1000),
      upperDepthErrorKm:Math.abs(Number(properties.DEP)-ring[0][2]),
      lowerDepthErrorKm:Math.abs(Number(properties.DEP)+Number(properties.WID)*Math.sin(Number(properties.DIP)*Math.PI/180)-ring[2][2])};
  });
  const result={id,name:data.seisact_model.ltename,url,planes,
    maxCornerErrorM:Math.max(...planes.flatMap(p=>p.cornerErrorsM)),beforeMaxCornerErrorM:Math.max(...planes.flatMap(p=>p.beforeCornerErrorsM)),maxMidlineErrorM:Math.max(...planes.flatMap(p=>p.midlineErrorsM))};
  results.push(result);
  console.log(JSON.stringify({id,name:result.name,planes:planes.length,maxCornerErrorM:result.maxCornerErrorM,maxMidlineErrorM:result.maxMidlineErrorM}));
  } catch(error) {
    const result={id,url,error:error.message};results.push(result);console.log(JSON.stringify(result));
  }
}
await writeFile(".cache/simulation-fault-position-audit.json",JSON.stringify({checkedAt:new Date().toISOString(),results},null,2));
