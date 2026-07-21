import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [appSource, distributionClientSource, iosModelSource] = await Promise.all([
  fs.readFile(path.join(root, "src", "app.js"), "utf8"),
  fs.readFile(path.join(root, "src", "jma", "hypocenterDistribution.js"), "utf8"),
  fs.readFile(path.join(root, "ios", "MeteoScope", "State", "WeatherAppModel.swift"), "utf8")
]);
assert.match(
  appSource,
  /earthquakeView === "distribution"[\s\S]*refreshEarthquakeDistribution\(\{ force \}\)/u,
  "Web版の自動更新で震央分布も更新する"
);
assert.match(distributionClientSource, /ttlMs: options\.force \? 0/u);
assert.match(distributionClientSource, /cache: options\.force \? "no-store"/u);
assert.match(
  iosModelSource,
  /earthquakeDisplayMode == \.distribution[\s\S]*refreshHypocenterDistribution\(\)/u,
  "iOS版の自動更新で震央分布も更新する"
);

console.log("Hypocenter date wheel tests passed.");
