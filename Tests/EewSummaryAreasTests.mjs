import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { EEW_SUMMARY_AREA_GROUPS } from "../src/eew/eewSummaryAreaGroups.js";
import { summarizeEewAreaNames } from "../src/eew/eewSummaryAreas.js";
import { buildEewForecastAreaFeatureCollection, createEewForecastAreaSignature } from "../src/eew/eewForecastAreas.js";

const geography = JSON.parse(readFileSync(new URL("../public/data/earthquake-areas.geojson", import.meta.url)));
const currentAreas = new Map(geography.features.map(f => [String(f.properties.code), f.properties.name]));
const catalogue = EEW_SUMMARY_AREA_GROUPS.flatMap(group => group.areas);
assert.equal(new Set(catalogue.map(([code]) => code)).size, catalogue.length, "no overlapping districts");
assert.deepEqual(new Map(catalogue), currentAreas, "all current area codes and names remain represented");

for (const group of EEW_SUMMARY_AREA_GROUPS) {
  const areas = group.areas.map(([code, name]) => ({ code, name, from: "4", isWarning: true }));
  assert.deepEqual(summarizeEewAreaNames(areas), [group.name]);
  assert.deepEqual(summarizeEewAreaNames([...areas, ...areas]), [group.name], "duplicates do not inflate coverage");
  assert.deepEqual(summarizeEewAreaNames(areas.map(({code}) => ({code}))), [group.name], "codes support missing names");
  for (let index = 0; index < areas.length; index++) {
    const partial = areas.filter((_, i) => i !== index);
    assert.deepEqual(summarizeEewAreaNames(partial), partial.map(area => area.name), "one missing subdivision prevents a whole district label");
  }
}
const shikoku = EEW_SUMMARY_AREA_GROUPS.find(group => group.name === "四国地方");
const partialPrefectures = ["徳島県北部", "香川県東部", "愛媛県東予", "高知県東部"].map(name => ({name}));
assert.deepEqual(summarizeEewAreaNames(partialPrefectures), partialPrefectures.map(area => area.name), "a partial target in each prefecture is not full Shikoku");
assert.deepEqual(summarizeEewAreaNames([{name:"東京都２３区"},{name:"東京都23区"}]), ["東京都23区"], "NFKC matches, and duplicates collapse");
assert.deepEqual(summarizeEewAreaNames([{name:" 未知の地域 ",code:"600"},{name:"未知の地域"},null,{code:"000"}]), ["未知の地域"]);
assert.deepEqual(summarizeEewAreaNames(null), []);
const conflictingAreas = shikoku.areas.map(([code,name]) => ({code,name}));
conflictingAreas[0] = {code:"300",name:conflictingAreas[0].name};
assert.deepEqual(summarizeEewAreaNames(conflictingAreas), conflictingAreas.map(area=>area.name), "conflicting codes and names do not imply full coverage");
const entries = shikoku.areas.map(([code,name]) => Object.freeze({code,name,from:"5-",type:"警報"}));
const event = Object.freeze({eventId:"live",isWarn:true,warnAreas:Object.freeze(entries)});
const before = buildEewForecastAreaFeatureCollection(geography, [event]);
const signature = createEewForecastAreaSignature([event]);
assert.deepEqual(summarizeEewAreaNames(event.warnAreas), ["四国地方"]);
assert.deepEqual(buildEewForecastAreaFeatureCollection(geography, [event]), before, "summary cannot change geography or feature-state inputs");
assert.equal(createEewForecastAreaSignature([event]), signature);
const other = [{name:"岩手県沿岸北部"}, ...entries, {name:"未知の地域"}];
assert.deepEqual(summarizeEewAreaNames(other), ["四国地方","岩手県沿岸北部","未知の地域"], "complete districts precede retained individual areas");
const groupCodes = name => EEW_SUMMARY_AREA_GROUPS.find(g=>g.name===name).areas.map(([code])=>code);
assert(groupCodes("東海地方").includes("460"));
assert(groupCodes("中国地方").includes("700"));
assert(!groupCodes("関東地方").includes("359"), "Ogasawara is separate from mainland Kanto");
assert(!groupCodes("九州地方").includes("778"), "Amami is a separate EEW district");
console.log("EEW summary grouping: complete and partial coverage, catalogue, immutability passed");
