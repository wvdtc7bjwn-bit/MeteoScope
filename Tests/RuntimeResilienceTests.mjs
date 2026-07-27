import assert from "node:assert/strict";
import { fetchJson } from "../src/jma/jmaClient.js";

const originalFetch = globalThis.fetch;

try {
  let retryCalls = 0;
  globalThis.fetch = async () => {
    retryCalls += 1;
    if (retryCalls === 1) return new Response("temporary", { status: 503 });
    return Response.json({ ok: true });
  };
  const retryResult = await fetchJson("https://example.test/retry", {
    ttlMs: 0,
    retryCount: 1,
    timeoutMs: 1000
  });
  assert.deepEqual(retryResult, { ok: true });
  assert.equal(retryCalls, 2);

  let staleCalls = 0;
  globalThis.fetch = async () => {
    staleCalls += 1;
    if (staleCalls === 1) return Response.json({ value: "cached" });
    throw new TypeError("network unavailable");
  };
  const staleUrl = "https://example.test/stale";
  await fetchJson(staleUrl, { ttlMs: 1, retryCount: 0 });
  await new Promise((resolve) => setTimeout(resolve, 5));
  const staleResult = await fetchJson(staleUrl, { ttlMs: 1, retryCount: 0 });
  assert.deepEqual(staleResult, { value: "cached" });

  globalThis.fetch = async () => Response.json({ records: null });
  await assert.rejects(
    fetchJson("https://example.test/invalid", {
      ttlMs: 0,
      retryCount: 0,
      validate: (value) => Array.isArray(value?.records)
    }),
    /response validation failed/
  );

  globalThis.fetch = async (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener("abort", () => reject(options.signal.reason), { once: true });
  });
  await assert.rejects(
    fetchJson("https://example.test/timeout", {
      ttlMs: 0,
      retryCount: 0,
      timeoutMs: 10
    }),
    (error) => error?.name === "TimeoutError"
  );
} finally {
  globalThis.fetch = originalFetch;
}

console.log("Runtime resilience tests passed");
