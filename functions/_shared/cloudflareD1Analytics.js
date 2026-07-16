const GRAPHQL_ENDPOINT = "https://api.cloudflare.com/client/v4/graphql";

export async function readCloudflareD1Usage(env, options = {}) {
  const accountID = String(env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
  const databaseID = String(env.D1_DATABASE_ID ?? "").trim();
  const token = String(env.CLOUDFLARE_ANALYTICS_API_TOKEN ?? env.CLOUDFLARE_API_TOKEN ?? "").trim();
  if (!accountID || !databaseID || !token) {
    return { configured: false, message: "Cloudflare Analytics用の環境変数が未設定です。" };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const now = validDate(options.now ?? new Date());
  const date = now.toISOString().slice(0, 10);
  const headers = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  const [analyticsResult, databaseResult] = await Promise.allSettled([
    fetchImpl(GRAPHQL_ENDPOINT, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query: `query MeteoScopeD1Usage($accountTag: string!, $start: Date, $end: Date, $databaseId: string) {
          viewer {
            accounts(filter: { accountTag: $accountTag }) {
              d1AnalyticsAdaptiveGroups(
                limit: 1000
                filter: { date_geq: $start, date_leq: $end, databaseId: $databaseId }
              ) {
                sum { rowsRead rowsWritten }
              }
            }
          }
        }`,
        variables: { accountTag: accountID, start: date, end: date, databaseId: databaseID }
      })
    }).then(readAnalyticsResponse),
    fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountID)}/d1/database/${encodeURIComponent(databaseID)}`, {
      headers: { Authorization: `Bearer ${token}` }
    }).then(readDatabaseResponse)
  ]);

  const analytics = analyticsResult.status === "fulfilled" ? analyticsResult.value : null;
  const database = databaseResult.status === "fulfilled" ? databaseResult.value : null;
  if (!analytics && !database) {
    return { configured: true, available: false, dateUtc: date, message: "D1利用量を取得できませんでした。API Tokenの権限を確認してください。" };
  }
  return {
    configured: true,
    available: true,
    dateUtc: date,
    rowsRead: analytics?.rowsRead ?? null,
    rowsWritten: analytics?.rowsWritten ?? null,
    storageBytes: database?.storageBytes ?? null,
    partial: !analytics || !database
  };
}

async function readAnalyticsResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.errors?.length) throw new Error("Cloudflare Analytics request failed.");
  const groups = payload?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
  if (!Array.isArray(groups)) throw new Error("Cloudflare Analytics response changed.");
  return groups.reduce((totals, group) => ({
    rowsRead: totals.rowsRead + Number(group?.sum?.rowsRead ?? 0),
    rowsWritten: totals.rowsWritten + Number(group?.sum?.rowsWritten ?? 0)
  }), { rowsRead: 0, rowsWritten: 0 });
}

async function readDatabaseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.success === false) throw new Error("Cloudflare D1 database request failed.");
  const size = Number(payload?.result?.file_size);
  return { storageBytes: Number.isFinite(size) ? size : null };
}

function validDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date();
}
