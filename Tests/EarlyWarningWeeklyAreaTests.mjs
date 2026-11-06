import assert from "node:assert/strict";
import { buildAreaHierarchy, buildEarlyWarningData } from "../src/jma/warnings.js";

const index = { byCode: new Map([
  ["0720100", { code: "0720100", name: "福島市" }],
  ["0720400", { code: "0720400", name: "いわき市" }],
  ["0720200", { code: "0720200", name: "会津若松市" }],
  ["0820100", { code: "0820100", name: "水戸市" }],
  ["0820200", { code: "0820200", name: "日立市" }]
]), byParentCode: new Map() };
const areaConst = {
  offices: { "070000": { children: ["070010", "070020", "070030"] } },
  class10s: {
    "070010": { name: "中通り", children: ["0720100"] },
    "070020": { name: "浜通り", children: ["0720400"] },
    "070030": { name: "会津", children: ["0720200"] },
    "080010": { name: "区域A", children: ["0820100"] },
    "080020": { name: "区域B", children: ["0820200"] }
  }
};
// Same source format as JMA week_area05.json: class10 -> weekly area codes.
const weekly = { "070010": ["070000", "070100"], "070020": ["070000", "070100"], "070030": ["070000", "070030"], "080010": ["080100"], "080020": ["080100"] };
const hierarchy = buildAreaHierarchy(areaConst, index, weekly);
assert.deepEqual(hierarchy.getDisplayAreaCodes("070100"), ["070010", "070020"]);
assert.deepEqual(hierarchy.getDisplayAreaCodes("080100"), ["080010", "080020"]);
assert.deepEqual(hierarchy.getDisplayAreaCodes("070000"), ["070010", "070020", "070030"]);
const series = (code, times, type, probabilities) => ({ timeDefines: times, areas: [{ code, properties: [{ type, probabilities }] }] });
const report = [{ reportDatetime: "2026-11-06T11:00:00+09:00", timeSeries: [
  series("070010", ["2026-11-06T12:00:00+09:00", "2026-11-06T18:00:00+09:00"], "大雨", ["中", ""]),
  series("070100", ["2026-11-09T00:00:00+09:00", "2026-11-10T00:00:00+09:00", "2026-11-11T00:00:00+09:00"], "大雨", ["中", "高", ""]),
  series("070100", ["2026-11-09T00:00:00+09:00"], "波浪", ["高"]),
  series("070030", ["2026-11-09T00:00:00+09:00"], "大雨", [""]),
  series("080100", ["2026-11-09T00:00:00+09:00"], "大雨", ["中"])
] }];
const result = buildEarlyWarningData(report, index, hierarchy, { wave: new Set(["070010"]) });
const byCode = new Map(result.areas.map((area) => [area.areaCode, area]));
for (const code of ["070010", "070020"]) {
  const rain = byCode.get(code).rows.find((row) => row.type === "大雨");
  assert.equal(rain.slots.find((slot) => slot.time.startsWith("2026-11-10"))?.label, "高");
  assert.ok(byCode.get(code).sourceAreaCodes.includes("070100"));
}
assert.ok(byCode.get("070010").rows.find((row) => row.type === "大雨").slots.some((slot) => slot.time.startsWith("2026-11-06")));
assert.equal(byCode.get("070010").rows.some((row) => row.type === "波浪"), false);
assert.equal(byCode.get("070020").rows.some((row) => row.type === "波浪"), true);
assert.equal(byCode.get("070030").sourceAreaCodes.includes("070100"), false);
assert.equal(byCode.get("080010").level, "middle");
assert.equal(byCode.get("080020").level, "middle");
assert.ok(result.municipalityAreas.some((area) => area.areaCode === "0720400"));
console.log("Early warning weekly area tests passed");
