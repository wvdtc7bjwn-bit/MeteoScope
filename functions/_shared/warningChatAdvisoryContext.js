import {fetchWarningChatText, revisionOf} from "./warningChatSources.js";
import {SEISMIC_ADVISORY_SOURCES} from "./warningChatSpecialist.js";

function plainText(html) {
  return html.replace(/<!--[\s\S]*?-->/gu, "").replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "")
    .replace(/<[^>]*>/gu, " ").replace(/&(?:nbsp|amp|lt|gt|quot|#39);/gu, entity => ({"&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'"})[entity])
    .replace(/\s+/gu, " ").trim().normalize("NFKC");
}

// Fixed official pages currently embed the latest bulletin ABOVE the history
// table. Never scan the whole page for a keyword: old advisories and reference
// definitions are deliberately retained there. Markup changes fail closed.
export function parseSeismicAdvisoryPage(html, kind, now = Date.now()) {
  if (!Object.hasOwn(SEISMIC_ADVISORY_SOURCES, kind) || typeof html !== "string") throw new TypeError("invalid_advisory_source");
  const main = html.split(/<div\b[^>]*\bid=["']main["'][^>]*>/iu)[1];
  const top = main?.split(/<ul\b[^>]*class=["']historymenu["']/iu)[0];
  const item = top?.match(/<div\s+class=["'](?:teirei|rinji|list)["']\s*>([\s\S]*?)<\/p>\s*<\/div>/iu)?.[1];
  if (!item) throw new Error("advisory_markup_changed");
  const dateText = plainText(item.match(/<div\s+align=["']right["']\s*>([\s\S]*?)<\/div>/iu)?.[1] ?? "");
  const date = dateText.match(/^(令和|平成)(元|\d{1,2})年(\d{1,2})月(\d{1,2})日/uy);
  const title = plainText(item.match(/<div\s+align=["']center["']\s*>([\s\S]*?)<\/div>/iu)?.[1] ?? "");
  const text = plainText(item);
  const headline = text.match(/\*\*\s*見出し\s*\*\*\s*([\s\S]*?)\s*\*\*\s*本文\s*\*\*/u)?.[1]?.trim();
  const body = text.split(/\*\*\s*本文\s*\*\*/u)[1]?.split(/\*\*\s*\(?参考/u)[0] ?? "";
  const assessment = kind === "nankai" ? body.match(/(?:現在のところ|現時点で)[^。]{1,250}。/u)?.[0] : undefined;
  const expected = kind === "nankai" ? /^南海トラフ地震(?:臨時情報|関連解説情報)/u : /^北海道・三陸沖後発地震注意情報/u;
  if (!date || !expected.test(title) || !headline || headline.length > 900 || title.length > 100) throw new Error("advisory_incomplete");
  const year = (date[1] === "令和" ? 2018 : 1988) + (date[2] === "元" ? 1 : Number(date[2]));
  const month = Number(date[3]), day = Number(date[4]);
  const issuedDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const stamp = Date.parse(`${issuedDate}T00:00:00+09:00`);
  if (!Number.isFinite(stamp) || new Date(stamp + 9 * 3600_000).toISOString().slice(0, 10) !== issuedDate || stamp > now) throw new Error("advisory_invalid_date");
  return {kind, title, issuedDate, datePrecision: "day", headline, ...(assessment ? {assessment} : {}),
    currentState: "unverified", olderPublication: stamp < now - 7 * 86400_000};
}

export async function buildSeismicAdvisoryContext(input, plan, {fetcher = fetch, now = Date.now()} = {}) {
  const bulletins = plan.current ? await Promise.all(plan.kinds.map(async kind => {
    try {
      const html = await fetchWarningChatText(SEISMIC_ADVISORY_SOURCES[kind].url, {fetcher, fresh: true});
      return {...parseSeismicAdvisoryPage(html, kind, now), availability: "available"};
    } catch {
      // Failure is not "no advisory". Keep the other bulletin usable when only
      // one source fails; log no question, personal data or external payload.
      console.warn("[warning-chat] advisory source unavailable", kind);
      return {kind, availability: "unavailable", currentState: "unverified"};
    }
  })) : [];
  const sources = [...plan.records.map(({title, url}) => ({title: `気象庁 ${title}`, url})),
    ...plan.kinds.map(kind => SEISMIC_ADVISORY_SOURCES[kind])];
  const content = {topic: "earthquake", referenceKind: "seismic-advisory", knowledgeOnly: !plan.current,
    knowledge: plan.records.map(({id, title, text}) => ({id, title, text})),
    ...(plan.current ? {advisories: bulletins} : {}),
    explanation: plan.current
      ? "公式ページの最新掲載欄の見出しを取得しています。掲載は発表中・有効の証明ではありません。掲載日と確認時刻を区別し、古い掲載を現在の発表中と扱わないでください。日付のみの資料に発表時刻を補わず、履歴表・参考説明のキーワードを現在の状態に使わないでください。現在の防災対応・自治体の対象区域はこの資料だけでは確認できません。"
      : "一般的な制度・防災対応の解説です。現在の発表状況や選択市区町村の安全性の確認結果ではありません。",
    reviewedAt: "2026-11-14", sources: [...new Map(sources.map(source => [source.url, source])).values()]};
  return {...content, areaCode: input.areaCode, areaName: "地震の臨時情報・後発地震注意情報", issuedAt: null,
    fetchedAt: new Date(now).toISOString(), selection: {eventId: "", events: [], forecastAreas: []}, revision: await revisionOf(content)};
}
