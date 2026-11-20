import assert from "node:assert/strict";
import { onRequestGet } from "../functions/api/earthquake-history-event.js";
import { readFile } from "node:fs/promises";
const catalogue = await readFile(new URL("./fixtures/long-period-history-catalog.html", import.meta.url), "utf8");
const csv = await readFile(new URL("./fixtures/long-period-noto-level.csv", import.meta.url));

const originalFetch = globalThis.fetch;
const originalCaches = globalThis.caches;
const cache = new Map();
let requests = 0;
let body = null;
globalThis.caches = { default: {
  match: async (key) => cache.get(key.url)?.clone(),
  put: async (key, response) => { cache.set(key.url, response.clone()); }
} };
globalThis.fetch = async (_url, init) => {
  requests += 1;
  if (String(_url).endsWith("past_list.html")) return new Response(catalogue);
  if (String(_url).endsWith("level.csv")) return new Response(csv);
  body = init.body;
  return Response.json({ res: {
    hyp: [{ id: "20240101161022", ot: "2024/01/01 16:10:22.0", name: "石川県能登地方", lat: "37.5", lon: "137.3", dep: "16 km", mag: "7.6", maxI: "震度７" }],
    int: [{ name: "志賀町富来＊", lat: "37.0", lon: "136.7", code: "A01", int: "震度７", char: "7" }]
  } });
};
try {
  const call = async () => {
    const writes = [];
    const response = await onRequestGet({
      request: new Request("https://meteoscope.test/api/earthquake-history-event?id=20240101161022"),
      waitUntil: (promise) => writes.push(promise)
    });
    await Promise.all(writes);
    return response;
  };
  const first = await call();
  assert.equal(first.status, 200);
  const payload = await first.json();
  assert.equal(payload.event.hypocenter.lat, "37.5");
  assert.equal(payload.event.stations[0].code, "A01");
  assert.equal(payload.event.longPeriod.maxClass, 4);
  assert.equal(payload.event.longPeriod.eventId, "20240101161010", "The long-period ID differs from the intensity archive ID");
  assert.equal(body.get("mode"), "event");
  assert.equal(body.get("id"), "20240101161022");
  await call();
  assert.equal(requests, 3, "同じイベント詳細はエッジキャッシュする");
  const millisecondId = await onRequestGet({
    request: new Request("https://meteoscope.test/api/earthquake-history-event?id=20240101161022005")
  });
  assert.equal(millisecondId.status, 200);
  assert.equal(body.get("id"), "20240101161022", "JMA query uses second-resolution ID for archive IDs with milliseconds");
  assert.equal(requests, 3, "14-digit and millisecond archive IDs share the event cache");
  const invalid = await onRequestGet({ request: new Request("https://meteoscope.test/api/earthquake-history-event?id=2024x") });
  assert.equal(invalid.status, 400);
  assert.equal(requests, 3, "不正な地震IDでは気象庁へ送信しない");
  cache.clear();
  const workingFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => String(url).endsWith("past_list.html")
    ? new Response("temporarily unavailable", { status: 503 }) : workingFetch(url, init);
  const partial = await call();
  const partialPayload = await partial.json();
  assert.equal(partial.status, 200, "Long-period source failure must not fail the ordinary event detail");
  assert.equal(partialPayload.event.stations[0].code, "A01");
  assert.equal(partialPayload.event.longPeriodStatus, "unavailable");
  assert.match(partial.headers.get("cache-control"), /s-maxage=60$/, "Retry supplementary observations without caching the failure for a full day");
} finally {
  globalThis.fetch = originalFetch;
  globalThis.caches = originalCaches;
}
console.log("Earthquake history event proxy tests passed.");
