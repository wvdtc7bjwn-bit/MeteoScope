const JMA_DISASTER_ARCHIVE_URL = "https://www.data.jma.go.jp/review/";

const CASE_BLOCK_PATTERN = /<div\s+class=["']simu-item["']\s*>([\s\S]*?)(?=<div\s+class=["']simu-item["']\s*>|$)/giu;
const NAME_PATTERN = /<div\s+class=["']simu-item-name["'][^>]*>([\s\S]*?)<span\s+class=["']simu-tri["']/iu;
const LINK_PATTERN = /<a\b[^>]*href\s*=\s*(["'])(.*?)\1[^>]*>([\s\S]*?)<\/a\s*>/giu;
const ARCHIVE_LINK_PATTERN = /^#target=(\d{8})&current=(\d{10})&range=(\d{10})-(\d{10})$/u;

export function parseJmaDisasterArchive(markup) {
  const cases = [];
  for (const match of String(markup ?? "").matchAll(CASE_BLOCK_PATTERN)) {
    const block = match[1];
    const nameMatch = block.match(NAME_PATTERN);
    const title = decodeJmaHtmlText(stripHtml(nameMatch?.[1] ?? "")).trim();
    if (!title) continue;

    const links = [];
    for (const linkMatch of block.matchAll(LINK_PATTERN)) {
      const label = decodeJmaHtmlText(stripHtml(linkMatch[3])).trim();
      const url = normalizeJmaArchiveLink(linkMatch[2]);
      if (!label || !url) continue;
      links.push({ label, url });
    }
    if (links.length) cases.push({ title, links });
  }
  return cases;
}

function normalizeJmaArchiveLink(href) {
  let url;
  try {
    url = new URL(href, JMA_DISASTER_ARCHIVE_URL);
  } catch {
    return "";
  }
  if (url.origin !== "https://www.data.jma.go.jp" || url.pathname !== "/review/page.html") return "";
  if (!ARCHIVE_LINK_PATTERN.test(url.hash)) return "";
  return url.href;
}

function stripHtml(value) {
  return String(value).replace(/<[^>]*>/gu, "");
}

function decodeJmaHtmlText(value) {
  return String(value)
    .replace(/&nbsp;|&#160;|&#x0*a0;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/giu, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)));
}
