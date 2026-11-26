import {mkdir,readFile,writeFile} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {execFileSync} from "node:child_process";
const root=new URL("../",import.meta.url);
// Historical model definitions are frozen at 1795506, not the application's future defaults.
export const VALIDATION_POLICY=Object.freeze({
  radiusKm: 50, maxStations: 8, minStations: 3, power: 2, lapseRate: .0065,
  coincidentKm: .1, minDistanceKm: .2, maxAgeMs: 30 * 60 * 1000,
  futureToleranceMs: 2 * 60 * 1000, maxNearestKm: 100,
  maxStationHeightDifference: 1200, maxHeightExtrapolation: 300,
  maxMedianHeightDifference: 600, maxSpreadC: 4,
  warningSpreadC: 2, warningHeightDifference: 300, distantKm: 15,
  highConfidenceNearestKm: 5, highConfidenceStations: 5,
  warningBearingGap: 240, rejectBearingGap: 300,
  dynamicEnabled: false, // No release adoption before independent multi-period validation.
  environmentStrength: 2, // Earlier-time selection + held-out comparison: docs/data/temperature-environment-validation.json.
  environmentLandWeight: 1, environmentTerrainWeight: .5, environmentMinWeight: .2,
  heightSimilarityScaleM: 200, // Separated LOO + unseen next-frame check; scale is empirical, not an error bound.
  directionalReachRatio: 0, // Tested alternative remains disabled.
  regressionMinStations: 6, regressionHeightRange: 150, regressionMinR2: .35,
  maxAbsLapseRate: .015, maxLapseStd: .003, dynamicMinImprovementC: .15,
  dynamicMinImprovementRatio: .1, elevationMoveKm: .1, failureTtlMs: 15 * 60 * 1000
});
export const validationConfig=(overrides={})=>({...VALIDATION_POLICY,...overrides});
export const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
export async function createValidationRun(name) {
  const directory=new URL(`.cache/temperature-validation-runs/${new Date().toISOString().replaceAll(":","-")}-${name}-${randomUUID().slice(0,8)}/`,root);
  await mkdir(directory,{recursive:true});return directory;
}
export async function saveValidationRun(name,result,{directory,inputFiles=[]}={}) {
  directory??=await createValidationRun(name);
  const hashes={};
  const sources=["src/location/temperatureEstimation.js","src/location/temperatureEstimationPolicy.js","src/location/environmentProfile.js","src/location/currentLocation.js","src/location/environmentMesh.js","src/location/localTemperatureController.js","src/location/locationFix.js","src/utils/retryableResource.js","src/ui/localTemperatureView.js","src/app.js","src/ui/currentLocationWeather.js","scripts/temperatureValidationRun.mjs","scripts/validate-temperature-quality.mjs","scripts/audit-local-temperature.mjs","src/jma/amedas.js","public/data/temperature-environment/v1/manifest.json","public/data/jma-weather-warning-municipalities.geojson",...inputFiles];
  for(const path of [...new Set(sources)])hashes[path]=sha256(await readFile(new URL(path,root)));
  const environment=JSON.parse(await readFile(new URL("public/data/temperature-environment/v1/manifest.json",root),"utf8"));
  for(const tile of environment.tiles) {
    const path=`public/data/temperature-environment/v1/${tile.primary}.bin`;
    hashes[path]=sha256(await readFile(new URL(path,root)));
  }
  const provenance={commit:execFileSync("git",["rev-parse","HEAD"],{cwd:root}).toString().trim(),
    diffSha256:sha256(execFileSync("git",["diff","HEAD","--",...sources.filter(p=>p.startsWith("src/")||p.startsWith("scripts/"))],{cwd:root})),createdAt:new Date().toISOString(),hashes};
  await writeFile(new URL("summary.json",directory),JSON.stringify({...result,provenance},null,2)+"\n");
  console.log(`Saved ${directory.pathname}`);return directory;
}
