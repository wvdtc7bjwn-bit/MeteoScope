import { escapeHtml } from "../utils/html.js";
import { getLongPeriodClassLabel, normalizeLongPeriodClass } from "../earthquake/longPeriodGroundMotion.js";
import { localizeText } from "./locale.js";

const text = value => escapeHtml(localizeText(value));
function classMarkup(value) {
  const grade = normalizeLongPeriodClass(value);
  return `<span class="long-period-class${grade === null ? "" : ` grade-${grade}`}">${text(getLongPeriodClassLabel(value))}</span>`;
}

export function renderLongPeriodSummary(report) {
  const grade = normalizeLongPeriodClass(report?.maxClass);
  if (report?.status === "cancelled" || grade === null || grade < 1) return "";
  const label = `${localizeText("長周期地震動")} ${localizeText("最大階級")}${grade}`;
  return `<span class="mobile-dock-earthquake-long-period grade-${grade}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">${text("最大階級")}${grade}</span>`;
}

export function renderLongPeriodGroundMotion(report) {
  if (!report) return "";
  const cancelled = report.status === "cancelled";
  const areas = (report.areas ?? []).filter(area => normalizeLongPeriodClass(area.maxClass) !== 0)
    .sort((a, b) => (b.maxClass ?? -1) - (a.maxClass ?? -1));
  const stations = (report.stations ?? []).filter(station => normalizeLongPeriodClass(station.class) !== 0)
    .sort((a, b) => (b.class ?? -1) - (a.class ?? -1));
  const rows = (items, cells) => items.map(item => `<tr>${cells(item)}</tr>`).join("");
  return `<section class="earthquake-long-period" aria-label="${text("長周期地震動")}">
    <header><h4>${text("長周期地震動")}</h4>${cancelled ? `<strong>${text("取消")}</strong>` : `<strong>${text("最大")} ${classMarkup(report.maxClass)}</strong>`}</header>
    <p>${report.source === "jma-history-csv" ? text("気象庁の過去観測データ") : `${text("気象庁発表")} · ${escapeHtml(report.reportTime || "--")}`}${report.status === "corrected" ? ` · ${text("訂正")}` : ""}</p>
    ${cancelled ? `<p>${text("この地震の長周期地震動に関する観測情報は取り消されました。")}</p>` : `
      <p>${text("長周期地震動階級は震度とは異なる指標です。")}</p>
      ${areas.length ? `<details><summary>${text("地域別")} (${areas.length})</summary><div class="long-period-table-scroll"><table><thead><tr><th scope="col">${text("地域")}</th><th scope="col">${text("長周期地震動階級")}</th></tr></thead><tbody>${rows(areas, area => `<th scope="row">${escapeHtml(area.areaName || area.code)}<small>${escapeHtml(area.prefecture)}</small></th><td>${classMarkup(area.maxClass)}</td>`)}</tbody></table></div></details>` : ""}
      ${stations.length ? `<details><summary>${text("観測点別")} (${stations.length})</summary><div class="long-period-table-scroll"><table><thead><tr><th scope="col">${text("観測点")}</th><th scope="col">${text("長周期地震動階級")}</th></tr></thead><tbody>${rows(stations, station => `<th scope="row">${escapeHtml(station.stationName || station.code)}<small>${escapeHtml(station.areaName)}</small></th><td>${classMarkup(station.class)}</td>`)}</tbody></table></div></details>` : ""}
    `}
    <a href="https://www.jma.go.jp/jma/kishou/know/jishin/ltpgm_explain/kaisetsu.html" target="_blank" rel="noopener noreferrer">${text("気象庁の解説")} ↗</a>
  </section>`;
}

export function renderHistoricalLongPeriod(event) {
  return event?.longPeriod ? renderLongPeriodGroundMotion(event.longPeriod) : "";
}
