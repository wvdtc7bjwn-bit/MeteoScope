import {mkdir, readFile, writeFile, rename, unlink} from "node:fs/promises";
import {createHash, randomUUID} from "node:crypto";
import {gzipSync} from "node:zlib";
import path from "node:path";
import {readJshisPointModel, validateJshisMetadata} from "../../src/simulation/jshisModel.js";
import {readActiveFaultModel} from "../../src/simulation/activeFaultCatalog.js";

export const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
export function inspectModel(bytes, identity) {
  const data = JSON.parse(new TextDecoder("utf-8", {fatal:true}).decode(bytes));
  validateJshisMetadata(data, identity);
  if (identity.code.startsWith("F")) {
    // Live UI rectangle validation remains the single implementation.
    if (identity.version !== "Y2024") throw new Error("Older inland editions require a version-specific validator");
    readActiveFaultModel(data, identity.code,{probabilityCase:identity.probabilityCase});
    return {kind:"rectangles", planes:data.features.length, patterns:[], name:data.seisact_model.ltename};
  }
  const result = readJshisPointModel(data, identity);
  return {kind:"points-without-topology", pointCount:result.pointCount,
    patterns:result.patterns.map(p=>p.code), name:result.name, magnitudeRange:result.magnitudeRange};
}
async function immutableFile(file, bytes) {
  try {
    if(sha256(await readFile(file))!==sha256(bytes))throw new Error("Existing archive object is corrupt");
    return;
  }catch(error){if(error.code!=="ENOENT")throw error;}
  const temp=`${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp,bytes,{flag:"wx"});
    // Publish a completed object; a crash cannot leave a partial
    // GeoJSON under its final content-addressed filename.
    // Concurrent writers of this content address have identical bytes.
    await rename(temp,file);
  } finally {await unlink(temp).catch(error=>{if(error.code!=="ENOENT")throw error;});}
}
export async function storeModel(root, bytes, identity, fetchedAt = new Date().toISOString()) {
  const info=inspectModel(bytes,identity), hash=sha256(bytes);
  await mkdir(path.join(root,"objects"),{recursive:true});
  await mkdir(path.join(root,"computed-v1"),{recursive:true});
  await immutableFile(path.join(root,"objects",`${hash}.geojson`),bytes);
  // Private computation format: preserve points/planes exactly, not permission
  // to redistribute. No public build step reads this directory.
  const data=JSON.parse(new TextDecoder().decode(bytes));
  const computed={format:"MeteoScope private J-SHIS computation",version:1,identity,
    rawSha256:hash,source:jshisUrl(identity),redistribution:"not-authorized",
    features:data.features,model:data.seisact_model};
  const compact=Buffer.from(JSON.stringify(computed)), compressed=gzipSync(compact,{mtime:0});
  await immutableFile(path.join(root,"computed-v1",`${hash}.json.gz`),compressed);
  return {...identity,source:jshisUrl(identity),fetchedAt,sha256:hash,bytes:bytes.length,
    computedSha256:sha256(compressed),computedBytes:compressed.length,...info};
}
export function jshisUrl({version, probabilityCase, code}) {
  if(!/^Y20\d{2}(?:_M[23])?$/u.test(version)||!["MAX","AVR"].includes(probabilityCase)||!/^F[0-9A-Z]{6}$|^A[A-Z]{4}$/u.test(code))throw new Error("Invalid archive identity");
  return `https://www.j-shis.bosai.go.jp/map/api/pshm/${version}/${probabilityCase}/${code}/fltinfo.geojson?epsg=4326&lang=ja`;
}
export async function verifyArchive(root, manifest) {
  for(const entry of manifest.index??[]){
    if(!/^[a-f0-9]{64}$/u.test(entry.sha256))throw new Error("Invalid index hash");
    if(sha256(await readFile(path.join(root,"index",`${entry.sha256}.mvt`)))!==entry.sha256)throw new Error("Corrupt fault catalogue index");
  }
  for(const entry of manifest.entries){
    if(!/^[a-f0-9]{64}$/u.test(entry.sha256)||!/^[a-f0-9]{64}$/u.test(entry.computedSha256))throw new Error("Invalid archive hash");
    const raw=await readFile(path.join(root,"objects",`${entry.sha256}.geojson`));
    if(sha256(raw)!==entry.sha256)throw new Error(`Corrupt raw model: ${entry.code}`);
    inspectModel(raw,entry);
    const computed=await readFile(path.join(root,"computed-v1",`${entry.sha256}.json.gz`));
    if(sha256(computed)!==entry.computedSha256)throw new Error(`Corrupt computation model: ${entry.code}`);
  }
  return manifest.entries.length;
}
export async function publishLocalManifest(root, manifest) {
  await verifyArchive(root,manifest);
  await mkdir(path.join(root,"manifests"),{recursive:true});
  const bytes=Buffer.from(JSON.stringify(manifest,null,2)), hash=sha256(bytes);
  await immutableFile(path.join(root,"manifests",`${hash}.json`),bytes);
  const temp=path.join(root,`.latest-${randomUUID()}.tmp`);
  await writeFile(temp,bytes,{flag:"wx"});
  await rename(temp,path.join(root,"latest.json"));
  return hash;
}
export async function fetchArchiveBytes(url,{fetcher=fetch,wait=ms=>new Promise(r=>setTimeout(r,ms)),maxBytes=32*1024*1024}={}) {
  for(let attempt=0;attempt<3;attempt++){
    try {
      const response=await fetcher(url,{signal:AbortSignal.timeout(60000)});
      if(response.status===403||response.status===429){await response.body?.cancel();throw Object.assign(new Error(`Access limited: HTTP ${response.status}; stop acquisition`),{fatal:true});}
      if(!response.ok){await response.body?.cancel();throw Object.assign(new Error(`HTTP ${response.status}`),{fatal:response.status<500});}
      const reader=response.body.getReader(),chunks=[];let size=0;
      try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>maxBytes)throw Object.assign(new Error("Model exceeds byte limit"),{fatal:true});chunks.push(value);}}
      finally {await reader.cancel().catch(()=>{});}
      return Buffer.concat(chunks);
    } catch(error){if(error.fatal||attempt===2)throw error;await wait(2000*2**attempt);}
  }
}
