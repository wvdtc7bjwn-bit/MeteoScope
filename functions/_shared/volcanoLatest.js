const JMA_ACTIVITY_BASE_URL = "https://www.data.jma.go.jp/vois/data/report/activity_info";
const JMA_VOLINFO_BASE_URL = "https://www.data.jma.go.jp";
const VOLCANO_CODE_PATTERN = /^\d{3}$/u;
const LATEST_ACTIVITY_LINK_PATTERN =
  /href=["'](?<href>[^"']*\/volinfo\/VK(?<stamp>\d{12,14})_(?<code>\d+)\.html)["'][^>]*>(?<title>[\s\S]*?)<\/a>/giu;

export function normalizeVolcanoCodes(values, limit = 24) {
  return [...new Set((values ?? [])
    .map((value) => String(value ?? "").trim())
    .filter((value) => VOLCANO_CODE_PATTERN.test(value)))]
    .slice(0, limit);
}

export function parseLatestVolcanoActivityHtml(html, expectedCode = "") {
  const matches = [...String(html ?? "").matchAll(LATEST_ACTIVITY_LINK_PATTERN)]
    .filter((match) => !expectedCode || String(match.groups?.code ?? "") === String(expectedCode))
    .sort((left, right) => String(right.groups?.stamp ?? "").localeCompare(String(left.groups?.stamp ?? "")));
  const latest = matches[0];
  if (!latest) return null;

  const stamp = String(latest.groups?.stamp ?? "").slice(0, 12);
  const volcanoCode = String(latest.groups?.code ?? expectedCode ?? "");
  if (stamp.length !== 12 || !VOLCANO_CODE_PATTERN.test(volcanoCode)) return null;
  const relativeUrl = String(latest.groups?.href ?? "");
  return {
    volcanoCode,
    reportTimeRaw: `${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)}T${stamp.slice(8, 10)}:${stamp.slice(10, 12)}:00+09:00`,
    title: decodeHtml(stripTags(latest.groups?.title ?? "")),
    sourceUrl: relativeUrl.startsWith("http")
      ? relativeUrl
      : new URL(relativeUrl, JMA_VOLINFO_BASE_URL).href
  };
}

export function parseVolcanoBulletinHtml(html) {
  const preMatch = String(html ?? "").match(/<pre\b[^>]*>(?<content>[\s\S]*?)<\/pre>/iu);
  if (!preMatch?.groups?.content) return {};

  const text = decodeHtml(preMatch.groups.content)
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<[^>]*>/gu, "")
    .replace(/\r\n?/gu, "\n")
    .replace(/\u00a0/gu, " ")
    .trim();
  const lines = text.split("\n").map((line) => line.trimEnd());
  const headlineMarkerIndex = lines.findIndex((line) => /＊＊\s*[（(]見出し[）)]\s*＊＊/u.test(line));
  const bodyMarkerIndex = lines.findIndex((line) => /＊＊\s*[（(]本[\s　]*文[）)]\s*＊＊/u.test(line));
  const bodyLines = bodyMarkerIndex >= 0 ? lines.slice(bodyMarkerIndex + 1) : [];
  const activityIndex = bodyLines.findIndex((line) => /^[１1][．.]\s*火山活動の状況/u.test(line.trim()));
  const preventionIndex = bodyLines.findIndex((line) => /^[２2][．.]\s*防災上の警戒事項等/u.test(line.trim()));

  const volcanoHeadline = headlineMarkerIndex >= 0 && bodyMarkerIndex > headlineMarkerIndex
    ? normalizeBulletinBlock(lines.slice(headlineMarkerIndex + 1, bodyMarkerIndex))
    : "";
  const activity = activityIndex >= 0
    ? normalizeBulletinBlock(bodyLines.slice(activityIndex + 1, preventionIndex >= 0 ? preventionIndex : undefined))
    : normalizeBulletinBlock(bodyLines);
  let preventionLines = preventionIndex >= 0 ? bodyLines.slice(preventionIndex + 1) : [];
  let nextAdvisory = "";
  const finalParagraphIndex = findFinalParagraphIndex(preventionLines);
  if (finalParagraphIndex >= 0) {
    nextAdvisory = normalizeBulletinBlock(preventionLines.slice(finalParagraphIndex));
    preventionLines = preventionLines.slice(0, finalParagraphIndex);
  }

  return {
    volcanoHeadline,
    activity,
    prevention: normalizeBulletinBlock(preventionLines),
    nextAdvisory
  };
}

export async function fetchLatestVolcanoActivities(codes, fetchImpl = fetch) {
  const normalizedCodes = normalizeVolcanoCodes(codes);
  const results = await Promise.allSettled(normalizedCodes.map(async (volcanoCode) => {
    const response = await fetchImpl(`${JMA_ACTIVITY_BASE_URL}/${volcanoCode}.html`, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "User-Agent": "MeteoScope/1.0 (volcano information display)"
      }
    });
    if (!response.ok) throw new Error(`JMA volcano activity request failed: ${response.status}`);
    const metadata = parseLatestVolcanoActivityHtml(await response.text(), volcanoCode);
    if (!metadata?.sourceUrl) return metadata;

    try {
      const detailResponse = await fetchImpl(metadata.sourceUrl, {
        headers: {
          "Accept": "text/html,application/xhtml+xml",
          "User-Agent": "MeteoScope/1.0 (volcano information display)"
        }
      });
      if (!detailResponse.ok) return metadata;
      return {
        ...metadata,
        ...parseVolcanoBulletinHtml(await detailResponse.text())
      };
    } catch {
      return metadata;
    }
  }));
  return results
    .filter((result) => result.status === "fulfilled" && result.value)
    .map((result) => result.value);
}

function normalizeBulletinBlock(lines) {
  return String(Array.isArray(lines) ? lines.join("\n") : lines ?? "")
    .split(/\n\s*\n/gu)
    .map((paragraph) => paragraph
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .join(""))
    .filter(Boolean)
    .join("\n\n");
}

function findFinalParagraphIndex(lines) {
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    if (!String(lines[index] ?? "").trim()) continue;
    let start = index;
    while (start > 0 && String(lines[start - 1] ?? "").trim()) start -= 1;
    const paragraph = normalizeBulletinBlock(lines.slice(start, index + 1));
    return /(?:随時お知らせ|次回の情報|次の解説情報)/u.test(paragraph) ? start : -1;
  }
  return -1;
}

function stripTags(value) {
  return String(value).replace(/<[^>]*>/gu, "").replace(/\s+/gu, " ").trim();
}

function decodeHtml(value) {
  const entities = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    quot: "\""
  };
  return String(value).replace(/&(?:#(?<decimal>\d+)|#x(?<hex>[\da-f]+)|(?<named>amp|apos|gt|lt|quot));/giu, (...args) => {
    const groups = args.at(-1);
    if (groups?.decimal) return String.fromCodePoint(Number(groups.decimal));
    if (groups?.hex) return String.fromCodePoint(Number.parseInt(groups.hex, 16));
    return entities[String(groups?.named ?? "").toLowerCase()] ?? "";
  });
}
