import {
  fetchLatestVolcanoActivities,
  normalizeVolcanoCodes
} from "../../_shared/volcanoLatest.js";

const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

export async function onRequest({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: RESPONSE_HEADERS });
  }
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const codes = normalizeVolcanoCodes(new URL(request.url).searchParams.get("codes")?.split(",") ?? []);
  if (!codes.length) return json({ ok: false, error: "volcano_codes_required" }, 400);

  try {
    const reports = await fetchLatestVolcanoActivities(codes);
    return json({
      ok: true,
      generatedAt: new Date().toISOString(),
      reports
    });
  } catch (error) {
    console.error("[volcano-latest] JMA activity lookup failed", error);
    return json({ ok: false, error: "jma_volcano_activity_unavailable" }, 502);
  }
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...RESPONSE_HEADERS,
      "Cache-Control": "public, max-age=600, s-maxage=600, stale-while-revalidate=86400"
    }
  });
}
