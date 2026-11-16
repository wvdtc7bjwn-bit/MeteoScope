import {fetchWarningChatJson, getWarningChatArea, validIssueTime, revisionOf, JMA_BOSAI} from "./warningChatSources.js";
import {buildAreaHierarchy, buildEarlyWarningData, buildNoWaveTideIndex, normalizeEarlyWarningType} from "../../src/jma/warnings.js";
import {parseWarningOutlookDurationHours} from "../../src/warningOutlookTime.js";
import {weatherChatDate} from "../../src/ai/warningChatWeatherQuery.js";

export async function loadEarlyWarningChatContext(areaCode, options = {}) {
  const {fetcher = fetch, fresh = false, now = Date.now()} = options;
  const {catalog, area, areaName, class10Code} = await getWarningChatArea(areaCode, {fetcher, fresh, now});
  const url = `${JMA_BOSAI}/probability/data/probability/r8/map.json`;
  const [raw, weeklyMapping, noWaveTide] = await Promise.all([
    fetchWarningChatJson(url, {fetcher, fresh}),
    fetchWarningChatJson(`${JMA_BOSAI}/forecast/const/week_area05.json`, {fetcher}),
    fetchWarningChatJson(`${JMA_BOSAI}/warning/const/no_wave_tide.json`, {fetcher})
  ]);
  if (!Array.isArray(raw) || !weeklyMapping || !noWaveTide) throw new Error("invalid_early_warning_source");
  const index = {byCode: new Map([[areaCode, {code: areaCode, name: area.name}]]), byParentCode: new Map()};
  const hierarchy = buildAreaHierarchy(catalog, index, weeklyMapping);
  const slotIssues = new Map();
  const reports = raw.flat().filter(report => validIssueTime(report?.reportDatetime, now)
    && now - Date.parse(report.reportDatetime) <= 36 * 3600_000 && Array.isArray(report.timeSeries))
    .sort((a,b) => Date.parse(b.reportDatetime)-Date.parse(a.reportDatetime))
    .map(report => ({...report, timeSeries: report.timeSeries.map(series => ({...series, areas: (series.areas ?? [])
      .filter(item => hierarchy.getDisplayAreaCodes(String(item.code)).includes(class10Code))
      .map(item => ({...item, properties: (item.properties ?? []).map(property => ({...property,
        probabilities: (property.probabilities ?? []).map((value,index) => {
          const key = `${normalizeEarlyWarningType(property.type)}|${series.timeDefines?.[index]}`;
          // A newer empty value clears an older high/medium entry. The shared
          // display merger may otherwise keep the higher severity.
          if (slotIssues.has(key)) return "なし";
          slotIssues.set(key, report.reportDatetime);
          return value;
        })
      }))}))}))}));
  const exclusions = buildNoWaveTideIndex(noWaveTide);
  const result = buildEarlyWarningData(reports, index, hierarchy, exclusions);
  const selected = result.areas.find(item => item.areaCode === class10Code);
  if (!selected) throw new Error("early_warning_for_selected_area_unavailable");
  const localPath = [class10Code, area.parent, areaCode];
  const rows = selected.rows.filter(row => !(row.type === "波浪" && localPath.some(code => exclusions.wave.has(code)))
    && !(row.type === "高潮" && localPath.some(code => exclusions.tide.has(code)))).map(row => ({type: row.type, slots: row.slots.filter(slot => slot.available !== false).map(slot => ({
    start: slot.time, end: new Date(Date.parse(slot.time) + parseWarningOutlookDurationHours(slot.duration) * 3600_000).toISOString(),
    level: slot.label === "高" || slot.label === "中" ? slot.label : "掲載なし",
    issuedAt: slotIssues.get(`${row.type}|${slot.time}`) ?? selected.updatedAt
  })).filter(slot => Date.parse(slot.end) > now)})).filter(row => row.slots.length);
  if (!rows.length) throw new Error("early_warning_period_unavailable");
  const context = {topic: "weather", weatherScope: "early", areaCode, areaName, todayJst: weatherChatDate(now), issuedAt: selected.updatedAt, fetchedAt: new Date(now).toISOString(),
    earlyWarning: {areaCode: selected.areaCode, areaName: selected.areaName, rows},
    explanation: "早期注意情報は警報級の現象の可能性を［高］［中］で示す見通し。発表中の警報ではない。［中］も警報級の可能性がある。掲載なしは安全や警報発表がないことの保証ではない。対象外・未提供の現象は不明。",
    limitations: "気象庁の予報区域の見通しであり、市区町村単位の危険度・避難指示・警報発表や解除の確定時刻ではない。降水確率の数値には換算しない。",
    sources: [{title: "気象庁 早期注意情報（警報級の可能性）", url: `${JMA_BOSAI}/probability/#area_type=class10s&area_code=${class10Code}`},
      {title: "気象庁 早期注意情報データ", url}, {title: "気象庁 早期注意情報の説明", url: "https://www.jma.go.jp/jma/kishou/know/bosai/prob_warning.html"}]};
  context.revision = await revisionOf({areaCode, todayJst: context.todayJst, issuedAt: context.issuedAt, earlyWarning: context.earlyWarning});
  return context;
}
