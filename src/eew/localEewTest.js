import { normalizeWolfxEew } from "./wolfxEew.js";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export const LOCAL_EEW_TEST_SCENARIOS = Object.freeze([
  "forecast",
  "warning",
  "one-point",
  "plum",
  "assumption",
  "final",
  "cancel"
]);

export function isLocalEewTestEnvironment(locationLike = globalThis.location) {
  const hostname = String(locationLike?.hostname ?? "").trim().toLowerCase();
  return LOCAL_HOSTNAMES.has(hostname);
}

function formatJstDateTime(timestamp) {
  const date = new Date(timestamp + 9 * 60 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, "0");
  return `${date.getUTCFullYear()}/${pad(date.getUTCMonth() + 1)}/${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`;
}

function buildPayload(scenario, now) {
  const common = {
    Title: "緊急地震速報（予報）",
    CodeType: "JMA_EEW",
    Issue: { Source: "気象庁", Status: "通常" },
    EventID: `LOCAL-EEW-TEST-${scenario}`,
    Serial: 1,
    AnnouncedTime: formatJstDateTime(now),
    OriginTime: formatJstDateTime(now - 15_000),
    Hypocenter: "茨城県南部",
    Latitude: 36.05,
    Longitude: 140.12,
    Depth: 40,
    Magnitude: 5.8,
    MaxIntensity: "5弱",
    isWarn: false,
    isFinal: false,
    isCancel: false,
    isAssumption: false,
    WarnArea: [
      { Code: "311", Chiiki: "茨城県南部", Shindo1: "5弱", Shindo2: "6弱", Type: "Forecast", Arrive: false },
      { Code: "310", Chiiki: "茨城県北部", Shindo1: "4", Shindo2: "5弱", Type: "Forecast", Arrive: false }
    ]
  };

  if (scenario === "forecast") return common;
  if (scenario === "warning") return { ...common, Title: "緊急地震速報（警報）", isWarn: true, MaxIntensity: "6弱" };
  if (scenario === "one-point") {
    return { ...common, MaxIntensity: "3", OriginalText: "1観測点の解析結果に基づく緊急地震速報（予報）" };
  }
  if (scenario === "plum") {
    return { ...common, isWarn: true, isPlum: true, isAssumption: true, OriginalText: "PLUM法による緊急地震速報（警報）" };
  }
  if (scenario === "assumption") {
    return { ...common, isAssumption: true, OriginalText: "仮定震源要素を使用した緊急地震速報（予報）" };
  }
  if (scenario === "final") return { ...common, Serial: 5, isFinal: true };
  if (scenario === "cancel") {
    return { ...common, Serial: 4, isCancel: true, Latitude: null, Longitude: null, Depth: null, Magnitude: null, WarnArea: [] };
  }
  return null;
}

export function createLocalEewTestEvent(scenario, { now = Date.now() } = {}) {
  if (!LOCAL_EEW_TEST_SCENARIOS.includes(scenario)) return null;
  const event = normalizeWolfxEew(buildPayload(scenario, now), {
    receivedAt: now,
    transport: "local-test"
  });
  if (!event) return null;
  return {
    ...event,
    source: "ローカルEEW動作テスト",
    isLocalTest: true
  };
}
