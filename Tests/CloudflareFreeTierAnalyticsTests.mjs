import assert from "node:assert/strict";

import {
  CLOUDFLARE_FREE_TIER_LIMITS,
  EARTHQUAKE_D1_STORAGE_THRESHOLDS,
  classifyEarthquakeD1Storage,
  readCloudflareFreeTierUsage
} from "../functions/_shared/cloudflareFreeTierAnalytics.js";

const now = new Date("2026-07-19T03:30:00.000Z");
const calls = [];
const fetchImpl = async (url, options = {}) => {
  calls.push({ url: String(url), authorization: options.headers?.Authorization });
  if (!String(url).endsWith("/graphql")) {
    return Response.json({
      success: true,
      result: [
        { name: "meteoscope-notifications", file_size: 1_200_128 },
        { name: "meteoscope-earthquakes", file_size: 3_969_024 }
      ],
      result_info: { total_pages: 1 }
    });
  }

  const body = JSON.parse(options.body);
  assert.equal(body.variables.accountTag, "account-id");
  if (body.query.includes("workersInvocationsAdaptive")) {
    assert.equal(body.variables.start, "2026-07-19T00:00:00.000Z");
    return graphqlResponse("workersInvocationsAdaptive", [
      {
        dimensions: { scriptName: "meteoscope-warning-push-cron", status: "exceededResources" },
        sum: { requests: 3_000, errors: 2, subrequests: 50 }
      },
      {
        dimensions: { scriptName: "meteoscope", status: "internalError" },
        sum: { requests: 1_065, errors: 1, subrequests: 14 }
      }
    ]);
  }
  if (body.query.includes("durableObjectsInvocationsAdaptiveGroups")) {
    return graphqlResponse("durableObjectsInvocationsAdaptiveGroups", [
      { sum: { requests: 5_367 } }
    ]);
  }
  if (body.query.includes("durableObjectsPeriodicGroups")) {
    return graphqlResponse("durableObjectsPeriodicGroups", [
      { sum: { duration: 11_027.790750464, fatalInternalErrors: 10 } }
    ]);
  }
  if (body.query.includes("d1AnalyticsAdaptiveGroups")) {
    return graphqlResponse("d1AnalyticsAdaptiveGroups", [
      { sum: { rowsRead: 320_000, rowsWritten: 11_000 } },
      { sum: { rowsRead: 3_528, rowsWritten: 291 } }
    ]);
  }
  throw new Error("unexpected GraphQL query");
};

const usage = await readCloudflareFreeTierUsage({
  CLOUDFLARE_ACCOUNT_ID: "account-id",
  CLOUDFLARE_ANALYTICS_API_TOKEN: "analytics-secret"
}, { now, fetchImpl });

assert.equal(usage.configured, true);
assert.equal(usage.available, true);
assert.equal(usage.partial, false);
assert.equal(usage.period.dateUtc, "2026-07-19");
assert.equal(usage.period.resetTimeJst, "09:00");
assert.equal(usage.workers.requests, 4_065);
assert.equal(usage.workers.errors, 3);
assert.deepEqual(usage.workers.errorBreakdown.byStatus, [
  { status: "exceededResources", errors: 2 },
  { status: "internalError", errors: 1 }
]);
assert.deepEqual(usage.workers.errorBreakdown.byScript, [
  { scriptName: "meteoscope-warning-push-cron", errors: 2 },
  { scriptName: "meteoscope", errors: 1 }
]);
assert.equal(usage.durableObjects.requests, 5_367);
assert.equal(usage.durableObjects.durationGbSeconds, 11_027.790750464);
assert.equal(usage.durableObjects.fatalInternalErrors, 10);
assert.equal(usage.d1.rowsRead, 323_528);
assert.equal(usage.d1.rowsWritten, 11_291);
assert.equal(usage.d1.storageBytes, 5_169_152);
assert.equal(usage.d1.databaseCount, 2);
assert.deepEqual(usage.d1.largestDatabase, {
  name: "meteoscope-earthquakes",
  storageBytes: 3_969_024
});
assert.deepEqual(usage.d1.earthquakeDatabase, {
  name: "meteoscope-earthquakes",
  storageBytes: 3_969_024
});
assert.equal(usage.d1.earthquakeStorageStatus.level, "ok");
assert.equal(classifyEarthquakeD1Storage(99_999_999).level, "ok");
assert.equal(classifyEarthquakeD1Storage(100_000_000).level, "notice");
assert.equal(classifyEarthquakeD1Storage(200_000_000).level, "warning");
assert.equal(classifyEarthquakeD1Storage(350_000_000).level, "danger");
assert.deepEqual(EARTHQUAKE_D1_STORAGE_THRESHOLDS, {
  noticeBytes: 100_000_000,
  warningBytes: 200_000_000,
  dangerBytes: 350_000_000
});
assert.deepEqual(usage.limits, CLOUDFLARE_FREE_TIER_LIMITS);
assert.equal(calls.length, 5);
assert.equal(calls.every((call) => call.authorization === "Bearer analytics-secret"), true);
assert.equal(JSON.stringify(usage).includes("analytics-secret"), false);

let unconfiguredFetches = 0;
const unconfigured = await readCloudflareFreeTierUsage({}, {
  now,
  fetchImpl: async () => {
    unconfiguredFetches += 1;
    throw new Error("must not fetch");
  }
});
assert.equal(unconfigured.configured, false);
assert.equal(unconfigured.available, false);
assert.equal(unconfiguredFetches, 0);

const partial = await readCloudflareFreeTierUsage({
  CLOUDFLARE_ACCOUNT_ID: "account-id",
  CLOUDFLARE_ANALYTICS_API_TOKEN: "analytics-secret"
}, {
  now,
  fetchImpl: async (url, options = {}) => {
    if (!String(url).endsWith("/graphql")) {
      return Response.json({ success: true, result: [], result_info: { total_pages: 1 } });
    }
    const body = JSON.parse(options.body);
    if (body.query.includes("durableObjectsPeriodicGroups")) {
      return Response.json({ errors: [{ message: "not available" }] }, { status: 400 });
    }
    const field = body.query.includes("workersInvocationsAdaptive")
      ? "workersInvocationsAdaptive"
      : body.query.includes("durableObjectsInvocationsAdaptiveGroups")
        ? "durableObjectsInvocationsAdaptiveGroups"
        : "d1AnalyticsAdaptiveGroups";
    return graphqlResponse(field, []);
  }
});
assert.equal(partial.available, true);
assert.equal(partial.partial, true);
assert.equal(partial.durableObjects.partial, true);
assert.equal(partial.durableObjects.durationGbSeconds, null);

console.log("Cloudflare free-tier analytics tests passed.");

function graphqlResponse(field, groups) {
  return Response.json({
    data: {
      viewer: {
        accounts: [{ [field]: groups }]
      }
    }
  });
}
