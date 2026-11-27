// JMA technical information 684/685 and the 2026-11-18 VolcanicAshWarning table.
// The official operational dates have not been announced. Set each date only
// after confirming JMA's start notice, code tables and production-feed access.
export const VOLCANIC_ASH_ROLLOUT = Object.freeze({
  forecastStartsAt: null,
  warningStartsAt: null
});

export function isVolcanicAshDisplayEnabled(product, now = Date.now(), rollout = VOLCANIC_ASH_ROLLOUT) {
  const start = rollout?.[product === "forecast" ? "forecastStartsAt" : product === "warning" ? "warningStartsAt" : ""];
  const startMs = typeof start === "string" && /(?:Z|[+-]\d{2}:\d{2})$/u.test(start) ? Date.parse(start) : NaN;
  return Number.isFinite(startMs) && Number.isFinite(now) && now >= startMs;
}

export const VOLCANIC_ASH_DEPTH_LEVELS = Object.freeze([
  { code: "31", amount: "ash-31", label: "0.1mm未満", minimumMm: null, maximumMmExclusive: 0.1, color: "#c8cdd3", opacity: 0.16 },
  { code: "32", amount: "ash-32", label: "0.1mm以上", minimumMm: 0.1, maximumMmExclusive: null, color: "#b8bec5", opacity: 0.2 },
  { code: "33", amount: "ash-33", label: "1mm以上", minimumMm: 1, maximumMmExclusive: null, color: "#a4abb4", opacity: 0.26 },
  { code: "34", amount: "ash-34", label: "1cm以上", minimumMm: 10, maximumMmExclusive: null, color: "#9099a5", opacity: 0.32 },
  { code: "35", amount: "ash-35", label: "3cm以上", minimumMm: 30, maximumMmExclusive: null, color: "#7c8796", opacity: 0.38 },
  { code: "36", amount: "ash-36", label: "10cm以上", minimumMm: 100, maximumMmExclusive: null, color: "#687586", opacity: 0.44 },
  { code: "37", amount: "ash-37", label: "30cm以上", minimumMm: 300, maximumMmExclusive: null, color: "#536477", opacity: 0.5 }
].map(Object.freeze));

const depthByCode = new Map(VOLCANIC_ASH_DEPTH_LEVELS.map(level => [level.code, level]));
const legacyAmounts = new Map([["71", "light"], ["72", "moderate"], ["73", "heavy"]]);
const normalize = value => String(value ?? "").normalize("NFKC").trim();

// Forecast polygons are cumulative thresholds, not disjoint depth intervals.
// Preserve the original code/name, including unknown future categories.
export function classifyVolcanicAshKind(name, code, format = "legacy") {
  const kindName = normalize(name);
  const kindCode = normalize(code);
  const modern = format === "volcanic-ash";
  const cindersCode = modern ? "40" : "75";
  if (kindCode === cindersCode || (!kindCode && kindName === "小さな噴石の落下")) {
    return { category: "small-cinders", amount: "unknown", known: true, depth: null };
  }
  if (modern) {
    const level = kindCode ? depthByCode.get(kindCode) : VOLCANIC_ASH_DEPTH_LEVELS.find(item => `${item.label}の火山灰` === kindName);
    if (level) return { category: "ashfall", amount: level.amount, known: true,
      depth: { minimumMm: level.minimumMm, maximumMmExclusive: level.maximumMmExclusive } };
    if (kindCode === "30" || (!kindCode && kindName === "火山灰")) {
      return { category: "ashfall", amount: "unknown", known: true, depth: null };
    }
  } else {
    const amount = kindCode ? legacyAmounts.get(kindCode)
      : kindName.includes("やや多量") ? "moderate" : kindName.includes("多量") ? "heavy" : kindName.includes("少量") ? "light" : null;
    if (amount) return { category: "ashfall", amount, known: true, depth: null };
    if (kindCode === "70" || (!kindCode && /降灰/u.test(kindName))) {
      return { category: "ashfall", amount: "unknown", known: true, depth: null };
    }
  }
  return { category: "unknown", amount: "unknown", known: false, depth: null };
}

const warningCategories = new Map([
  ["00", { severity: 0, active: false }], ["01", { severity: 1, active: true }],
  ["02", { severity: 2, active: true }], ["03", { severity: 3, active: true }],
  ["11", { severity: 0, active: false }], ["12", { severity: 0, active: false }],
  ["13", { severity: 0, active: false }]
]);

export function classifyVolcanicAshWarning(code) {
  const category = warningCategories.get(String(code ?? "").trim());
  return category ? { ...category, known: true } : { severity: null, active: null, known: false };
}

// VFVO70 is one nationwide snapshot, independent of volcano EventID/Serial.
// Do not merge old cities into a newer snapshot or convert missing data to clear.
export function buildVolcanicAshWarningState(reports, { previousReport = null, sourceAvailable = true } = {}) {
  const candidates = [...(reports ?? []), previousReport].filter(report => report
    && report.productType === "volcanic-ash-warning" && report.isOperational === true
    && report.isUsable === true);
  candidates.sort((left, right) => Date.parse(right.reportTimeRaw) - Date.parse(left.reportTimeRaw)
    || Date.parse(right.controlTimeRaw || right.reportTimeRaw) - Date.parse(left.controlTimeRaw || left.reportTimeRaw)
    || Number(right.infoType === "訂正") - Number(left.infoType === "訂正"));
  const report = candidates[0] ?? null;
  const hasUnusableUpdate = (reports ?? []).some(item => item?.isOperational === true && item?.isUsable !== true
    && (!report || !Number.isFinite(Date.parse(item.reportTimeRaw)) || Date.parse(item.reportTimeRaw) >= Date.parse(report.reportTimeRaw)));
  return {
    status: report ? (sourceAvailable && !hasUnusableUpdate ? "available" : "stale") : "unavailable",
    report,
    regions: report?.regions ?? [],
    activeRegions: (report?.regions ?? []).filter(region => region.active === true),
    unknownRegions: (report?.regions ?? []).filter(region => region.active === null),
    sources: report?.sources ?? []
  };
}

export function isNewVolcanicAshForecast(report) {
  return report?.ashForecastFormat === "volcanic-ash"
    || report?.ashForecasts?.some(forecast => forecast.format === "volcanic-ash") === true;
}

export function partitionVolcanicAshProducts(reports, { now = Date.now(), rollout = VOLCANIC_ASH_ROLLOUT } = {}) {
  const operational = (reports ?? []).filter(report => report && report.isOperational !== false);
  const warningReports = operational.filter(report => report.productType === "volcanic-ash-warning");
  const volcanoReports = operational.filter(report => report.productType !== "volcanic-ash-warning");
  const newForecastReports = volcanoReports.filter(isNewVolcanicAshForecast);
  const forecastDisplayEnabled = isVolcanicAshDisplayEnabled("forecast", now, rollout);
  return {
    visibleReports: forecastDisplayEnabled ? volcanoReports : volcanoReports.filter(report => !isNewVolcanicAshForecast(report)),
    newForecastReports,
    warningReports,
    forecastDisplayEnabled,
    warningDisplayEnabled: isVolcanicAshDisplayEnabled("warning", now, rollout)
  };
}
