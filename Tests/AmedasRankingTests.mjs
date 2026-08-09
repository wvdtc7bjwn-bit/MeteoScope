import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assignAmedasCompetitionRanks } from "../src/amedasRanking.js";

const leftPanelSource = await readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");

const source = [
  { id: "a", value: 39.3 },
  { id: "b", value: 39.2 },
  { id: "c", value: 39.2 },
  { id: "d", value: 39.2 },
  { id: "e", value: 39.1 }
];

const ranked = assignAmedasCompetitionRanks(source);

assert.deepEqual(ranked.map((item) => item.rank), [1, 2, 2, 2, 5]);
assert.deepEqual(ranked.map((item) => item.id), ["a", "b", "c", "d", "e"]);
assert.equal(source.some((item) => Object.hasOwn(item, "rank")), false);

assert.deepEqual(
  assignAmedasCompetitionRanks([
    { value: 10 },
    { value: 11 },
    { value: 11 },
    { value: 12 }
  ]).map((item) => item.rank),
  [1, 2, 2, 4]
);
assert.match(leftPanelSource, /const AMEDAS_RANKING_LIMIT = 100;/);
assert.match(
  leftPanelSource,
  /buildAmedasRankingItems\(state\.data, metric, order, rankingView, windKind, precipitationPeriod\.id\)/
);
assert.match(
  leftPanelSource,
  /getAmedasObservationColor\(metric\.id, item\.value, precipitationPeriodId\)/
);
assert.doesNotMatch(leftPanelSource, /function getAmedasLevelColor\(/);

console.log("AMeDAS ranking tests passed");
