import {fetchWarningChatJson, getWarningChatArea, validIssueTime, revisionOf, JMA_BOSAI} from "./warningChatSources.js";
import {getJmaWeeklyWeatherLabel} from "../../src/ui/weeklyWeatherGlyph.js";
import {weatherChatDate} from "../../src/ai/warningChatWeatherQuery.js";

const number = (value, min, max) => typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
  && Number(value) >= min && Number(value) <= max ? Number(value) : null;
const text = value => typeof value === "string" ? value.replace(/\s+/gu, " ").trim().slice(0, 180) : "";
const freshReport = (report, now) => validIssueTime(report?.reportDatetime, now)
  && now - Date.parse(report.reportDatetime) <= 36 * 3600_000 && Array.isArray(report.timeSeries);

export async function loadWeatherForecastChatContext(areaCode, options = {}) {
  const {fetcher = fetch, fresh = false, now = Date.now()} = options;
  const {catalog, class10Code, officeCode, areaName} = await getWarningChatArea(areaCode, {fetcher, fresh, now});
  let sourceOfficeCode = officeCode;
  let url = `${JMA_BOSAI}/forecast/data/forecast/${officeCode}.json`;
  const [own, mappingResult] = await Promise.allSettled([
    fetchWarningChatJson(url, {fetcher, fresh}),
    fetchWarningChatJson(`${JMA_BOSAI}/forecast/const/week_area.json`, {fetcher})
  ]);
  if (mappingResult.status !== "fulfilled") throw mappingResult.reason;
  const mappings = mappingResult.value;
  let raw = own.status === "fulfilled" ? own.value : null;
  // Some offices (e.g. Tokachi) publish through a related office. Resolve that
  // relationship from JMA's mapping and require the requested short-term area.
  if (!raw) {
    const weeks = new Set((mappings?.[officeCode] ?? []).map(item => item.week));
    const related = Object.entries(mappings ?? {}).filter(([code,items]) => code !== officeCode && /^\d{6}$/u.test(code)
      && Array.isArray(items) && items.some(item => weeks.has(item.week))).slice(0,3);
    for (const [code] of related) {
      const candidateUrl = `${JMA_BOSAI}/forecast/data/forecast/${code}.json`;
      try {
        const candidate = await fetchWarningChatJson(candidateUrl, {fetcher, fresh});
        if (Array.isArray(candidate) && candidate.some(report => report.timeSeries?.some(series => series.areas?.some(item => String(item.area?.code) === class10Code && Array.isArray(item.weathers))))) {
          raw = candidate; sourceOfficeCode = code; url = candidateUrl; break;
        }
      } catch { /* No substitute until its requested area has been confirmed. */ }
    }
    if (!raw) throw new Error("forecast_for_selected_office_unavailable");
  }
  if (!Array.isArray(raw)) throw new Error("invalid_forecast_source");
  const candidates = (mappings?.[officeCode] ?? []).filter(item => item.srf === class10Code);
  const match = (series, code) => series?.areas?.find(item => String(item.area?.code) === code);
  const today = weatherChatDate(now);
  const days = new Map();
  const day = date => { if (!days.has(date)) days.set(date, {date}); return days.get(date); };
  const reports = raw.filter(report => freshReport(report, now));
  const short = reports.find(report => report.timeSeries.some(series => series.areas?.some(item => Array.isArray(item.weathers))));
  const weekly = reports.find(report => report.timeSeries.some(series => series.areas?.some(item => Array.isArray(item.reliabilities))));
  let shortArea = null, weeklyArea = null;
  const precipitationSlots = [];
  // Weekly values first; a newer, more detailed short-term forecast wins.
  if (weekly) {
    const series = weekly.timeSeries.find(series => series.areas?.some(item => Array.isArray(item.weatherCodes)));
    const codes = [class10Code, ...candidates.map(item => String(item.week))];
    const selected = codes.map(code => match(series, code)).find(Boolean);
    if (selected) {
      weeklyArea = selected.area;
      const mapping = candidates.find(item => item.week === selected.area.code);
      const temps = weekly.timeSeries.map(series => [series, match(series, String(mapping?.amedas ?? ""))]).find(([, item]) => item && Array.isArray(item.tempsMin));
      series.timeDefines?.forEach((time, i) => {
        if (!validIssueTime(time, Date.parse("2100-01-01T00:00:00Z"))) return;
        const date = weatherChatDate(Date.parse(time));
        const row = day(date);
        Object.assign(row, {weather: getJmaWeeklyWeatherLabel(selected.weatherCodes?.[i]), pop: number(selected.pops?.[i], 0, 100),
          reliability: /^[ABC]$/u.test(selected.reliabilities?.[i]) ? selected.reliabilities[i] : null,
          areaName: selected.area.name, issuedAt: weekly.reportDatetime});
        if (temps) {
          const ti = temps[0].timeDefines.findIndex(value => weatherChatDate(Date.parse(value)) === date);
          row.temperature = {stationName: temps[1].area.name, stationCode: temps[1].area.code,
            minC: number(temps[1].tempsMin?.[ti], -90, 60), maxC: number(temps[1].tempsMax?.[ti], -90, 60), issuedAt: weekly.reportDatetime};
        }
      });
    }
  }
  if (short) {
    const series = short.timeSeries.find(series => Array.isArray(match(series, class10Code)?.weathers));
    const selected = match(series, class10Code);
    if (selected) {
      shortArea = selected.area;
      series.timeDefines?.forEach((time, i) => {
        const date = weatherChatDate(Date.parse(time));
        // Never overwrite a newer bulletin with an older report.
        if (days.get(date)?.issuedAt && Date.parse(days.get(date).issuedAt) > Date.parse(short.reportDatetime)) return;
        Object.assign(day(date), {weather: text(selected.weathers?.[i]), wind: text(selected.winds?.[i]), waves: text(selected.waves?.[i]),
          areaName: selected.area.name, issuedAt: short.reportDatetime});
      });
      for (const ts of short.timeSeries) {
        const pops = match(ts, class10Code);
        if (Array.isArray(pops?.pops)) ts.timeDefines.forEach((start, i) => {
          const percent = number(pops.pops[i], 0, 100), end = new Date(Date.parse(start) + 6 * 3600_000).toISOString();
          if (percent !== null && Date.parse(end) > now) precipitationSlots.push({start, end, percent});
        });
      }
      const preferred = candidates.find(item => item.week === class10Code) ?? candidates[0];
      const temps = short.timeSeries.map(series => [series, match(series, String(preferred?.amedas ?? ""))]).find(([, item]) => Array.isArray(item?.temps));
      if (temps) temps[0].timeDefines.forEach((time, i) => {
        const date = weatherChatDate(Date.parse(time)), hour = new Date(Date.parse(time) + 9 * 3600_000).getUTCHours();
        const value = number(temps[1].temps[i], -90, 60);
        // The repeated same-day midnight value is NOT a minimum temperature.
        const field = hour === 9 ? "maxC" : hour === 0 && date > weatherChatDate(Date.parse(short.reportDatetime)) ? "minC" : null;
        if (value === null || !field || !days.has(date)) return;
        const row = day(date);
        if (row.temperature && Date.parse(row.temperature.issuedAt) > Date.parse(short.reportDatetime)) return;
        if (!row.temperature || row.temperature.stationCode !== temps[1].area.code) row.temperature = {stationCode: temps[1].area.code, stationName: temps[1].area.name, minC: null, maxC: null};
        row.temperature[field] = value; row.temperature.issuedAt = short.reportDatetime;
      });
    }
  }
  const forecastDays = [...days.values()].filter(row => row.date >= today && row.date < weatherChatDate(now + 8 * 86400_000) && row.weather).sort((a,b) => a.date.localeCompare(b.date));
  if (!forecastDays.length) throw new Error("forecast_for_selected_area_unavailable");
  const context = {topic: "weather", weatherScope: "forecast", areaCode, areaName, todayJst: today, fetchedAt: new Date(now).toISOString(),
    issuedAt: forecastDays.map(row => row.issuedAt).sort().at(-1),
    forecast: {shortTermArea: shortArea, weeklyArea, days: forecastDays, precipitationSlots},
    limitations: "気象庁の区域予報。市区町村や現在地の点予報・実況ではない。気温は記載した予報地点の値。降水確率は雨量ではない。空欄は0ではなく未提供。掲載日以外・1時間ごとの天気・独自の降雨開始時刻は予測しない。",
    sources: [{title: "気象庁 天気予報", url: `${JMA_BOSAI}/forecast/#area_type=offices&area_code=${sourceOfficeCode}`},
      {title: "気象庁 予報データ", url}, {title: "気象庁 天気予報の説明", url: "https://www.jma.go.jp/jma/kishou/know/kurashi/yoho.html"}]};
  context.revision = await revisionOf({areaCode, forecast: context.forecast});
  return context;
}
