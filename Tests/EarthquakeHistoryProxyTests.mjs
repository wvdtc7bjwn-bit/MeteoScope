import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { onRequestGet } from "../functions/api/earthquake-history.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(path.join(projectRoot, "public", "data", "earthquake-history", "manifest.json"), "utf8"));
const originalFetch = globalThis.fetch;
let outboundUrl = "";
let outboundForm = null;
let jmaResult = [{ id: "20260928100000123", ot: "2026/09/28 10:00", name: "東京都２３区", lat: "35.7", lon: "139.7", mag: "3.1", dep: "10 km", maxI: "震度１" }];
let denseRangeMode = false;
let denseDayMode = false;
let upstreamQueryCount = 0;
globalThis.fetch = async (url, init) => {
  outboundUrl = String(url);
  outboundForm = init.body;
  if (denseRangeMode) {
    upstreamQueryCount += 1;
    const start = Date.parse(`${outboundForm.getAll("dateTimeF[]")[0]}T00:00:00Z`);
    const end = Date.parse(`${outboundForm.getAll("dateTimeT[]")[0]}T00:00:00Z`);
    const days = Math.floor((end - start) / 86_400_000) + 1;
    return Response.json({ res: Array.from({ length: days > 30 ? 1_000 : 500 }, () => ({})) });
  }
  if (denseDayMode) {
    upstreamQueryCount += 1;
    const startDate = outboundForm.getAll("dateTimeF[]")[0];
    const startTime = outboundForm.getAll("dateTimeF[]")[1];
    const endDate = outboundForm.getAll("dateTimeT[]")[0];
    const endTime = outboundForm.getAll("dateTimeT[]")[1];
    const start = Date.parse(`${startDate}T${startTime}:00Z`);
    const end = Date.parse(`${endDate}T${endTime}:00Z`);
    const minutes = Math.floor((end - start) / 60_000) + 1;
    return Response.json({ res: Array.from({ length: minutes > 120 ? 1_000 : 500 }, () => ({})) });
  }
  return Response.json({ res: jmaResult });
};

try {
  const response = await onRequestGet({
    request: new Request(`https://meteoscope.test/api/earthquake-history?start=2026-09-28&end=${manifest.endDate}`),
    waitUntil: (promise) => promise
  });
  assert.equal(response.status, 200);
  assert.match(outboundUrl, /^https:\/\/www\.data\.jma\.go\.jp\/eqdb\/data\/shindo\/api\/$/u);
  assert.equal(outboundForm.get("mode"), "search");
  assert.equal(outboundForm.getAll("dateTimeF[]")[0], "2026-09-28");
  assert.equal(outboundForm.getAll("dateTimeT[]")[0], manifest.endDate);
  assert.equal((await response.json()).records.length, 1);
  assert.match(response.headers.get("cache-control"), /s-maxage=/u);

  jmaResult = "検索結果地震数：ありませんでした";
  const emptyYear = await onRequestGet({
    request: new Request("https://meteoscope.test/api/earthquake-history?start=1950-01-01&end=1950-12-31")
  });
  assert.equal(emptyYear.status, 200, "地震がない年は接続エラーではなく空の検索結果として返す");
  assert.deepEqual((await emptyYear.json()).records, []);
  jmaResult = [{ id: "20260928100000123", ot: "2026/09/28 10:00", name: "東京都２３区", lat: "35.7", lon: "139.7", mag: "3.1", dep: "10 km", maxI: "震度１" }];

  denseRangeMode = true;
  const denseYear = await onRequestGet({
    request: new Request("https://meteoscope.test/api/earthquake-history?start=2020-01-01&end=2020-12-31")
  });
  const denseYearPayload = await denseYear.json();
  assert.equal(denseYear.status, 200, "件数の多い年はCloudflareの外部リクエスト上限内で分割して取得する");
  assert.ok(upstreamQueryCount > 20 && upstreamQueryCount <= 48, "密な年の分割は20回を超えてもFree枠内に収める");
  assert.ok(denseYearPayload.records.length > 1_000);
  denseRangeMode = false;

  denseDayMode = true;
  upstreamQueryCount = 0;
  const denseDay = await onRequestGet({
    request: new Request("https://meteoscope.test/api/earthquake-history?start=2016-04-16&end=2016-04-16")
  });
  const denseDayPayload = await denseDay.json();
  assert.equal(denseDay.status, 200, "1日だけで1000件に達する場合も時刻で分割して取得する");
  assert.ok(upstreamQueryCount > 1 && upstreamQueryCount <= 48, "1日の時刻分割も無料枠内で完了する");
  assert.ok(denseDayPayload.records.length > 1_000);
  denseDayMode = false;

  const oversizedRange = await onRequestGet({
    request: new Request("https://meteoscope.test/api/earthquake-history?start=2020-01-01&end=2022-01-01")
  });
  assert.equal(oversizedRange.status, 400, "1年超のリクエストは分割を強制する");

  const invalidDate = await onRequestGet({
    request: new Request("https://meteoscope.test/api/earthquake-history?start=1918-12-31&end=1919-01-01")
  });
  assert.equal(invalidDate.status, 400, "1919年より前は拒否する");
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Earthquake history proxy tests passed.");
