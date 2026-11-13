import { isNewEarthquakeReport, isSameEarthquake, mergeRealtimeEarthquakes, shouldTemporarilyShowEarthquakeInfo } from "./realtimeEarthquake.js";

// 要約だけを一時切り替える。EEWの状態・地図・波面の寿命には関与しない。
export function createEarthquakeSummaryOverride({
  now = () => Date.now(),
  setTimer = (callback, delay) => setTimeout(callback, delay),
  clearTimer = (timer) => clearTimeout(timer),
  onExpire = () => {}
} = {}) {
  let report = null;
  let expiresAt = 0;
  let timer = null;
  function clear() {
    if (timer !== null) clearTimer(timer);
    timer = null;
    report = null;
    expiresAt = 0;
  }
  return {
    accept(incoming, previousItems = []) {
      if (!shouldTemporarilyShowEarthquakeInfo(incoming) || !isNewEarthquakeReport(incoming, previousItems)) return false;
      // 起動時の履歴や遅延した旧電文では割り込まない。
      const issuedAt = Date.parse(incoming.reportTimeRaw ?? "");
      if (!Number.isFinite(issuedAt) || now() - issuedAt > 120_000 || issuedAt - now() > 30_000) return false;
      clear();
      report = mergeRealtimeEarthquakes(previousItems, [incoming]).find((item) => isSameEarthquake(item, incoming));
      expiresAt = now() + 10_000;
      timer = setTimer(() => { clear(); onExpire(); }, 10_000);
      return true;
    },
    get() { return now() < expiresAt ? report : null; },
    clear
  };
}
