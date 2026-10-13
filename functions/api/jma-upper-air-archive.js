const JMA_ORIGIN = "https://www.data.jma.go.jp";
const ARCHIVE_ROOT = `${JMA_ORIGIN}/yoho/wxchart/archive/`;
const MONTH_ROOT = `${JMA_ORIGIN}/yoho/data/wxchart/archive/`;
const MAX_HTML_LENGTH = 1024 * 1024;
const RESPONSE_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "public, max-age=900, s-maxage=21600, stale-while-revalidate=86400",
  "Content-Type": "application/json; charset=utf-8",
  "X-Content-Type-Options": "nosniff"
};

export function parseJmaUpperAirArchiveMonths(html) {
  const months = new Map();
  const links = html.matchAll(/href=["']\/yoho\/data\/wxchart\/archive\/(20\d{2})_(0[1-9]|1[0-2])\/index\.html["']/gu);
  for (const [, year, month] of links) {
    const value = `${year}_${month}`;
    months.set(value, { value, label: `${year}年${month}月` });
  }
  return [...months.values()].sort((a, b) => b.value.localeCompare(a.value));
}

export function parseJmaUpperAirArchiveCharts(html, month) {
  const charts = [];
  const sourceMonth = month.replace("_", "");
  const links = html.matchAll(/href=["'](PDFDATA\/AUMAP\/Au(850|700|500|300)_(20\d{6})(00|12)\.pdf)["']/gu);
  for (const [, path, level, date, hour] of links) {
    if (!date.startsWith(sourceMonth)) continue;
    const day = Number(date.slice(6, 8));
    const lastDay = new Date(Date.UTC(Number(date.slice(0, 4)), Number(date.slice(4, 6)), 0)).getUTCDate();
    if (day < 1 || day > lastDay) continue;
    charts.push({
      level: Number(level),
      date,
      hour,
      url: new URL(path, `${MONTH_ROOT}${month}/index.html`).href
    });
  }
  return charts;
}

async function fetchArchiveHtml(url) {
  const response = await fetch(url, {
    headers: { Accept: "text/html" },
    cf: { cacheTtl: 21600, cacheEverything: true }
  });
  if (!response.ok) throw new Error(`JMA archive request failed: ${response.status}`);
  const html = await response.text();
  if (!html || html.length > MAX_HTML_LENGTH) throw new Error("Unexpected JMA archive response");
  return html;
}

export async function onRequest({ request }) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405, headers: RESPONSE_HEADERS });
  }

  const month = new URL(request.url).searchParams.get("month");
  if (month !== null && !/^20\d{2}_(0[1-9]|1[0-2])$/u.test(month)) {
    return new Response(JSON.stringify({ error: "invalid_month" }), { status: 400, headers: RESPONSE_HEADERS });
  }

  try {
    let data;
    if (month) {
      const html = await fetchArchiveHtml(`${MONTH_ROOT}${month}/index.html`);
      data = { month, charts: parseJmaUpperAirArchiveCharts(html, month) };
      if (!data.charts.length) throw new Error("No upper-air charts in JMA archive month");
    } else {
      const pages = await Promise.allSettled([
        fetchArchiveHtml(`${ARCHIVE_ROOT}index.html`),
        fetchArchiveHtml(`${ARCHIVE_ROOT}archive.html`)
      ]);
      data = {
        months: parseJmaUpperAirArchiveMonths(pages.filter((page) => page.status === "fulfilled").map((page) => page.value).join("\n"))
      };
      if (!data.months.length) throw new Error("No published JMA archive months");
    }
    return new Response(request.method === "HEAD" ? null : JSON.stringify(data), { headers: RESPONSE_HEADERS });
  } catch (error) {
    console.error("[jma-upper-air-archive] failed to load archive", error);
    return new Response(JSON.stringify({ error: "archive_unavailable" }), { status: 502, headers: RESPONSE_HEADERS });
  }
}
