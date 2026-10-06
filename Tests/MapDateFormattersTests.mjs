import assert from "node:assert/strict";
import {
  formatCommunityReportTime,
  formatDistributionOriginTime,
  formatWorldForecastMapTime
} from "../src/map/dateFormatters.js";

const sampleTime = "2026-10-06T03:04:05Z";
const sampleDate = new Date(sampleTime);

assert.equal(
  formatCommunityReportTime(sampleTime),
  new Intl.DateTimeFormat("ja-JP", {
    month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
  }).format(sampleDate)
);
for (const includeYear of [false, true]) {
  assert.equal(
    formatDistributionOriginTime(sampleTime, includeYear),
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      ...(includeYear ? { year: "numeric" } : {}),
      month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).format(sampleDate)
  );
  assert.equal(
    formatWorldForecastMapTime(sampleTime, includeYear),
    new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      ...(includeYear ? { year: "numeric" } : {}),
      month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23"
    }).format(sampleDate)
  );
}

assert.equal(formatCommunityReportTime(Number.NaN), "時刻不明");
assert.equal(formatDistributionOriginTime(Number.NaN), "NaN");
assert.equal(formatDistributionOriginTime(undefined), "時刻不明");
assert.equal(formatWorldForecastMapTime(Number.NaN), "時刻未取得");

console.log("Map date formatter tests passed.");
