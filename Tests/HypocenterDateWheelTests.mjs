import assert from "node:assert/strict";
import {
  findHypocenterDateOffset,
  normalizeHypocenterDates
} from "../src/ui/hypocenterDateWheel.js";

const dates = [
  "2026-07-17",
  "invalid",
  "2026-07-19",
  "2026-07-17",
  "2026-07-16"
];

assert.deepEqual(
  normalizeHypocenterDates(dates),
  ["2026-07-19", "2026-07-17", "2026-07-16"],
  "日付は重複と不正値を除き、新しい順に並ぶ"
);
assert.equal(findHypocenterDateOffset(dates, "2026-07-17"), 1, "保存済み日付を正確に選ぶ");
assert.equal(findHypocenterDateOffset(dates, "2026-07-18"), 1, "欠落日は直前の保存済み日付を選ぶ");
assert.equal(findHypocenterDateOffset(dates, "2026-08-01"), 0, "未来日は最新日に丸める");
assert.equal(findHypocenterDateOffset(dates, "2025-01-01"), 2, "保存範囲より古い日は最古日に丸める");

console.log("Hypocenter date wheel tests passed.");
