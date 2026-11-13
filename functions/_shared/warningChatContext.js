import { applyWarningKinds } from "../../src/jma/warningCore.js";
import { buildWarningOutlookMap } from "../../src/jma/warnings.js";
import { parseWarningOutlookDurationHours } from "../../src/warningOutlookTime.js";

const JMA = "https://www.jma.go.jp/bosai";
export const WARNING_CHAT_SOURCES = Object.freeze([
  { title: "気象庁 時系列情報の説明", url: "https://www.jma.go.jp/jma/kishou/know/bosai/warning_irowake.html" },
  { title: "気象庁 警報・注意報の説明", url: "https://www.jma.go.jp/jma/kishou/know/faq/faq10.html" }
]);
const MAX_SOURCE_BYTES = 2 * 1024 * 1024;
const areaCatalogs = new WeakMap();

export async function fetchWarningChatJson(url, { fetcher = fetch, fresh = false } = {}) {
  // Workers does not implement redirect:"error". Reject 3xx via !ok without
  // following Location, preserving the fixed-source boundary on every runtime.
  const response = await fetcher(url, { signal: AbortSignal.timeout(8000), redirect: "manual", cf: { cacheTtl: fresh ? 0 : 20 }, headers: { Accept: "application/json" } });
  if (!response.ok || !response.body) throw new Error("jma_unavailable");
  const reader = response.body.getReader();
  let size = 0;
  const chunks = [];
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_SOURCE_BYTES) throw new Error("jma_response_too_large");
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

export async function loadWarningChatContext(areaCode, { fetcher = fetch, fresh = false, now = Date.now() } = {}) {
  if (!/^\d{7}$/u.test(areaCode)) throw new TypeError("invalid_area");
  const read = (url) => fetchWarningChatJson(url, { fetcher, fresh });
  // Static hierarchy only: avoid reparsing every municipality for each question.
  // Warnings and outlooks are still fetched again, including after inference.
  let cachedCatalog = areaCatalogs.get(fetcher);
  if (!cachedCatalog || cachedCatalog.expiresAt <= now) {
    cachedCatalog = { value: await read(`${JMA}/common/const/area.json`), expiresAt: now + 3600_000 };
    areaCatalogs.set(fetcher, cachedCatalog);
  }
  const catalog = cachedCatalog.value;
  const area = catalog.class20s?.[areaCode];
  const class10Code = catalog.class15s?.[area?.parent]?.parent;
  const class10 = catalog.class10s?.[class10Code];
  const officeCode = class10?.parent;
  if (!area?.name || !/^\d{6}$/u.test(officeCode ?? "")) throw new TypeError("area_not_found");
  const warningUrl = `${JMA}/warning/data/r8/${officeCode}.json`;
  const timelineUrl = `${JMA}/warning_timeline/data/${officeCode}.json`;
  const [rawWarnings, timeline] = await Promise.all([
    read(warningUrl),
    read(timelineUrl).catch(() => null)
  ]);
  const reports = (Array.isArray(rawWarnings) ? rawWarnings : [rawWarnings]);
  if (!reports.length || reports.some((report) => !Array.isArray(report?.warning?.class20Items) || !validIssueTime(report.reportDatetime, now))) throw new Error("invalid_warning_source");
  const matching = reports.filter((report) => report.warning.class20Items.some((item) => String(item.areaCode) === areaCode));
  // An absent municipality must not be interpreted as 'no warning'.
  if (!matching.length) throw new Error("municipality_not_in_source");
  let warnings = [];
  let issuedAt = "";
  for (const report of matching.sort((a, b) => Date.parse(a.reportDatetime) - Date.parse(b.reportDatetime))) {
    const kinds = report.warning.class20Items.filter((item) => String(item.areaCode) === areaCode).flatMap((item) => item.kinds ?? []);
    warnings = applyWarningKinds(warnings, kinds, report.reportDatetime);
    issuedAt = report.reportDatetime;
  }
  const timelineValid = Boolean(timeline && validIssueTime(timeline.reportDatetime, now) && now - Date.parse(timeline.reportDatetime) < 12 * 3600_000 && Array.isArray(timeline.timeSeries));
  const ancestors = new Set([areaCode, area.parent, class10Code]);
  const areaIndex = { byCode: new Map([[areaCode, { code: areaCode, name: area.name }]]), byParentCode: new Map() };
  const hierarchy = { collectMunicipalityCodes: (code) => ancestors.has(code) ? [areaCode] : [] };
  const selectedTimeline = timelineValid ? { ...timeline, timeSeries: timeline.timeSeries.map((series) => ({
    ...series,
    class20Items: (series.class20Items ?? []).filter((item) => ancestors.has(String(item.areaCode))),
    class10Items: (series.class10Items ?? []).filter((item) => ancestors.has(String(item.areaCode)))
  })) } : null;
  const outlook = selectedTimeline ? buildWarningOutlookMap([selectedTimeline], areaIndex, hierarchy).get(areaCode) ?? [] : [];
  const context = {
    areaCode, areaName: `${catalog.offices?.[officeCode]?.name ?? ""} ${area.name}`.trim(), issuedAt,
    fetchedAt: new Date(now).toISOString(), timelineIssuedAt: timelineValid ? timeline.reportDatetime : null,
    warnings: warnings.map(({ code, label, status }) => ({ code, label, status })),
    officeHeadlines: [...new Map(matching.map((report) => [report.headlineText, report])).values()]
      .filter((report) => typeof report.headlineText === "string" && report.headlineText.trim()).slice(-3)
      .map((report) => ({ issuedAt: report.reportDatetime, scope: "気象台管内全体。すべての記述が選択した市区町村に該当するとは限りません。", text: report.headlineText })),
    explanation: "警報は解除されるまで有効。雨がやんでも、それまでに降った雨で土砂災害のおそれが残る場合がある。時系列情報は注意報・警報等の基準を超える現象等が見込まれる時間帯であり、解除時刻ではない。見通しが取得できない場合や掲載期間の先は不明。",
    outlook: outlook.map((row) => ({ ...row, slots: row.slots.filter((slot) => {
      const start = Date.parse(slot.time);
      return Number.isFinite(start) && start + parseWarningOutlookDurationHours(slot.duration) * 3600_000 > now;
    }).map((slot) => ({ time: slot.time, duration: slot.duration,
      endTime: new Date(Date.parse(slot.time) + parseWarningOutlookDurationHours(slot.duration) * 3600_000).toISOString(),
      description: slot.label || ({ 5: "特別警報級の見通し", 4: "危険警報級の見通し", 3: "警報級の見通し", 2: "注意報級の見通し" }[slot.level] ?? "基準超過の表示なし")
    })) })).filter((row) => row.slots.length),
    outlookAvailable: timelineValid,
    limitations: "気象警報・注意報と時系列情報が対象。指定河川洪水予報・自治体の避難情報・避難経路は対象外。時系列の終了は警報解除や安全の確約ではない。",
    sources: [{ title: "気象庁 発表状況", url: `${JMA}/warning/#area_type=class20s&area_code=${areaCode}&lang=ja` }, { title: "気象庁 時系列情報", url: timelineUrl }, ...WARNING_CHAT_SOURCES]
  };
  context.revision = await revisionOf({ issuedAt, warnings: context.warnings, officeHeadlines: context.officeHeadlines, outlook: context.outlook, timelineIssuedAt: context.timelineIssuedAt });
  return context;
}

function validIssueTime(value, now) {
  return typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/u.test(value) && Number.isFinite(Date.parse(value)) && Date.parse(value) <= now + 60_000;
}

async function revisionOf(value) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(value)));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
