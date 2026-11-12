import { mechanismEvent } from './focalMechanism.js';
import { getDistanceKm } from '../location/distance.js';
const ROOT = 'https://earthquake.usgs.gov/fdsnws/event/1/query';
const number = v => (typeof v === 'number' || typeof v === 'string' && v.trim() !== '') && Number.isFinite(Number(v)) ? Number(v) : null;
const time = v => typeof v === 'string' && /(?:Z|[+-]\d{2}:\d{2})$/.test(v) ? Date.parse(v) : NaN;

export function matchUsgsEvent(features, target) {
  const matches = features.filter(f => f.type === 'Feature' && typeof f.id === 'string' && /^[a-zA-Z0-9]+$/.test(f.id)
    && Number.isFinite(f.properties?.time) && Math.abs(f.properties.time-target.time) <= 90000
    && Array.isArray(f.geometry?.coordinates) && f.geometry.coordinates.length >= 2
    && f.geometry.coordinates.slice(0,2).every(Number.isFinite)
    && Math.abs(f.geometry.coordinates[0]) <= 180 && Math.abs(f.geometry.coordinates[1]) <= 90
    && getDistanceKm(f.geometry.coordinates.slice(0,2),target.coordinates) <= 50);
  return matches.length === 1 ? matches[0] : null;
}

export function parseUsgsMechanism(detail) {
  if (!/^[a-zA-Z0-9]+$/.test(detail?.id ?? '')) return null;
  for (const type of ['moment-tensor','focal-mechanism']) {
    const candidates = detail.properties?.products?.[type];
    const products = (Array.isArray(candidates) ? candidates : []).filter(p => p?.source === 'us'
      && (!p.properties?.['beachball-source'] || p.properties['beachball-source'] === 'us') && p.status === 'UPDATE')
      .sort((a,b) => (number(b.preferredWeight) ?? 0)-(number(a.preferredWeight) ?? 0) || (number(b.updateTime) ?? 0)-(number(a.updateTime) ?? 0));
    for (const product of products) {
      const p = product.properties ?? {};
      const tensor = ['mrr','mtt','mpp','mrt','mrp','mtp'].map(k => number(p['tensor-'+k]));
      const hasTensor = tensor.every(v => v !== null) && tensor.some(v => v !== 0);
      const planes = [1,2].map(n => [number(p[`nodal-plane-${n}-strike`]),number(p[`nodal-plane-${n}-dip`]),number(p[`nodal-plane-${n}-rake`] ?? p[`nodal-plane-${n}-Rake`] ?? p[`nodal-plane-${n}-slip`])])
        .filter(a => a.every(v => v !== null) && a[0]>=0 && a[0]<=360 && a[1]>=0 && a[1]<=90 && Math.abs(a[2])<=180);
      if (!hasTensor && !planes.length) continue;
      const origin = time(p.eventtime);
      if (!Number.isFinite(origin)) continue;
      return { id:detail.id, usgs:true, archive:true, time:origin, place:detail.properties?.place ?? '',
        mw:number(p['derived-magnitude'] ?? p.magnitude), magnitudeType:p['derived-magnitude-type'] || 'Mw',
        planes, tensor:hasTensor ? tensor.map(v => v/Math.max(...tensor.map(Math.abs))) : null,
        axes: ['p','t'].flatMap(name => {
          const azimuth=number(p[`${name}-axis-azimuth`]), plunge=number(p[`${name}-axis-plunge`]);
          return azimuth !== null && azimuth >= 0 && azimuth <= 360 && plunge !== null && plunge >= 0 && plunge <= 90
            ? [{name:name.toUpperCase(), ...projectMechanismDirection(azimuth,plunge)}] : [];
        }),
        label:type === 'moment-tensor' ? 'USGS モーメントテンソル解' : 'USGS 初動発震機構解',
        review:p['review-status'] ?? p['evaluation-status'] ?? '',
        centroidTime:Number.isFinite(time(p['derived-eventtime'])) ? time(p['derived-eventtime']) : null,
        centroidDepth:number(p['derived-depth']), source:`https://earthquake.usgs.gov/earthquakes/eventpage/${detail.id}/${type}` };
    }
  }
  return null;
}

// Equal-area projection, canvas coordinates (east/right, south/down).
export function projectMechanismDirection(azimuth, plunge) {
  const radians=Math.PI/180, radius=Math.sqrt(1-Math.sin(plunge*radians));
  return {x:radius*Math.sin(azimuth*radians), y:-radius*Math.cos(azimuth*radians)};
}

export function mechanismPlaneLine([strike,dip]) {
  if (Math.abs(dip-90)<1e-8) return [projectMechanismDirection(strike,0),projectMechanismDirection(strike+180,0)];
  return Array.from({length:181},(_,angle) => projectMechanismDirection(strike+angle,
    Math.atan(Math.tan(dip*Math.PI/180)*Math.sin(angle*Math.PI/180))*180/Math.PI));
}

// QuakeML r/theta/phi = up/south/east. Lower hemisphere equal-area projection.
export function tensorAmplitude(tensor,x,y) {
  const r=Math.hypot(x,y); if(r>1) return null;
  const angle=2*Math.asin(r/Math.SQRT2), s=Math.sin(angle);
  const u=-Math.cos(angle), south=r ? y/r*s : 0, east=r ? x/r*s : 0;
  const [rr,tt,pp,rt,rp,tp]=tensor;
  return rr*u*u+tt*south*south+pp*east*east+2*(rt*u*south+rp*u*east+tp*south*east);
}

export function createUsgsMechanismClient(fetcher = (...args) => fetch(...args), now = Date.now) {
  const cache=new Map();
  async function json(url) {
    const response=await fetcher(url,{credentials:'omit',signal:AbortSignal.timeout(12000)});
    if(!response.ok) throw new Error('USGS unavailable');
    return response.json();
  }
  return async event => {
    const target=mechanismEvent(event); if(!target) return null;
    const key=`${target.time}:${target.coordinates.join(',')}`;
    const previous=cache.get(key); if(previous && now()-previous.time<900000) return previous.promise;
    const entry={time:now()};
    entry.promise=(async () => {
      const params=new URLSearchParams({format:'geojson',starttime:new Date(target.time-90000).toISOString(),endtime:new Date(target.time+90000).toISOString(),latitude:String(target.coordinates[1]),longitude:String(target.coordinates[0]),maxradiuskm:'50',limit:'100',eventtype:'earthquake'});
      const list=await json(`${ROOT}?${params}`);
      // A truncated candidate list cannot safely establish a unique match.
      if(!Array.isArray(list.features) || list.features.length>=100) return null;
      const match=matchUsgsEvent(list.features,target); if(!match) return null;
      if(!/(?:^|,)(?:moment-tensor|focal-mechanism)(?:,|$)/.test(match.properties.types ?? '')) return null;
      const detail=await json(`${ROOT}?format=geojson&eventid=${encodeURIComponent(match.id)}`);
      if(detail.id!==match.id) return null;
      return parseUsgsMechanism(detail);
    })().catch(error => { if(cache.get(key)===entry) cache.delete(key); throw error; });
    if(cache.size>=64) cache.delete(cache.keys().next().value);
    cache.set(key,entry); return entry.promise;
  };
}
export const loadUsgsMechanism=createUsgsMechanismClient();
