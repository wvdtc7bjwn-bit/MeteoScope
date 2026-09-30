import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { onRequestGet } from "../functions/api/earthquake-history.js";

const projectRoot = path.resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(path.join(projectRoot, "public", "data", "earthquake-history", "manifest.json"), "utf8"));
const originalFetch = globalThis.fetch;
let outboundUrl = "";
let outboundForm = null;
globalThis.fetch = async (url, init) => {
  outboundUrl = String(url);
  outboundForm = init.body;
  return Response.json({
    res: [{ id: "20260928100000123", ot: "2026/09/28 10:00", name: "東京都２３区", lat: "35.7", lon: "139.7", mag: "3.1", dep: "10 km", maxI: "震度１" }]
  });
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
