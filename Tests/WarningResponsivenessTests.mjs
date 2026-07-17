import assert from "node:assert/strict";
import { normalizeRiverWarningText, resolveRiverFloodLevel } from "../src/jma/riverFlood.js";
import { buildWarningLevelMap, planWarningFeatureStateChanges } from "../src/map/warningFeatureState.js";
import { chunkItems } from "../src/scheduling.js";

assert.equal(
  normalizeRiverWarningText("【警戒レベル３相当情報】袋川では、今後、氾濫危険水位に到達する見込み"),
  "【警戒レベル３相当情報】袋川では、今後、氾濫危険水位に到達する見込み"
);
assert.equal(
  normalizeRiverWarningText("【警戒レベル３相当】千歳橋基準観測所［洪水］ 受け持ち区間"),
  "【警戒レベル３相当】千歳橋基準観測所 受け持ち区間"
);
assert.equal(resolveRiverFloodLevel({
  condition: "レベル３氾濫警報（発表）",
  kindNames: ["氾濫警戒情報"],
  title: "指定河川洪水予報"
}), 3);
assert.equal(resolveRiverFloodLevel({
  kindNames: ["氾濫危険情報"],
  title: "指定河川洪水予報"
}), 4);

const officeCodes = Array.from({ length: 58 }, (_, index) => String(index + 1));
const officeCodeBatches = chunkItems(officeCodes, 8);
assert.deepEqual(officeCodeBatches.map((batch) => batch.length), [8, 8, 8, 8, 8, 8, 8, 2]);
assert.deepEqual(officeCodeBatches.flat(), officeCodes);

const levels = buildWarningLevelMap([
  { areaCode: "0110100", level: "advisory" },
  { areaCode: "0110200", level: "warning" },
  { areaCode: "", level: "warning" },
  { areaCode: "0110100", level: "danger" }
]);
assert.deepEqual([...levels], [
  ["0110100", "danger"],
  ["0110200", "warning"]
]);

const currentLevels = new Map([
  ["0110100", "advisory"],
  ["0110200", "warning"],
  ["0120200", "emergency"]
]);
const plan = planWarningFeatureStateChanges(currentLevels, [
  { areaCode: "0110100", level: "danger" },
  { areaCode: "0110200", level: "warning" },
  { areaCode: "0130300", level: "advisory" }
]);
assert.deepEqual(plan.operations, [
  { type: "remove", areaCode: "0120200" },
  { type: "set", areaCode: "0110100", level: "danger" },
  { type: "set", areaCode: "0130300", level: "advisory" }
]);

const unchanged = planWarningFeatureStateChanges(plan.desiredLevels, [
  { areaCode: "0110100", level: "danger" },
  { areaCode: "0110200", level: "warning" },
  { areaCode: "0130300", level: "advisory" }
]);
assert.deepEqual(unchanged.operations, []);

console.log("Warning responsiveness tests passed");
