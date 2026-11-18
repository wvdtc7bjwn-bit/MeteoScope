import {VectorTile} from "@mapbox/vector-tile";
import Pbf from "pbf";
import {MAP_DATA_ENDPOINTS} from "../config.js";
import {normalizeActiveFault, normalizeActiveFaultSelection} from "./activeFault.js";
import {validateJshisMetadata} from "./jshisModel.js";
export {groupActiveFaultModels} from "./activeFault.js";

// Four zoom-4 tiles cover the Japanese inland fault catalogue. Fetched directly
// from the existing official provider, only when the user requests this model.
const TILES = [[13,5],[14,5],[13,6],[14,6]];
const MAX_BYTES = 2 * 1024 * 1024;
let cached = null;
const modelCache = new Map();

async function readFaultBytes(response, label) {
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
  const reader=response.body?.getReader();
  if(!reader)throw new Error(`Empty ${label}`);
  let size=0;const chunks=[];
  try {for (;;) {const {done,value}=await reader.read();if(done)break;size+=value.length;
    if(size>MAX_BYTES)throw new Error(`${label} too large`);chunks.push(value);}}
  finally {await reader.cancel().catch(()=>{});}
  const bytes=new Uint8Array(size);let offset=0;
  for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  return bytes;
}

export function readActiveFaultModel(data, id, {probabilityCase="MAX"} = {}) {
  validateJshisMetadata(data,{version:"Y2024",probabilityCase,code:id});
  const model = data.seisact_model;
  if (data.features.length !== Number(model.geom_num) || data.features.length > 64)
    throw new Error("Incomplete or mismatched official fault model");
  const min = Number(model.magl), max = Number(model.magu);
  const magnitude = Number.isFinite(min) && min === max && min !== 0 ? min : null;
  const planes = data.features.map(feature => {
    const p = feature.properties;
    if (!p || !String(p.flt_id).startsWith(id + "_") || (p.pattern_code && p.pattern_code !== id))
      throw new Error("Different activity pattern in fault model");
    const ring=feature.geometry?.coordinates?.[0];
    if(feature.geometry?.type!=="Polygon"||feature.geometry.coordinates.length!==1||!Array.isArray(ring)||ring.length!==5
      ||JSON.stringify(ring[0])!==JSON.stringify(ring[4])) throw new Error("Incomplete official fault rectangle");
    return normalizeActiveFault({...Object.fromEntries(Object.entries(p).map(([key,value]) => [key.toUpperCase(), value])), LTENAME: model.ltename, MAG: magnitude, CORNERS:ring.slice(0,4)});
  });
  return normalizeActiveFaultSelection({...planes[0], planes, modelVersion: "Y2024"});
}

export async function loadActiveFaultModel(id, {signal, fetcher = fetch} = {}) {
  if (!/^F[0-9A-Z]{6}$/u.test(id)) throw new RangeError("Invalid activity case ID");
  signal?.throwIfAborted();
  if (fetcher === fetch && modelCache.has(id)) return structuredClone(modelCache.get(id));
  const response = await fetcher(`https://www.j-shis.bosai.go.jp/map/api/pshm/Y2024/MAX/${id}/fltinfo.geojson?epsg=4326&lang=ja`,
    {signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)});
  const bytes=await readFaultBytes(response,"Fault model");
  signal?.throwIfAborted();
  const result = readActiveFaultModel(JSON.parse(new TextDecoder().decode(bytes)), id);
  if (fetcher === fetch) modelCache.set(id, result);
  return structuredClone(result);
}

export function readActiveFaultTile(bytes) {
  const layer = new VectorTile(new Pbf(bytes)).layers.major_fault;
  if (!layer) return [];
  if (layer.length > 10000) throw new Error("Active fault tile has too many features");
  const faults = [];
  for (let index = 0; index < layer.length; index++) {
    // Invalid source records are not selectable; never replace missing values.
    try { faults.push(normalizeActiveFault(layer.feature(index).properties)); } catch (error) { if (!(error instanceof RangeError)) throw error; }
  }
  return faults;
}

export async function loadActiveFaultCatalog({signal, fetcher = fetch} = {}) {
  signal?.throwIfAborted();
  if (cached && fetcher === fetch) return cached;
  const timeout = AbortSignal.timeout(15000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  const results = await Promise.all(TILES.map(async ([x,y]) => {
    const url = MAP_DATA_ENDPOINTS.jshisMajorFaultTiles.replace("{z}", "4").replace("{x}", String(x)).replace("{y}", String(y));
    const response = await fetcher(url, {signal: requestSignal});
    const bytes=await readFaultBytes(response,"Active fault tile");
    return readActiveFaultTile(bytes);
  }));
  requestSignal.throwIfAborted();
  const unique = new Map(results.flat().map(fault => [fault.FLT_ID, fault]));
  const faults = [...unique.values()].sort((a,b) => b.LAT - a.LAT || a.LTENAME.localeCompare(b.LTENAME, "ja") || a.FLT_ID.localeCompare(b.FLT_ID));
  if (!faults.length) throw new Error("No usable active fault models");
  if (fetcher === fetch) cached = faults;
  return faults;
}
