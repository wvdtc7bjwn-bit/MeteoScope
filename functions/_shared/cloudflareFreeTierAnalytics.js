const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";
const D1_DATABASES_ENDPOINT = "https://api.cloudflare.com/client/v4/accounts";

export const CLOUDFLARE_FREE_TIER_LIMITS = Object.freeze({
  workerRequests: 100_000,
  durableObjectRequests: 100_000,
  durableObjectDurationGbSeconds: 13_000,
  d1RowsRead: 5_000_000,
  d1RowsWritten: 100_000,
  d1StorageBytes: 5_000_000_000,
  d1DatabaseStorageBytes: 500_000_000
});

export const EARTHQUAKE_D1_STORAGE_THRESHOLDS = Object.freeze({
  noticeBytes: 100_000_000,
  warningBytes: 200_000_000,
  dangerBytes: 350_000_000
});

const WORKERS_QUERY = `query MeteoScopeWorkersUsage($accountTag: string, $start: string, $end: string) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      workersInvocationsAdaptive(
        limit: 10000
        filter: { datetime_geq: $start, datetime_leq: $end }
      ) {
        dimensions { scriptName status }
        sum { requests errors subrequests }
      }
    }
  }
}`;

const DURABLE_OBJECT_INVOCATIONS_QUERY = `query MeteoScopeDurableObjectRequests($accountTag: string!, $date: Date) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      durableObjectsInvocationsAdaptiveGroups(
        limit: 1000
        filter: { date_geq: $date, date_leq: $date }
      ) {
        sum { requests }
      }
    }
  }
}`;

const DURABLE_OBJECT_DURATION_QUERY = `query MeteoScopeDurableObjectDuration($accountTag: string!, $date: Date) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      durableObjectsPeriodicGroups(
        limit: 1000
        filter: { date_geq: $date, date_leq: $date }
      ) {
        sum { duration fatalInternalErrors }
      }
    }
  }
}`;

const D1_QUERY = `query MeteoScopeD1Usage($accountTag: string!, $start: Date, $end: Date) {
  viewer {
    accounts(filter: { accountTag: $accountTag }) {
      d1AnalyticsAdaptiveGroups(
        limit: 1000
        filter: { date_geq: $start, date_leq: $end }
      ) {
        sum { rowsRead rowsWritten }
      }
    }
  }
}`;

export async function readCloudflareFreeTierUsage(env, options = {}) {
  const accountID = String(env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const token = String(
    env.CLOUDFLARE_ANALYTICS_API_TOKEN || env.CLOUDFLARE_API_TOKEN || ""
  ).trim();
  const now = validDate(options.now ?? new Date());
  const updatedAt = now.toISOString();
  const dateUtc = updatedAt.slice(0, 10);
  const periodStart = `${dateUtc}T00:00:00.000Z`;

  const base = {
    configured: Boolean(accountID && token),
    available: false,
    partial: false,
    updatedAt,
    period: {
      dateUtc,
      startUtc: periodStart,
      endUtc: updatedAt,
      resetTimeJst: "09:00"
    },
    limits: { ...CLOUDFLARE_FREE_TIER_LIMITS },
    workers: unavailableMetric("Cloudflare Analytics用の環境変数が未設定です。"),
    durableObjects: unavailableMetric("Cloudflare Analytics用の環境変数が未設定です。"),
    d1: unavailableMetric("Cloudflare Analytics用の環境変数が未設定です。")
  };

  if (!accountID || !token) {
    return base;
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json"
  };
  const commonVariables = { accountTag: accountID, date: dateUtc };
  const results = await Promise.allSettled([
    queryGraphql(fetchImpl, headers, WORKERS_QUERY, {
      accountTag: accountID,
      start: periodStart,
      end: updatedAt
    }),
    queryGraphql(fetchImpl, headers, DURABLE_OBJECT_INVOCATIONS_QUERY, commonVariables),
    queryGraphql(fetchImpl, headers, DURABLE_OBJECT_DURATION_QUERY, commonVariables),
    queryGraphql(fetchImpl, headers, D1_QUERY, {
      accountTag: accountID,
      start: dateUtc,
      end: dateUtc
    }),
    readD1Storage(fetchImpl, headers, accountID)
  ]);

  const workersGroups = fulfilledValue(results[0]);
  const durableRequestGroups = fulfilledValue(results[1]);
  const durableDurationGroups = fulfilledValue(results[2]);
  const d1Groups = fulfilledValue(results[3]);
  const d1Storage = fulfilledValue(results[4]);

  const workers = workersGroups
    ? sumGroups(workersGroups, ["requests", "errors", "subrequests"])
    : null;
  const durableRequests = durableRequestGroups
    ? sumGroups(durableRequestGroups, ["requests"])
    : null;
  const durableDuration = durableDurationGroups
    ? sumGroups(durableDurationGroups, ["duration", "fatalInternalErrors"])
    : null;
  const d1Rows = d1Groups ? sumGroups(d1Groups, ["rowsRead", "rowsWritten"]) : null;

  base.workers = workers
    ? {
        available: true,
        requests: workers.requests,
        errors: workers.errors,
        subrequests: workers.subrequests,
        errorBreakdown: buildWorkerErrorBreakdown(workersGroups)
      }
    : unavailableMetric(resultError(results[0]));

  if (durableRequests || durableDuration) {
    base.durableObjects = {
      available: Boolean(durableRequests && durableDuration),
      requests: durableRequests?.requests ?? null,
      durationGbSeconds: durableDuration?.duration ?? null,
      fatalInternalErrors: durableDuration?.fatalInternalErrors ?? null,
      partial: !durableRequests || !durableDuration,
      message: [
        durableRequests ? null : resultError(results[1]),
        durableDuration ? null : resultError(results[2])
      ].filter(Boolean).join(" ") || null
    };
  }
  else {
    base.durableObjects = unavailableMetric(
      [resultError(results[1]), resultError(results[2])].filter(Boolean).join(" ")
    );
  }

  if (d1Rows || d1Storage) {
    base.d1 = {
      available: Boolean(d1Rows && d1Storage),
      rowsRead: d1Rows?.rowsRead ?? null,
      rowsWritten: d1Rows?.rowsWritten ?? null,
      storageBytes: d1Storage?.storageBytes ?? null,
      databaseCount: d1Storage?.databaseCount ?? null,
      largestDatabase: d1Storage?.largestDatabase ?? null,
      earthquakeDatabase: d1Storage?.earthquakeDatabase ?? null,
      earthquakeStorageStatus: d1Storage?.earthquakeStorageStatus ?? null,
      partial: !d1Rows || !d1Storage,
      message: [
        d1Rows ? null : resultError(results[3]),
        d1Storage ? null : resultError(results[4])
      ].filter(Boolean).join(" ") || null
    };
  }
  else {
    base.d1 = unavailableMetric(
      [resultError(results[3]), resultError(results[4])].filter(Boolean).join(" ")
    );
  }

  const sections = [base.workers, base.durableObjects, base.d1];
  base.available = sections.some((section) => section.available || section.partial);
  base.partial = sections.some((section) => !section.available || section.partial);
  return base;
}

async function queryGraphql(fetchImpl, headers, query, variables) {
  const response = await fetchImpl(GRAPHQL_ENDPOINT, {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) {
    throw new Error("Cloudflare Analyticsから利用量を取得できませんでした。");
  }
  const account = payload?.data?.viewer?.accounts?.[0];
  if (!account || typeof account !== "object") {
    throw new Error("Cloudflare Analyticsの応答形式を確認できませんでした。");
  }
  const groups = Object.values(account).find(Array.isArray);
  if (!Array.isArray(groups)) {
    throw new Error("Cloudflare Analyticsの集計結果を確認できませんでした。");
  }
  return groups;
}

async function readD1Storage(fetchImpl, headers, accountID) {
  let page = 1;
  let totalPages = 1;
  const databases = [];
  do {
    const url = `${D1_DATABASES_ENDPOINT}/${encodeURIComponent(accountID)}/d1/database?page=${page}&per_page=100`;
    const response = await fetchImpl(url, { headers });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.success === false || !Array.isArray(payload.result)) {
      throw new Error("Cloudflare D1の保存容量を取得できませんでした。");
    }
    databases.push(...payload.result);
    totalPages = Math.max(1, Math.min(10, Number(payload?.result_info?.total_pages ?? 1) || 1));
    page += 1;
  } while (page <= totalPages);

  const normalized = databases.map((database) => ({
    name: String(database?.name ?? "").slice(0, 100),
    storageBytes: finiteNumber(database?.file_size)
  }));
  const largestDatabase = normalized.reduce((largest, current) => (
    current.storageBytes > (largest?.storageBytes ?? -1) ? current : largest
  ), null);
  const earthquakeDatabase = normalized.find((database) => (
    database.name === "meteoscope-earthquakes"
  )) ?? null;
  return {
    storageBytes: normalized.reduce((sum, database) => sum + database.storageBytes, 0),
    databaseCount: normalized.length,
    largestDatabase,
    earthquakeDatabase,
    earthquakeStorageStatus: classifyEarthquakeD1Storage(
      earthquakeDatabase?.storageBytes ?? null
    )
  };
}

export function classifyEarthquakeD1Storage(value) {
  const storageBytes = Number(value);
  if (!Number.isFinite(storageBytes) || storageBytes < 0) {
    return { available: false, level: "unavailable" };
  }
  const level = storageBytes >= EARTHQUAKE_D1_STORAGE_THRESHOLDS.dangerBytes
    ? "danger"
    : storageBytes >= EARTHQUAKE_D1_STORAGE_THRESHOLDS.warningBytes
      ? "warning"
      : storageBytes >= EARTHQUAKE_D1_STORAGE_THRESHOLDS.noticeBytes
        ? "notice"
        : "ok";
  return {
    available: true,
    level,
    storageBytes,
    ...EARTHQUAKE_D1_STORAGE_THRESHOLDS
  };
}

function sumGroups(groups, fields) {
  return groups.reduce((totals, group) => {
    for (const field of fields) {
      totals[field] += finiteNumber(group?.sum?.[field]);
    }
    return totals;
  }, Object.fromEntries(fields.map((field) => [field, 0])));
}

function buildWorkerErrorBreakdown(groups) {
  const byStatus = new Map();
  const byScript = new Map();
  for (const group of groups) {
    const errors = finiteNumber(group?.sum?.errors);
    if (errors <= 0) continue;
    const status = String(group?.dimensions?.status || "unknown");
    const scriptName = String(group?.dimensions?.scriptName || "unknown").slice(0, 120);
    byStatus.set(status, (byStatus.get(status) || 0) + errors);
    byScript.set(scriptName, (byScript.get(scriptName) || 0) + errors);
  }
  return {
    byStatus: sortedErrorEntries(byStatus, "status"),
    byScript: sortedErrorEntries(byScript, "scriptName")
  };
}

function sortedErrorEntries(values, key) {
  return [...values.entries()]
    .map(([name, errors]) => ({ [key]: name, errors }))
    .sort((left, right) => right.errors - left.errors || String(left[key]).localeCompare(String(right[key])))
    .slice(0, 12);
}

function fulfilledValue(result) {
  return result?.status === "fulfilled" ? result.value : null;
}

function resultError(result) {
  return result?.status === "rejected"
    ? String(result.reason?.message || result.reason || "取得できませんでした。").slice(0, 180)
    : "取得できませんでした。";
}

function unavailableMetric(message) {
  return { available: false, partial: false, message };
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}
