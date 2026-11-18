// Private local archive only. Never included in Pages, Workers or public git.
import {readFile,writeFile,mkdir,realpath} from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {readActiveFaultTile} from "../src/simulation/activeFaultCatalog.js";
import {activeFaultCaseId} from "../src/simulation/activeFault.js";
import {storeModel,jshisUrl,fetchArchiveBytes,publishLocalManifest,verifyArchive,sha256} from "./lib/jshisArchive.mjs";

const workspace=fileURLToPath(new URL("../",import.meta.url));
const root=path.join(workspace,".private-data","jshis");
const args=process.argv.slice(2),value=name=>args[args.indexOf(name)+1];
await mkdir(root,{recursive:true});
if(await realpath(root)!==root)throw new Error("Archive path must not be a symlink or junction");
if(args.includes("--verify")){
  const manifest=JSON.parse(await readFile(path.join(root,"latest.json"),"utf8"));
  console.log(JSON.stringify({verified:await verifyArchive(root,manifest),root}));
} else {
  if(!args.includes("--version")||!args.includes("--case"))throw new Error("Specify --version Y2024 --case MAX or AVR; optional --all-inland --refresh");
  const version=value("--version"),probabilityCase=value("--case");
  if(version!=="Y2024")throw new Error("2024 validated; past editions require a separately verified pattern inventory");
  const runId=new Date().toISOString().replaceAll(":","-"),entries=[],failures=[],index=[];
  await mkdir(path.join(root,"logs"),{recursive:true});
  const log=entry=>writeFile(path.join(root,"logs",`${runId}.jsonl`),JSON.stringify(entry)+"\n",{flag:"a"});
  let lastRequest=0;
  const fetchSlow=async url=>{const remaining=1000-(Date.now()-lastRequest);if(remaining>0)await new Promise(r=>setTimeout(r,remaining));lastRequest=Date.now();return fetchArchiveBytes(url);};
  const codes=["ACHSM","ATKCH","ANMRO","AJTHK","AAEIN","AMYGI","ANNKI"];
  if(args.includes("--all-inland")){
    for(const [x,y] of [[13,5],[14,5],[13,6],[14,6]]){
      const url=`https://www.j-shis.bosai.go.jp/map/xyz/major_fault/Y2022/MAX/4/${x}/${y}.mvt?lang=ja`;
      const bytes=await fetchSlow(url);index.push({source:url,sha256:sha256(bytes),bytes:bytes.length});
      await mkdir(path.join(root,"index"),{recursive:true});await writeFile(path.join(root,"index",`${sha256(bytes)}.mvt`),bytes,{flag:"wx"}).catch(e=>{if(e.code!=="EEXIST")throw e;});
      codes.push(...readActiveFaultTile(bytes).map(activeFaultCaseId));
    }
  }
  const requested=[...new Set(codes)];
  const old=JSON.parse(await readFile(path.join(root,"latest.json"),"utf8").catch(()=>'{"entries":[]}'));
  for(const code of requested){
    const identity={version,probabilityCase,code};
    try {
      const cached=old.entries.find(e=>e.code===code&&e.version===version&&e.probabilityCase===probabilityCase);
      if(cached&&!args.includes("--refresh")){await verifyArchive(root,{entries:[cached]});entries.push(cached);await log({code,status:"verified-cache"});continue;}
      const bytes=await fetchSlow(jshisUrl(identity));
      const entry=await storeModel(root,bytes,identity);
      entries.push(entry);await log({status:cached?.sha256===entry.sha256?"unchanged":cached?"changed":"new",entry,previousSha256:cached?.sha256??null});
      console.log(`${entries.length}/${requested.length} ${code} ${entry.bytes} bytes ${entry.patterns.length} patterns`);
    }catch(error){failures.push({code,message:error.message});await log({code,status:"failed",message:error.message});if(error.fatal)break;}
  }
  const manifest={format:"MeteoScope private J-SHIS archive",version:1,runId,requested,index,entries,failures,
    complete:entries.length===requested.length&&!failures.length,
    terms:{url:"https://www.j-shis.bosai.go.jp/agreement",checkedAt:"2026-11-18",rawRedistribution:false,privateOnly:true},
    coverage:"All Y2024 MAX/AVR patterns in seven named marine models; inland inventory is the Y2022 major_fault index, not all conceivable faults."};
  await writeFile(path.join(root,"logs",`${runId}-manifest.json`),JSON.stringify(manifest,null,2));
  if(!manifest.complete)throw new Error("Incomplete acquisition: previous latest.json retained; successful immutable objects and partial manifest kept");
  const hash=await publishLocalManifest(root,manifest);
  console.log(JSON.stringify({complete:true,models:entries.length,patterns:entries.reduce((n,e)=>n+e.patterns.length,0),manifestSha256:hash,root}));
}
