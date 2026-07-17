import { getMeteoScopeAccountSessionToken } from "./quizRankingClient.js";
import { getEarlyAccessToken } from "../ui/earlyAccess.js";

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
  if (options.earlyAccess) {
    const earlyAccessToken = getEarlyAccessToken();
    if (earlyAccessToken) headers.set("X-MeteoScope-Early-Access", earlyAccessToken);
  }
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
  list: ({ bounds, limit = 300 } = {}) => {
    const query = new URLSearchParams({ limit: String(limit) });
    if (Array.isArray(bounds) && bounds.length === 4) query.set("bbox", bounds.join(","));
    return request(`reports?${query}`);
  },
  create: (values) => request("reports", {
    method: "POST",
    body: JSON.stringify(values),
    earlyAccess: true
  }),
  remove: (reportID) => request(`reports/${encodeURIComponent(reportID)}`, { method: "DELETE" }),
  flag: (reportID, reason = "misleading") => request(`reports/${encodeURIComponent(reportID)}/flag`, {
    method: "POST",
    body: JSON.stringify({ reason })
  })
});
