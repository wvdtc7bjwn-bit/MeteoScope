import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  isPublicReadMethod,
  resolvePublicEarthquakeRoute
} from "../workers/earthquake-realtime/src/routePolicy.js";
import {
  buildJmaIntensityStationCoordinateLookup,
  findJmaIntensityStationCoordinate,
  isJmaIntensityStationCode,
  normalizeJmaIntensityStationCode,
  preserveJmaEarthquakeDetails,
  sanitizeJmaIntensityStationPoints
} from "../workers/earthquake-realtime/src/earthquakeStationPolicy.js";
import {
  mapD1EarthquakeRow,
  mapD1TsunamiRow
} from "../workers/earthquake-realtime/src/d1ReadFallback.js";
import {
  buildGdBackfillDates,
  getJstDateString
} from "../workers/earthquake-realtime/src/scheduledBackfillPolicy.js";
import { collectDmdataIntensityRegions } from "../workers/earthquake-realtime/src/earthquakeRegionPolicy.js";
import {
  cleanupExpiredD1EarthquakeData,
  EARTHQUAKE_D1_RETENTION,
  TSUNAMI_D1_RETENTION
} from "../workers/earthquake-realtime/src/retentionPolicy.js";
import {
  buildJmaDailyPayload,
  JMA_DAILY_BACKFILL_DAYS_PER_SYNC,
  JMA_DAILY_MAX_DAY_OFFSET,
  JMA_DAILY_RETENTION_DAYS,
  parseJmaDailyHypocenterHtml,
  readJmaDailyHypocenterDistribution,
  selectJmaDailySyncDates,
  syncJmaDailyHypocenters,
  shouldAttemptDate
} from "../workers/earthquake-realtime/src/jmaDailyHypocenters.js";

assert.deepEqual(EARTHQUAKE_D1_RETENTION, {
  label: "1 month",
  sqliteModifier: "-1 month"
});
assert.deepEqual(TSUNAMI_D1_RETENTION, {
  label: "90 days",
  sqliteModifier: "-90 days"
});

const retentionDeletes = [];
const retentionResult = await cleanupExpiredD1EarthquakeData({
  prepare(sql) {
    return {
      bind(...params) {
        return {
          async run() {
            retentionDeletes.push({ sql, params });
            return { meta: { changes: retentionDeletes.length } };
          }
        };
      }
    };
  }
});
assert.deepEqual(
  retentionDeletes.map(({ params }) => params),
  [["-1 month"], ["-1 month"], ["-1 month"], ["-90 days"]]
);
assert.match(retentionDeletes[0].sql, /DELETE FROM station_intensities/u);
assert.match(retentionDeletes[0].sql, /FROM earthquake_history/u);
assert.match(retentionDeletes[0].sql, /<= datetime\('now', \?\)/u);
assert.match(retentionDeletes[1].sql, /DELETE FROM station_intensities/u);
assert.match(retentionDeletes[1].sql, /<= datetime\('now', \?\)/u);
assert.match(retentionDeletes[2].sql, /DELETE FROM earthquake_history/u);
assert.match(retentionDeletes[2].sql, /<= datetime\('now', \?\)/u);
assert.match(retentionDeletes[3].sql, /DELETE FROM tsunami_history/u);
assert.deepEqual(retentionResult, {
  earthquakeHistoryRetention: "1 month",
  stationIntensityRetention: "1 month",
  tsunamiHistoryRetention: "90 days",
  deleted: {
    stationByEarthquake: 1,
    stationByUpdatedAt: 2,
    earthquakeHistory: 3,
    tsunamiHistory: 4
  }
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagesProxyUrl = pathToFileURL(
  path.join(root, "functions", "api", "earthquakes", "[[path]].js")
);
const { onRequest } = await import(pagesProxyUrl.href);

assert.deepEqual(
  resolvePublicEarthquakeRoute(new URL("https://example.test/api/latest")),
  { internalPath: "/latest", cacheSeconds: 0 }
);
assert.deepEqual(
  resolvePublicEarthquakeRoute(new URL("https://example.test/api/stream")),
  { internalPath: "/connect", cacheSeconds: 0, websocket: true }
);
assert.deepEqual(
  resolvePublicEarthquakeRoute(
    new URL("https://example.test/api/earthquakes/latest")
  ),
  { internalPath: "/latest", cacheSeconds: 0 }
);
assert.deepEqual(
  resolvePublicEarthquakeRoute(new URL("https://example.test/api/history?limit=11")),
  { internalPath: "/history?limit=11", cacheSeconds: 15 }
);
assert.deepEqual(
  resolvePublicEarthquakeRoute(
    new URL("https://example.test/api/earthquakes/distribution?dayOffset=29&minMagnitude=1&maxDepth=100")
  ),
  { internalPath: "/distribution", cacheSeconds: 300, directD1: true }
);
assert.equal(
  resolvePublicEarthquakeRoute(new URL("https://example.test/api/distribution?dayOffset=30")).error,
  "invalid_day_offset"
);
assert.equal(
  resolvePublicEarthquakeRoute(new URL("https://example.test/api/distribution?dayOffset=-1")).error,
  "invalid_day_offset"
);
assert.equal(
  resolvePublicEarthquakeRoute(new URL("https://example.test/api/history?limit=101")).error,
  "invalid_limit"
);
assert.equal(
  resolvePublicEarthquakeRoute(new URL("https://example.test/api/history?limit=1.5")).error,
  "invalid_limit"
);
assert.equal(
  resolvePublicEarthquakeRoute(
    new URL("https://example.test/api/history/%2E%2E%2Fingest/stations")
  ).error,
  "invalid_event_id"
);
assert.deepEqual(
  resolvePublicEarthquakeRoute(
    new URL("https://example.test/api/history/20260715052500/stations")
  ),
  {
    internalPath: "/history/20260715052500/stations",
    cacheSeconds: 24 * 60 * 60
  }
);
assert.equal(isPublicReadMethod("GET"), true);
assert.equal(isPublicReadMethod("HEAD"), true);
assert.equal(isPublicReadMethod("POST"), false);
assert.equal(isJmaIntensityStationCode("0320224"), true);
assert.equal(isJmaIntensityStationCode("17"), false);
assert.equal(isJmaIntensityStationCode("391"), false);
assert.equal(isJmaIntensityStationCode("cf-0"), false);
assert.equal(normalizeJmaIntensityStationCode(" 0320224 "), "0320224");
assert.deepEqual(
  collectDmdataIntensityRegions({
    prefectures: [{
      code: "12",
      name: "千葉県",
      regions: [
        { code: "340", name: "千葉県北東部", maxInt: "2" },
        { code: "341", name: "千葉県北西部", maxInt: "1" }
      ]
    }, {
      code: "08",
      name: "茨城県",
      regions: [{ code: "301", name: "茨城県南部", maxInt: "1" }]
    }]
  }),
  [
    { code: "340", name: "千葉県北東部", maxInt: "2" },
    { code: "341", name: "千葉県北西部", maxInt: "1" },
    { code: "301", name: "茨城県南部", maxInt: "1" }
  ]
);

assert.deepEqual(
  mapD1EarthquakeRow({
    event_id: "20260716012301",
    place: "石川県加賀地方",
    max_scale: 20,
    regions_json: '[{"code":"390","name":"石川県加賀","maxInt":"2"}]'
  }).regions,
  [{ code: "390", name: "石川県加賀", maxInt: "2" }]
);
assert.equal(mapD1EarthquakeRow({ max_scale: null }).max_scale, 0);
assert.equal(mapD1TsunamiRow({ event_id: "x", revoked: 1 }), null);
assert.deepEqual(
  mapD1TsunamiRow({
    event_id: "20260716012301",
    revoked: 0,
    areas_json: '[{"code":"100","kind":"津波注意報"}]',
    observations_json: "[]",
    estimations_json: "[]"
  }).areas,
  [{ code: "100", kind: "津波注意報" }]
);

const arrayCoordinateLookup = buildJmaIntensityStationCoordinateLookup([
  { name: "石狩市花川", latitude: 43.17, longitude: 141.32 },
  { name: "札幌南区石山", latitude: 42.97, longitude: 141.33 }
]);
assert.equal(
  findJmaIntensityStationCoordinate(arrayCoordinateLookup, {
    code: "1",
    name: "石川県"
  }),
  null
);
assert.deepEqual(
  findJmaIntensityStationCoordinate(arrayCoordinateLookup, {
    code: "0120221",
    name: "札幌南区石山"
  }),
  { latitude: 42.97, longitude: 141.33 }
);

const dmdataParameterLookup = buildJmaIntensityStationCoordinateLookup([{
  code: "1720130",
  name: "金沢市西念",
  latitude: 36.5881,
  longitude: 136.6331,
  status: "廃止"
}, {
  code: "1720130",
  name: "金沢市西念",
  latitude: 36.5872,
  longitude: 136.6336,
  status: "現"
}]);
assert.deepEqual(
  findJmaIntensityStationCoordinate(dmdataParameterLookup, {
    code: "1720130",
    name: "金沢市西念"
  }),
  { latitude: 36.5872, longitude: 136.6336 }
);
assert.deepEqual(
  sanitizeJmaIntensityStationPoints({
    eventId: "20260716012301",
    points: [
      { code: "17", name: "石川県" },
      { code: "391", name: "石川県加賀" },
      { code: "1720130", name: "金沢市西念" }
    ]
  }).points,
  [{ code: "1720130", name: "金沢市西念" }]
);
assert.deepEqual(
  preserveJmaEarthquakeDetails(
    {
      eventId: "20260716012301",
      points: [{ code: "1721020", name: "白山市別宮町＊" }],
      regions: [
        { code: "390", name: "石川県加賀", maxInt: "2" },
        { code: "391", name: "石川県能登", maxInt: "1" }
      ]
    },
    {
      eventId: "20260716012301",
      points: [],
      magnitude: "3.0",
      regions: [{ code: "390", name: "石川県加賀", maxInt: "2" }]
    }
  ),
  {
    eventId: "20260716012301",
    points: [{ code: "1721020", name: "白山市別宮町＊" }],
    magnitude: "3.0",
    regions: [
      { code: "390", name: "石川県加賀", maxInt: "2" },
      { code: "391", name: "石川県能登", maxInt: "1" }
    ]
  }
);
assert.deepEqual(
  preserveJmaEarthquakeDetails(
    { eventId: "old", points: [{ code: "1721020" }] },
    { eventId: "new", points: [] }
  ).points,
  []
);

const scheduledAt = Date.parse("2026-07-16T00:05:00Z");
assert.equal(getJstDateString(0, scheduledAt), "2026-07-16");
assert.deepEqual(
  buildGdBackfillDates(scheduledAt, null),
  ["2026-07-15", "2026-07-16"]
);
assert.deepEqual(
  buildGdBackfillDates(scheduledAt, "2026-07-16T00:01:00Z"),
  ["2026-07-16"]
);

const parsedDailyHypocenters = parseJmaDailyHypocenterHtml(`
  <html><body><pre>
年   月 日 時 分 秒    緯度       経度       深さ(km)  Ｍ   震央地名
2026  7 17 00:04 36.9  35°31.6'N 136°22.8'E   13     0.1  滋賀県北部
2026  7 17 12:30 05.0  36°00.0'N 140°30.0'E   -      -    茨城県南部
  </pre></body></html>
`, "2026-07-17");
assert.equal(parsedDailyHypocenters.length, 2);
assert.equal(parsedDailyHypocenters[0].originTime, "2026-07-17T00:04:36.900+09:00");
assert.equal(parsedDailyHypocenters[0].depthKm, 13);
assert.equal(parsedDailyHypocenters[0].magnitude, 0.1);
assert.equal(parsedDailyHypocenters[1].depthKm, null);
assert.equal(parsedDailyHypocenters[1].magnitude, null);
const dailyPayload = buildJmaDailyPayload(parsedDailyHypocenters);
assert.equal(JSON.parse(dailyPayload.json).length, 2);
assert.ok(dailyPayload.bytes > 0 && dailyPayload.bytes < 1_500_000);
const storedPayloads = new Map([
  ["2026-07-17", dailyPayload.json],
  ["2026-07-16", JSON.stringify([{
    ...parsedDailyHypocenters[0],
    id: "previous-day",
    sourceDate: "2026-07-16",
    originTime: "2026-07-16T18:00:00+09:00",
    place: "前日の震源"
  }])]
]);
const distributionResponse = await readJmaDailyHypocenterDistribution(
  new Request("https://example.test/api/distribution?dayOffset=1"),
  {
    EQ_D1: {
      prepare(sql) {
        return {
          bind(...params) {
            return {
              async all() {
                assert.match(sql, /SELECT daily\.source_date/u);
                return { results: [
                  { source_date: "2026-07-17", record_count: 2 },
                  { source_date: "2026-07-16", record_count: 1 }
                ] };
              },
              async first() {
                if (/SELECT payload_json/u.test(sql)) {
                  return { payload_json: storedPayloads.get(params[0]) };
                }
                return {
                  latest_source_date: "2026-07-17",
                  last_successful_fetch_at: "2026-07-18T01:17:00Z",
                  failed_dates: 0
                };
              }
            };
          }
        };
      }
    }
  }
);
const selectedDistribution = await distributionResponse.json();
assert.deepEqual(selectedDistribution.availableDates, ["2026-07-17", "2026-07-16"]);
assert.deepEqual(selectedDistribution.dailyCounts, [
  { sourceDate: "2026-07-17", count: 2 },
  { sourceDate: "2026-07-16", count: 1 }
]);
assert.equal(selectedDistribution.selectedSourceDate, "2026-07-16");
assert.equal(selectedDistribution.dayOffset, 1);
assert.equal(selectedDistribution.retentionDays, 30);
assert.deepEqual(selectedDistribution.items.map((item) => item.place), ["前日の震源"]);
assert.throws(
  () => buildJmaDailyPayload(Array.from({ length: 5_001 }, () => parsedDailyHypocenters[0])),
  /jma_daily_record_limit_exceeded/u
);
assert.throws(
  () => buildJmaDailyPayload([{ ...parsedDailyHypocenters[0], place: "震".repeat(600_000) }]),
  /jma_daily_payload_too_large/u
);
const retryBase = Date.parse("2026-07-18T00:00:00Z");
assert.equal(shouldAttemptDate(undefined, retryBase), true);
assert.equal(shouldAttemptDate({ status: "ok", fetchedAt: "2026-07-17T00:00:00Z" }, retryBase), false);
assert.equal(shouldAttemptDate({ status: "error", fetchedAt: "2026-07-17T23:00:00Z" }, retryBase), false);
assert.equal(shouldAttemptDate({ status: "error", fetchedAt: "2026-07-17T17:59:59Z" }, retryBase), true);

let distributionPreparedStatements = 0;
let distributionBatchCalls = 0;
let distributionFetches = 0;
const distributionSyncDb = {
  prepare(sql) {
    distributionPreparedStatements += 1;
    return {
      sql,
      bind(...params) {
        return {
          sql,
          params,
          async all() {
            assert.match(sql, /SELECT source_date/u);
            return { results: [] };
          },
          async run() {
            return { success: true };
          }
        };
      }
    };
  },
  async batch() {
    distributionBatchCalls += 1;
    return [];
  }
};
const distributionSyncResult = await syncJmaDailyHypocenters(
  { EQ_D1: distributionSyncDb },
  {
    maxDays: JMA_DAILY_BACKFILL_DAYS_PER_SYNC,
    fetchImpl: async (url) => {
      distributionFetches += 1;
      const compactDate = String(url).match(/\/(\d{8})\.html$/u)?.[1];
      assert.ok(compactDate);
      const year = compactDate.slice(0, 4);
      const month = Number(compactDate.slice(4, 6));
      const day = Number(compactDate.slice(6, 8));
      return new Response(
        `<pre>${year} ${month} ${day} 00:00 00.0 35° 00.0'N 140° 00.0'E 10 1.0 テスト震源</pre>`,
        { status: 200, headers: { "content-type": "text/html" } }
      );
    }
  }
);
assert.equal(distributionSyncResult.attempted, 15);
assert.equal(distributionFetches, 15);
assert.equal(distributionBatchCalls, 16);
assert.deepEqual(distributionSyncResult.backfill, {
  complete: false,
  storedDayCount: 15,
  remainingDayCount: 15
});
assert.deepEqual(distributionSyncResult.cleanup, {
  deletedDays: 0,
  deletedSyncRows: 0
});
assert.ok(
  distributionPreparedStatements + distributionFetches <= 50,
  `free tier query budget exceeded: ${distributionPreparedStatements + distributionFetches}`
);

let completedBackfillFetches = 0;
const completedBackfillDb = {
  prepare(sql) {
    return {
      sql,
      bind(...params) {
        return {
          async all() {
            if (/FROM jma_daily_hypocenter_days/u.test(sql)) {
              return {
                results: Array.from({ length: 30 }, (_, index) => ({
                  source_date: new Date(Date.UTC(2099, 0, 30 - index)).toISOString().slice(0, 10)
                }))
              };
            }
            return {
              results: params.map((sourceDate) => ({
                source_date: sourceDate,
                status: "ok",
                fetched_at: "2026-07-19T00:00:00.000Z"
              }))
            };
          }
        };
      }
    };
  },
  async batch() {
    return [];
  }
};
const completedBackfillResult = await syncJmaDailyHypocenters(
  { EQ_D1: completedBackfillDb },
  {
    maxDays: JMA_DAILY_BACKFILL_DAYS_PER_SYNC,
    fetchImpl: async () => {
      completedBackfillFetches += 1;
      throw new Error("completed backfill must not fetch");
    }
  }
);
assert.equal(completedBackfillResult.attempted, 0);
assert.equal(completedBackfillFetches, 0);
assert.deepEqual(completedBackfillResult.backfill, {
  complete: true,
  storedDayCount: 30,
  remainingDayCount: 0
});
assert.deepEqual(
  selectJmaDailySyncDates(
    ["2026-07-19", "2026-07-18", "2026-07-17", "2026-07-16", "2026-07-15"],
    ["2026-07-17", "2026-07-16"]
  ),
  ["2026-07-19", "2026-07-18", "2026-07-15"]
);

let unavailableLatestFetches = 0;
let unavailableLatestBatchCalls = 0;
const retainedPublishedDates = Array.from({ length: 30 }, (_, index) => (
  new Date(Date.UTC(2026, 6, 17 - index)).toISOString().slice(0, 10)
));
const unavailableLatestDb = {
  prepare(sql) {
    return {
      bind(...params) {
        return {
          async all() {
            if (/FROM jma_daily_hypocenter_days/u.test(sql)) {
              return { results: retainedPublishedDates.map((sourceDate) => ({ source_date: sourceDate })) };
            }
            return { results: [] };
          },
          async run() {
            return { success: true, params };
          }
        };
      }
    };
  },
  async batch() {
    unavailableLatestBatchCalls += 1;
    return [];
  }
};
const unavailableLatestResult = await syncJmaDailyHypocenters(
  { EQ_D1: unavailableLatestDb },
  {
    now: Date.parse("2026-07-20T00:00:00.000Z"),
    maxDays: JMA_DAILY_BACKFILL_DAYS_PER_SYNC,
    fetchImpl: async () => {
      unavailableLatestFetches += 1;
      return new Response("not published", { status: 404 });
    }
  }
);
assert.equal(unavailableLatestFetches, 2);
assert.equal(unavailableLatestBatchCalls, 1);
assert.deepEqual(unavailableLatestResult.cleanup, {
  deletedDays: 0,
  deletedSyncRows: 0
});
assert.deepEqual(unavailableLatestResult.backfill, {
  complete: true,
  storedDayCount: 30,
  remainingDayCount: 0
});

let forwardedUrl = "";
const proxyResponse = await onRequest({
  request: new Request(
    "https://meteoscope.pages.dev/api/earthquakes/history?limit=7"
  ),
  env: {
    EARTHQUAKE_REALTIME: {
      async fetch(request) {
        forwardedUrl = request.url;
        return Response.json({ enabled: true, items: [] });
      }
    }
  }
});
assert.equal(proxyResponse.status, 200);
assert.equal(forwardedUrl, "https://earthquake-worker.internal/api/history?limit=7");
assert.equal(proxyResponse.headers.get("access-control-allow-origin"), "*");

let forwardedUpgrade = "";
const streamResponse = await onRequest({
  request: new Request(
    "https://meteoscope.pages.dev/api/earthquakes/stream",
    { headers: { upgrade: "websocket" } }
  ),
  env: {
    EARTHQUAKE_REALTIME: {
      async fetch(request) {
        forwardedUpgrade = request.headers.get("upgrade") ?? "";
        return new Response(null, { status: 200 });
      }
    }
  }
});
assert.equal(streamResponse.status, 200);
assert.equal(forwardedUpgrade, "websocket");

const unconfiguredResponse = await onRequest({
  request: new Request("https://meteoscope.pages.dev/api/earthquakes/health"),
  env: {}
});
assert.equal(unconfiguredResponse.status, 503);
assert.equal(
  (await unconfiguredResponse.json()).error,
  "earthquake_service_not_configured"
);

const disallowedMethodResponse = await onRequest({
  request: new Request("https://meteoscope.pages.dev/api/earthquakes/history", {
    method: "POST"
  }),
  env: {}
});
assert.equal(disallowedMethodResponse.status, 405);

const publicWorkerSource = await fs.readFile(
  path.join(root, "workers", "earthquake-realtime", "src", "index.js"),
  "utf8"
);
const jmaDailySource = await fs.readFile(
  path.join(root, "workers", "earthquake-realtime", "src", "jmaDailyHypocenters.js"),
  "utf8"
);
assert.doesNotMatch(publicWorkerSource, /\/ingest|\/auth|\/discord/);
assert.match(publicWorkerSource, /x-eew-authenticated/u);
assert.equal(JMA_DAILY_RETENTION_DAYS, 30);
assert.equal(JMA_DAILY_MAX_DAY_OFFSET, 29);
assert.equal(JMA_DAILY_BACKFILL_DAYS_PER_SYNC, 15);
assert.match(jmaDailySource, /LIMIT -1 OFFSET \?/u);
assert.match(jmaDailySource, /DELETE FROM jma_daily_hypocenter_days/u);
assert.match(jmaDailySource, /source_date < \(SELECT MIN\(source_date\)/u);
assert.match(jmaDailySource, /INSERT INTO jma_daily_hypocenter_days/u);
assert.match(jmaDailySource, /WHERE source_date = \? LIMIT 1/u);
assert.doesNotMatch(jmaDailySource, /INSERT INTO jma_daily_hypocenters/u);

const earthquakeHubSource = await fs.readFile(
  path.join(
    root,
    "workers",
    "earthquake-realtime",
    "src",
    "MeteoScopeEarthquakeHub.js"
  ),
  "utf8"
);
assert.match(
  earthquakeHubSource,
  /classifications:\s*\["telegram\.earthquake"\]/u
);
assert.doesNotMatch(
  earthquakeHubSource,
  /classifications:\s*\[[^\]]*"eew\.forecast"[^\]]*\]/u
);
assert.match(earthquakeHubSource, /protocol \|\| "dmdata\.v2"/u);
assert.match(
  earthquakeHubSource,
  /json_array_length\(excluded\.regions_json\)\s*>=\s*json_array_length\(earthquake_history\.regions_json\)/u
);
assert.match(earthquakeHubSource, /retention-cleanup-v3/u);
assert.match(earthquakeHubSource, /cleanupExpiredD1EarthquakeData/u);

const [pagesWranglerSource, workerWranglerSource] = await Promise.all([
  fs.readFile(path.join(root, "wrangler.toml"), "utf8"),
  fs.readFile(
    path.join(root, "workers", "earthquake-realtime", "wrangler.toml"),
    "utf8"
  )
]);
assert.match(
  pagesWranglerSource,
  /service\s*=\s*"meteoscope-earthquake-realtime"/u
);
assert.match(
  workerWranglerSource,
  /name\s*=\s*"meteoscope-earthquake-realtime"/u
);
assert.match(
  workerWranglerSource,
  /class_name\s*=\s*"MeteoScopeEarthquakeHub"/u
);
assert.match(
  workerWranglerSource,
  /database_name\s*=\s*"meteoscope-earthquakes"/u
);
assert.match(workerWranglerSource, /\[triggers\][\s\S]*crons\s*=\s*\["0 15 \* \* \*"\]/u);
assert.match(publicWorkerSource, /maxDays:\s*JMA_DAILY_BACKFILL_DAYS_PER_SYNC/u);
assert.doesNotMatch(publicWorkerSource, /scheduledD1Backfill|runScheduledD1Backfill/u);
for (const source of [pagesWranglerSource, workerWranglerSource, publicWorkerSource]) {
  assert.doesNotMatch(source, /eqapp-realtime|eq-signal-history|RealtimeHub/u);
}

for (const relativePath of [
  "src/config.js",
  "ios/MeteoScope/Services/MeteoScopeEndpoints.swift"
]) {
  const source = await fs.readFile(path.join(root, relativePath), "utf8");
  assert.doesNotMatch(source, /rt\.eq-signal\.com/);
}

const dmdataOnlySources = await Promise.all([
  "src/config.js",
  "src/dmdata/earthquakes.js",
  "ios/MeteoScope/Services/MeteoScopeEndpoints.swift",
  "ios/MeteoScope/Services/WeatherAPIClient.swift"
].map(relativePath => fs.readFile(path.join(root, relativePath), "utf8")));

for (const source of dmdataOnlySources) {
  assert.doesNotMatch(source, /developer\/xml\/feed\/eqvol(?:_l)?\.xml/u);
}
assert.match(dmdataOnlySources[1], /latestPayload\?\.latest\?\.tsunami/u);
assert.match(dmdataOnlySources[3], /DMDataTsunamiBuilder\.build/u);

console.log("Earthquake Worker route tests passed.");
