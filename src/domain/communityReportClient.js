import { getMeteoScopeAccountSessionToken } from "./quizRankingClient.js";

const REPORT_LIST_CACHE_TTL_MS = 60 * 1000;
const reportListCache = new Map();

function apiURL(path = "reports") {
  const base = globalThis.location?.hostname?.endsWith("github.io")
    ? "https://meteoscope.pages.dev/api/community"
    : "/api/community";
  return `${base}/${String(path).replace(/^\//u, "")}`;
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers ?? {});
  const accountToken = getMeteoScopeAccountSessionToken();
  if (accountToken) headers.set("Authorization", `Bearer ${accountToken}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  let response;
  try {
    response = await fetch(apiURL(path), {
      ...options,
      headers,
      credentials: "include",
      cache: "no-store"
    });
  } catch {
    throw new Error("現在地の投稿サーバーへ接続できませんでした。");
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "現在地の投稿を処理できませんでした。");
  return result;
}

export const CommunityReportClient = Object.freeze({
  list: ({ bounds, limit = 100, force = false } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (Array.isArray(bounds) && bounds.length === 4) query.set("bbox", bounds.join(","));
    const cacheKey = `${getMeteoScopeAccountSessionToken() ?? "anonymous"}:${query}`;
    const cached = reportListCache.get(cacheKey);
    if (!force && cached && Date.now() - cached.createdAt < REPORT_LIST_CACHE_TTL_MS) return cached.promise;
    const promise = request(`reports?${query}`).catch((error) => {
      reportListCache.delete(cacheKey);
      throw error;
    });
    reportListCache.set(cacheKey, { createdAt: Date.now(), promise });
    return promise;
  },
  create: async (values) => {
    const result = await request("reports", { method: "POST", body: JSON.stringify(values) });
    reportListCache.clear();
    return result;
  },
  remove: (reportID) => request(`reports/${encodeURIComponent(reportID)}`, { method: "DELETE" }),
  flag: (reportID, reason = "misleading") => request(`reports/${encodeURIComponent(reportID)}/flag`, {
    method: "POST",
    body: JSON.stringify({ reason })
  })
});
