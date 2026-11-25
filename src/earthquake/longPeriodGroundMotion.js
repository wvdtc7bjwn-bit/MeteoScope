import { getObservationColorScheme } from "../preferences/observationColors.js";
import { JMA_LONG_PERIOD_COLORS } from "../jma/observationColors.js";

const METEOSCOPE_COLORS = { 1: "#00a9e8", 2: "#f2dd00", 3: "#ed4c17", 4: "#a50082" };
export function getLongPeriodClassStyle(value) {
  const jma = getObservationColorScheme("longPeriod") === "jma";
  const grade = normalizeLongPeriodClass(value);
  return { color: (jma ? JMA_LONG_PERIOD_COLORS : METEOSCOPE_COLORS)[grade] ?? null,
    textColor: grade === 1 ? (jma ? "#ffffff" : "#081628") : grade === 2 ? "#141414" : "#ffffff" };
}

// CSS variables also update badges retained in an expanded history card.
export function applyLongPeriodColors(root) {
  for (let grade = 1; grade <= 4; grade++) {
    const style = getLongPeriodClassStyle(grade);
    root.style.setProperty(`--long-period-${grade}-bg`, style.color);
    root.style.setProperty(`--long-period-${grade}-ink`, style.textColor);
  }
}

// Long-period observations are a separate JMA product, not a seismic-intensity report.
export function normalizeLongPeriodClass(value) {
  const text = String(value ?? "").trim();
  return /^[0-4]$/.test(text) ? Number(text) : null;
}

export function getLongPeriodClassLabel(value) {
  const grade = normalizeLongPeriodClass(value);
  return grade === null ? "未取得" : grade === 0 ? "階級1未満" : `階級${grade}`;
}

export function selectLatestLongPeriodReport(left, right) {
  if (!left) return right ?? null;
  if (!right) return left;
  // Never combine products belonging to different earthquakes.
  if (!left.eventId || left.eventId !== right.eventId) return left;
  const time = report => Date.parse(report.reportTimeRaw) || 0;
  const issued = report => Date.parse(report.issuedAtRaw) || 0;
  const statusRank = { issued: 0, corrected: 1, cancelled: 2 };
  const delta = time(right) - time(left) || issued(right) - issued(left)
    || (Number(right.serial) || 0) - (Number(left.serial) || 0)
    || (statusRank[right.status] ?? 0) - (statusRank[left.status] ?? 0);
  // Replace the entire observation snapshot, including lower corrected values.
  return delta > 0 ? right : left;
}

export function attachLongPeriodReports(earthquakes, reports) {
  const byEvent = new Map();
  for (const report of reports ?? []) {
    if (!report?.eventId || report.training) continue;
    byEvent.set(report.eventId, selectLatestLongPeriodReport(byEvent.get(report.eventId), report));
  }
  return (earthquakes ?? []).map(earthquake => {
    const report = byEvent.get(earthquake.eventId);
    return report ? { ...earthquake, longPeriod: selectLatestLongPeriodReport(earthquake.longPeriod, report) } : earthquake;
  });
}
