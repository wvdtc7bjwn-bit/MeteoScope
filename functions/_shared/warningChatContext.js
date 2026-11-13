import { fetchWarningChatJson, getWarningChatArea, validIssueTime, revisionOf } from "./warningChatSources.js";
import { loadSeismicChatContext } from "./seismicChatContext.js";
export { fetchWarningChatJson } from "./warningChatSources.js";
import { applyWarningKinds } from "../../src/jma/warningCore.js";
import { buildWarningOutlookMap } from "../../src/jma/warnings.js";
import { parseWarningOutlookDurationHours } from "../../src/warningOutlookTime.js";

const JMA = "https://www.jma.go.jp/bosai";
export const WARNING_CHAT_SOURCES = Object.freeze([
  { title: "気象庁 時系列情報の説明", url: "https://www.jma.go.jp/jma/kishou/know/bosai/warning_irowake.html" },
  { title: "気象庁 警報・注意報の説明", url: "https://www.jma.go.jp/jma/kishou/know/faq/faq10.html" }
]);
export async function loadWarningChatContext(areaCode, options = {}) {
  const topic = options.topic ?? "weather";
  if (topic === "earthquake" || topic === "tsunami") return loadSeismicChatContext(areaCode, options);
  if (topic !== "weather") throw new TypeError("質問する情報を選択してください。");
  return loadWeatherChatContext(areaCode, options);
}

async function loadWeatherChatContext(areaCode, { fetcher = fetch, fresh = false, now = Date.now() } = {}) {
  if (!/^\d{7}$/u.test(areaCode)) throw new TypeError("invalid_area");
  const read = (url) => fetchWarningChatJson(url, { fetcher, fresh });
  const { catalog, area, class10Code, officeCode } = await getWarningChatArea(areaCode, { fetcher, fresh, now });
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
    topic: "weather", areaCode, areaName: `${catalog.offices?.[officeCode]?.name ?? ""} ${area.name}`.trim(), issuedAt,
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
