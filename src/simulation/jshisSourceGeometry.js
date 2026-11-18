import {readJshisPointModel, expectedJshisPatterns} from "./jshisModel.js";
import {getDistanceKm} from "../location/distance.js";

const MODELS={"kuril-trench":"ACHSM","japan-trench":"AJTHK","nankai-trough":"ANNKI"};
export function selectJshisGeometry(data, patternCode, model) {
  const identity={version:"Y2024",probabilityCase:data?.metaData?.case,code:MODELS[model]};
  const result=readJshisPointModel(data,identity),pattern=result.patterns.find(p=>p.code===patternCode);
  if(!pattern)throw new Error("Select an existing J-SHIS pattern");
  const points=[...new Map(pattern.points.map(p=>[p.join(","),p])).values()];
  return {format:"J-SHIS source points",version:1,model,identity,patternCode,points,
    referenceDepthKm:Math.round(points.reduce((n,p)=>n+p[2],0)/points.length)};
}
export function validateJshisGeometry(geometry, options) {
  if(!geometry)return;
  if(geometry.format!=="J-SHIS source points"||geometry.version!==1||geometry.model!==options.model
    ||geometry.identity?.version!=="Y2024"||geometry.identity?.code!==MODELS[options.model]
    ||!["MAX","AVR"].includes(geometry.identity?.probabilityCase)
    ||!expectedJshisPatterns(geometry.identity.code,"Y2024").includes(geometry.patternCode)
    ||!Array.isArray(geometry.points)||!geometry.points.length||geometry.points.length>100000
    ||geometry.points.some(p=>!Array.isArray(p)||p.length!==3||!p.every(Number.isFinite)
      ||p[0]<-180||p[0]>180||p[1]<-85||p[1]>85||p[2]<0||p[2]>700)
    ||!Number.isFinite(geometry.referenceDepthKm)
    ||geometry.referenceDepthKm!==Math.round(geometry.points.reduce((n,p)=>n+p[2],0)/geometry.points.length)
    ||geometry.points.some(p=>p[2]+options.depthKm-geometry.referenceDepthKm<0))
    throw new Error("Invalid or mismatched J-SHIS source points/depth shift");
  // A 2024 probabilistic pattern is not a Cabinet Office full/east/west case.
  if(options.model==="nankai-trough"&&options.nankaiCase!=="full")throw new Error("J-SHIS patterns cannot be assigned to Nankai half ruptures");
}
const cartesian=([lon,lat,depth=0])=>{
  const a=lon*Math.PI/180,b=lat*Math.PI/180,r=6371-depth,c=Math.cos(b);
  return [r*c*Math.cos(a),r*c*Math.sin(a),r*Math.sin(b)];
};
function tree(points,level=0){
  if(!points.length)return null;
  const axis=level%3;points.sort((a,b)=>a[axis]-b[axis]);const middle=points.length>>1;
  return {point:points[middle],axis,left:tree(points.slice(0,middle),level+1),right:tree(points.slice(middle+1),level+1)};
}
function nearest(node,point,best=Infinity){
  if(!node)return best;
  const delta=point[node.axis]-node.point[node.axis];
  best=Math.min(best,node.point.reduce((n,v,i)=>n+(v-point[i])**2,0));
  best=nearest(delta<0?node.left:node.right,point,best);
  return delta*delta<best?nearest(delta<0?node.right:node.left,point,best):best;
}
// All original points participate. This is distance to sampled source points
// in a spherical Earth, an upper bound to a connected surface distance. No
// convex hull, triangulation or invented mesh topology is used.
export function createJshisPointDistances(geometry,sources,depthKm) {
  const groups=sources.map(()=>[]),shift=depthKm-geometry.referenceDepthKm;
  for(const p of geometry.points){
    let index=0,distance=Infinity;
    sources.forEach((s,i)=>{const d=getDistanceKm(p,s.coordinates);if(d<distance){index=i;distance=d;}});
    groups[index].push(cartesian([p[0],p[1],p[2]+shift]));
  }
  const trees=groups.map(points=>tree(points));
  return point=>{const target=cartesian(point);return trees.map(t=>Math.sqrt(nearest(t,target)));};
}
export function snapJshisSources(sources,geometry,depthKm){
  const shift=depthKm-geometry.referenceDepthKm;
  const snapped=sources.map(source=>{
    const p=geometry.points.reduce((best,p)=>getDistanceKm(p,source.coordinates)<getDistanceKm(best,source.coordinates)?p:best);
    return {...source,coordinates:p.slice(0,2),depthKm:p[2]+shift};
  });
  const unique=new Map();
  for(const source of snapped){const key=source.coordinates.join(","),prior=unique.get(key);
    if(!prior||source.ruptureDelaySec<prior.ruptureDelaySec)unique.set(key,source);}
  return [...unique.values()];
}
