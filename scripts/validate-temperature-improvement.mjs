// Frozen candidate selection on earlier times, one acceptance check on later times.
// All outputs and public observation inputs remain outside deployment assets.
import {readFile,writeFile} from "node:fs/promises";
import {auditTemperatureFrame,prepareTemperatureAuditFrame,summarizeAudit} from "./audit-local-temperature.mjs";
const directory=new URL("../.cache/temperature-audit/",import.meta.url);
const inputs=JSON.parse(await readFile(new URL("inputs.json",directory),"utf8"));
const historical=JSON.parse(await readFile(new URL("../docs/data/local-temperature-validation.json",import.meta.url),"utf8"));
const paths=new Map(inputs.landPaths);
const connection=(a,b)=>paths.get([a.coordinates.join(","),b.coordinates.join(",")].sort().join("|"))??null;
const frames=inputs.frames.map(frame=>({...frame,prepared:prepareTemperatureAuditFrame({...frame,connection})}));
const calibration=frames.filter(f=>historical.calibrationTimes.includes(f.observationTime));
const evaluation=frames.filter(f=>!historical.calibrationTimes.includes(f.observationTime));
const baselineConfig={heightSimilarityScaleM:0,directionalReachRatio:0};
function evaluate(frames,config) {return frames.flatMap(frame=>auditTemperatureFrame({prepared:frame.prepared,config}));}
function metrics(rows) {return {...summarizeAudit(rows),estimated:rows.filter(r=>r.kind==="estimated").length,
  estimatesOnly:summarizeAudit(rows.filter(r=>r.kind==="estimated")),fallbackOnly:summarizeAudit(rows.filter(r=>r.kind==="observed")),
  byHeight:Object.fromEntries(["low","middle","high"].map(key=>[key,summarizeAudit(rows.filter(r=>(r.elevation<200?"low":r.elevation<800?"middle":"high")===key))]))};}
function paired(baseline,candidate) {
  const base=new Map(baseline.map(r=>[`${r.time}/${r.stationId}`,r]));
  const common=candidate.filter(r=>r.kind==="estimated"&&base.get(`${r.time}/${r.stationId}`)?.kind==="estimated");
  return {count:common.length,baseline:summarizeAudit(common.map(r=>base.get(`${r.time}/${r.stationId}`))),candidate:summarizeAudit(common),
    improved:common.filter(r=>Math.abs(r.errorC)<Math.abs(base.get(`${r.time}/${r.stationId}`).errorC)-1e-9).length,
    worsened:common.filter(r=>Math.abs(r.errorC)>Math.abs(base.get(`${r.time}/${r.stationId}`).errorC)+1e-9).length};
}
const baselineRows=evaluate(calibration,baselineConfig),baseline=metrics(baselineRows);
// Small predeclared set; no individual-station, region, clock-hour or app-specific offsets.
const configurations=[
  {heightSimilarityScaleM:200,directionalReachRatio:0},
  {heightSimilarityScaleM:400,directionalReachRatio:0},
  {heightSimilarityScaleM:800,directionalReachRatio:0},
  {heightSimilarityScaleM:0,directionalReachRatio:2},
  {heightSimilarityScaleM:400,directionalReachRatio:2},
  {heightSimilarityScaleM:800,directionalReachRatio:2}
];
const trials=[];
for(const config of configurations) {
  const rows=evaluate(calibration,config),m=metrics(rows),comparison=paired(baselineRows,rows);
  trials.push({config,metrics:m,paired:comparison});console.log(JSON.stringify({calibration:config,mae:m.mae,rmse:m.rmse,estimated:m.estimated,commonMae:comparison.candidate.mae}));
}
const eligible=trials.filter(t=>t.metrics.mae<baseline.mae&&t.metrics.rmse<=baseline.rmse
  &&t.paired.candidate.mae<t.paired.baseline.mae&&t.metrics.estimated>=baseline.estimated*.99);
const selected=eligible.sort((a,b)=>a.metrics.mae-b.metrics.mae)[0]??{config:baselineConfig,metrics:baseline};
console.log("Candidate frozen before later-time evaluation: "+JSON.stringify(selected.config));
const before=evaluate(evaluation,baselineConfig),after=evaluate(evaluation,selected.config);
const b=metrics(before),c=metrics(after),common=paired(before,after);
const checks={mae:c.mae<b.mae,rmse:c.rmse<=b.rmse,commonMae:common.candidate.mae<common.baseline.mae,
  coverage:c.estimated>=b.estimated*.99,p95:c.p95AbsoluteError<=b.p95AbsoluteError*1.02,
  maxEstimated:c.estimatesOnly.maxAbsoluteError<=b.estimatesOnly.maxAbsoluteError*1.05,
  heightGroups:Object.entries(c.byHeight).every(([key,m])=>m.count<50||m.mae<=b.byHeight[key].mae*1.05)};
const result={design:"Earlier 4 times select one candidate; later 5 times only accept/reject frozen candidate. Outer station LOO, same land geometry and public environmental context. Known station altitude; no DEM/GPS errors.",
  baselineConfig,calibrationTimes:calibration.map(f=>f.observationTime),evaluationTimes:evaluation.map(f=>f.observationTime),
  calibration:{baseline,trials},selectedConfig:selected.config,evaluation:{baseline:b,candidate:c,paired:common},checks,accepted:Object.values(checks).every(Boolean)};
await writeFile(new URL("improvement-validation.json",directory),JSON.stringify(result,null,2)+"\n");
await writeFile(new URL("improvement-paired.json",directory),JSON.stringify({before,after})+"\n");
console.log(JSON.stringify({selected:result.selectedConfig,accepted:result.accepted,checks,before:b,after:c}));
