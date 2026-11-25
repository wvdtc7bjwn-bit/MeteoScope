import { AMEDAS_METRICS, getAmedasDisplayLevels, getAmedasObservationColor, isAmedasColorGradient } from "../config.js";
import { OBSERVATION_COLOR_SCHEMES } from "../preferences/observationColors.js";
import { normalizeAmedasPrecipitationPeriod } from "../amedasPrecipitationPeriod.js";
import { escapeHtml } from "../utils/html.js";
import { localizeText } from "./locale.js";

export function buildAmedasColorLegend(metricId, periodId = "1h") {
  const metric = AMEDAS_METRICS.find(item => item.id === metricId) ?? AMEDAS_METRICS[0];
  const period = normalizeAmedasPrecipitationPeriod(periodId);
  const levels = getAmedasDisplayLevels(metric.id, period);
  const gradient = isAmedasColorGradient(metric.id);
  // Reserve the same number of list rows for every scheme of this metric.
  const gridRowCount = Math.ceil(Math.max(...OBSERVATION_COLOR_SCHEMES.map(scheme => {
    const scale = getAmedasDisplayLevels(metric.id, period, scheme);
    return isAmedasColorGradient(metric.id, scheme) ? scale.filter(level => Number.isFinite(level.min)).length : scale.length;
  })) / 2);
  if (!gradient) return { metric, period, gradient, rows: levels, stops: null, gridRowCount };

  // High to low, matching JMA's bins. Sample the same function as the map.
  const values = levels.map(level => level.min).filter(Number.isFinite).sort((a, b) => b - a);
  const maximum = values[0], minimum = values.at(-1);
  const rows = values.map((value, index) => ({
    min: value, color: getAmedasObservationColor(metric.id, value, period),
    label: `${value}${metric.unit}${index === 0 ? "以上" : index === values.length - 1 ? "以下" : ""}`
  }));
  const stops = Array.from({ length: 65 }, (_, index) => ({
    position: index / 64 * 100,
    color: getAmedasObservationColor(metric.id, maximum + (minimum - maximum) * index / 64, period)
  }));
  return { metric, period, gradient, rows, stops, gridRowCount };
}

export function renderAmedasColorLegend(metricId, periodId) {
  const legend = buildAmedasColorLegend(metricId, periodId);
  const t = value => escapeHtml(localizeText(value));
  const note = legend.gradient ? "連続配色：値は色の目安です。"
    : legend.rows.length === 1 ? "この項目は単色で表示します。" : "値の区分ごとに色が変わります。";
  const stops = legend.stops ?? legend.rows.flatMap((row, index) => [
    { color: row.color, position: index / legend.rows.length * 100 },
    { color: row.color, position: (index + 1) / legend.rows.length * 100 }
  ]);
  return `<p class="settings-color-legend-note"><span>${t("上が高い値、下が低い値です。")}</span><span>${t(note)}</span></p>
    <div class="settings-color-gradient" aria-hidden="true" style="background:linear-gradient(to right,${stops.map(stop => `${stop.color} ${stop.position}%`).join(",")})"></div>
    <ul class="settings-color-legend-list${legend.rows.length === 1 ? " is-single" : ""}" style="--legend-rows:${legend.gridRowCount}" aria-label="${t("色と値の対応")}">${legend.rows.map(row => `<li><span aria-hidden="true" class="settings-color-legend-swatch" style="background:${row.color}"></span><span>${t(row.label)}</span></li>`).join("")}</ul>`;
}
