const JMA_CASE_LIST_URL = "https://www.data.jma.go.jp/review/case.txt";
const MAX_CASE_LIST_BYTES = 512 * 1024;
const RESPONSE_HEADERS = {
  "Cache-Control": "public, max-age=300, s-maxage=1800, stale-while-revalidate=21600",
  "Content-Type": "text/plain; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

export async function onRequest({ request }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return errorResponse("method_not_allowed", 405);
  }

  try {
    const upstream = await fetch(JMA_CASE_LIST_URL, {
      headers: { Accept: "text/html,text/plain;q=0.9,*/*;q=0.1" },
      cf: { cacheTtl: 1800, cacheEverything: true }
    });
    if (!upstream.ok) throw new Error(`JMA request failed: ${upstream.status}`);
    const markup = await upstream.text();
    if (!markup.includes("simu-item") || markup.length > MAX_CASE_LIST_BYTES) {
      throw new Error("Unexpected JMA archive response");
    }
    return new Response(request.method === "HEAD" ? null : markup, {
      status: 200,
      headers: RESPONSE_HEADERS
    });
  } catch (error) {
    console.error("[jma-disaster-cases] archive request failed", error);
    return errorResponse("jma_disaster_archive_unavailable", 502);
  }
}

function errorResponse(code, status) {
  return new Response(JSON.stringify({ error: code }), {
    status,
    headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json; charset=utf-8" }
  });
}
