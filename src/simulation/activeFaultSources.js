import {getDistanceKm} from "../location/distance.js";

// Educational propagation over the selected model's planes. Connections carry
// distance/time across gaps; they are not rendered as invented fault surfaces.
export function buildMultiPlaneSources(preset, options) {
  const sources = [];
  const perPlane = Math.max(2, Math.floor(128 / preset.parts.length));
  for (const part of preset.parts) {
    const intervals = Math.max(1, Math.min(perPlane - 1, Math.ceil(part.lengthKm / 12)));
    for (let i = 0; i <= intervals; i++) sources.push({
      coordinates: part.path[0].map((v,d) => v + (part.path[1][d] - v) * i / intervals),
      depthKm: Math.max(0, Math.min(700, part.depthKm + options.depthKm - preset.depthKm)),
      faultId: part.fault.FLT_ID, faultAlongKm: part.fault.LEN * i / intervals
    });
  }
  const distance = (a,b) => Math.hypot(getDistanceKm(a.coordinates,b.coordinates),a.depthKm-b.depthKm);
  const edges = sources.map(() => []);
  const connect = (a,b) => {const d=distance(sources[a],sources[b]); edges[a].push([b,d]); edges[b].push([a,d]);};
  for (let i=1;i<sources.length;i++) if(sources[i].faultId===sources[i-1].faultId) connect(i-1,i);
  const groups = preset.parts.map(part => sources.flatMap((s,i)=>s.faultId===part.fault.FLT_ID?[i]:[]));
  groups.forEach((a,i) => groups.slice(i+1).forEach(b => {
    let nearest=null, minimum=Infinity;
    for(const ai of a) for(const bi of b) {const d=distance(sources[ai],sources[bi]);if(d<minimum){minimum=d;nearest=[ai,bi];}}
    connect(...nearest);
  }));
  const center = {coordinates:[preset.longitude,preset.latitude],depthKm:options.depthKm};
  const origin = options.ruptureOrigin === "start" ? 0 : options.ruptureOrigin === "end" ? sources.length-1
    : sources.reduce((best,s,i)=>distance(s,center)<distance(sources[best],center)?i:best,0);
  const distances=sources.map(()=>Infinity),done=new Set();distances[origin]=0;
  while(done.size<sources.length){
    let next=-1;
    for(let i=0;i<sources.length;i++)if(!done.has(i)&&(next<0||distances[i]<distances[next]))next=i;
    done.add(next);
    for(const [index,length]of edges[next])distances[index]=Math.min(distances[index],distances[next]+length);
  }
  return sources.map((source,i)=>({...source,ruptureDelaySec:distances[i]/options.ruptureSpeed}));
}
