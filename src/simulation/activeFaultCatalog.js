import {VectorTile} from "@mapbox/vector-tile";
import Pbf from "pbf";
import {MAP_DATA_ENDPOINTS} from "../config.js";
import {normalizeActiveFault} from "./activeFault.js";

// Four zoom-4 tiles cover the Japanese inland fault catalogue. Fetched directly
// from the existing official provider, only when the user requests this model.
const TILES = [[13,5],[14,5],[13,6],[14,6]];
const MAX_BYTES = 2 * 1024 * 1024;
let cached = null;

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
    if (!response.ok) throw new Error(`Active fault catalogue HTTP ${response.status}`);
    const reader = response.body?.getReader();
    if (!reader) throw new Error("Empty active fault tile");
    let size = 0; const chunks = [];
    try { for (;;) { const {done,value} = await reader.read(); if (done) break; size += value.length; if (size > MAX_BYTES) throw new Error("Active fault tile too large"); chunks.push(value); } }
    finally { await reader.cancel().catch(() => {}); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.length;}
    return readActiveFaultTile(bytes);
  }));
  requestSignal.throwIfAborted();
  const unique = new Map(results.flat().map(fault => [fault.FLT_ID, fault]));
  const faults = [...unique.values()].sort((a,b) => b.LAT - a.LAT || a.LTENAME.localeCompare(b.LTENAME, "ja") || a.FLT_ID.localeCompare(b.FLT_ID));
  if (!faults.length) throw new Error("No usable active fault models");
  if (fetcher === fetch) cached = faults;
  return faults;
}
