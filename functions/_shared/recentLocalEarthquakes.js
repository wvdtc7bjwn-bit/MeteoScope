import { fetchWarningChatJson, getWarningChatArea, JMA_BOSAI, revisionOf, validIssueTime } from "./warningChatSources.js";
import { selectEntries, validateReport, earthquakeSummary } from "./seismicChatContext.js";

export const RECENT_LOCAL_EARTHQUAKE_LIMIT = 10;
const CONCURRENCY = 3;
const jst = value => value ? new Date(Date.parse(value) + 9 * 3600_000).toISOString().slice(0, 16).replace("T", " ") + " JST" : null;

// Bounded reads from JMA's existing recent list; no new service, database or
// background polling. A missing city observation never becomes intensity zero.
export async function loadRecentLocalEarthquakes(areaCode, {fetcher = fetch, fresh = false, now = Date.now()} = {}) {
  const {areaName} = await getWarningChatArea(areaCode, {fetcher, fresh, now});
  const base = `${JMA_BOSAI}/quake/data/`;
  const read = url => fetchWarningChatJson(url, {fetcher, fresh});
  const index = selectEntries(await read(base + "list.json"), "earthquake", now);
  const eventTime = entry => validIssueTime(entry.at, now) ? Date.parse(entry.at) : Date.parse(entry.rdt);
  const entries = [...index.events].sort((a, b) => eventTime(b) - eventTime(a)).slice(0, RECENT_LOCAL_EARTHQUAKE_LIMIT);
  const results = new Array(entries.length);
  let next = 0;
  await Promise.all(Array.from({length: Math.min(CONCURRENCY, entries.length)}, async () => {
    while (next < entries.length) {
      const i = next++;
      const entry = entries[i];
      try {
        const raw = await read(base + entry.json);
        const head = validateReport(raw, entry, now);
        if (head.InfoType === "取消") { results[i] = {state: "cancelled"}; continue; }
        if (!raw.Body?.Earthquake && !raw.Body?.Intensity) throw new Error("missing_seismic_body");
        const quake = earthquakeSummary(raw, areaCode, now);
        results[i] = {state: "checked", quake};
      } catch {
        // No source content, questions or personal data in diagnostics.
        console.warn("[warning-chat] recent earthquake source unavailable");
        results[i] = {state: "unavailable"};
      }
    }
  }));
  const matches = results.flatMap((result, i) => result.quake?.selectedMunicipalityIntensity ? [{
    eventId: entries[i].eid, eventTime: result.quake.eventTime, eventTimeJst: jst(result.quake.eventTime),
    issuedAt: entries[i].rdt, location: result.quake.location,
    magnitude: result.quake.magnitude, depthKm: result.quake.depthKm,
    observedIntensity: result.quake.selectedMunicipalityIntensity
  }] : []);
  const summary = {
    limit: RECENT_LOCAL_EARTHQUAKE_LIMIT, listedEventCount: index.events.length, searchedCount: entries.length,
    unavailableCount: results.filter(result => result.state === "unavailable").length,
    cancelledCount: results.filter(result => result.state === "cancelled").length,
    unconfirmedMunicipalityCount: results.filter(result => result.state === "checked" && !result.quake.selectedMunicipalityIntensity).length,
    unsearchedCount: Math.max(0, index.events.length - entries.length), matches,
    scope: "取得した気象庁の最近の地震一覧から新しい順の最大10地震を確認。全期間の履歴検索ではありません。掲載なし・未取得は震度0や地震なしを意味しません。震源地や区域最大震度から市区町村の観測震度を推測しません。"
  };
  const context = {
    topic: "earthquake", earthquakeScope: "recent-local", areaCode, areaName,
    fetchedAt: new Date(now).toISOString(), issuedAt: entries[0]?.rdt ?? null,
    availability: entries.length ? "available" : "empty", earthquake: null,
    recentEarthquakes: summary, selection: {eventId: "", events: [], forecastAreas: []},
    explanation: "「ここ」は選択された市区町村です。実際の現在地を推測しません。各地震の市区町村に発表された観測震度を比較した資料で、現在の揺れや今後の地震の予測ではありません。",
    sources: [{title: "気象庁 最近の地震一覧", url: `${JMA_BOSAI}/quake/`},
      ...entries.map(entry => ({title: "照会した気象庁地震電文（JSON）", url: base + entry.json}))]
  };
  context.revision = await revisionOf({...context, fetchedAt: undefined});
  return context;
}
