import { LONG_PERIOD_HISTORY_LIST_URL, parseLongPeriodHistoryCatalog, findLongPeriodHistoryRecord, parseLongPeriodHistoryCsv } from "../../src/jma/longPeriodHistory.js";
import { parseJstDateTime } from "../../src/utils/jstDateTime.js";

async function cachedLoad(url, signal, seconds, parse) {
  const cache = globalThis.caches?.default;
  const key = new Request(url);
  const cached = await cache?.match(key).catch(() => null);
  if (cached) {
    try { return await parse(cached); }
    catch { await cache.delete(key).catch(() => {}); }
  }
  const response = await fetch(url, { signal, headers: { accept: "text/html,text/csv,*/*" } });
  if (!response.ok) throw new Error(`JMA long-period HTTP ${response.status}`);
  const value = await parse(response.clone());
  const result = new Response(response.body, { headers: { "cache-control": `public, max-age=${seconds}` } });
  if (cache) await cache.put(key, result.clone()).catch(() => {});
  return value;
}

export async function fetchHistoricalLongPeriod(hypocenter, signal, timeBudgetMs = 8000) {
  const time = parseJstDateTime(hypocenter.originTime);
  if (!time || Date.parse(time) < Date.parse("2013-03-28T00:00:00+09:00")) return { longPeriod: null, longPeriodStatus: "unsupported" };
  if (timeBudgetMs <= 0) return { longPeriod: null, longPeriodStatus: "unavailable" };
  try {
    const boundedSignal = AbortSignal.any([signal, AbortSignal.timeout(Math.ceil(timeBudgetMs))]);
    const catalogue = await cachedLoad(LONG_PERIOD_HISTORY_LIST_URL, boundedSignal, 3600,
      async response => parseLongPeriodHistoryCatalog(await response.text()));
    const record = findLongPeriodHistoryRecord(catalogue, hypocenter);
    if (!record) return { longPeriod: null, longPeriodStatus: "not-listed" };
    // Only an ID obtained from the official catalogue is used to construct this URL.
    const url = `https://www.data.jma.go.jp/eew/data/ltpgm_explain/data/past/${record.eventId}//data/level.csv`;
    const longPeriod = await cachedLoad(url, boundedSignal, 86400, async response =>
      parseLongPeriodHistoryCsv(new TextDecoder("shift_jis").decode(await response.arrayBuffer()), record));
    return { longPeriod, longPeriodStatus: "available" };
  } catch (error) {
    signal.throwIfAborted();
    console.warn("[long-period-history] observation unavailable", error?.message);
    return { longPeriod: null, longPeriodStatus: "unavailable" };
  }
}
