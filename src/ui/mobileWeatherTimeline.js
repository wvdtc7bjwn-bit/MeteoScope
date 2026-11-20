import { escapeHtml } from "../utils/html.js";
import { localizeText } from "./locale.js";

const icons = {
  prev: '<path d="m15 5-7 7 7 7"/>',
  next: '<path d="m9 5 7 7-7 7"/>',
  play: '<path d="m8 5 11 7-11 7Z" fill="currentColor" stroke="none"/>',
  stop: '<path d="M8 5v14M16 5v14"/>'
};

export function renderMobileWeatherTimelineToolbar({ date, time, kind, fullTime, playing, disabled, index, length, currentIndex, mode, loadingMarkup = "" }) {
  const attribute = mode === "weather-chart" ? "data-weather-chart-action" : mode === "satellite" ? "data-weather-satellite-action" : "data-mobile-weather-action";
  const latestLabel = mode === "weather-chart" ? "最新の実況へ" : mode === "weather-distribution" ? "現在に最も近い予報" : "最新の観測へ";
  const actions = [["prev", "前の時刻", disabled || index <= 0], ["play", playing ? "停止" : "再生", disabled],
    ["latest", latestLabel, disabled || (index === currentIndex && !playing)], ["next", "次の時刻", disabled || index >= length - 1]];
  return `<div class="mobile-weather-toolbar" data-mobile-dock-control>
    <div class="mobile-weather-readout">${loadingMarkup || `<time data-mobile-weather-date>${escapeHtml(date)}</time><strong data-mobile-weather-time title="${escapeHtml(fullTime)}">${escapeHtml(time)}</strong><span data-mobile-weather-kind>${escapeHtml(localizeText(kind))}</span>`}</div>
    <div class="mobile-weather-actions">${actions.map(([action, label, inactive]) => `<button type="button" class="mobile-weather-control" data-mobile-dock-control ${attribute}="${action}" aria-label="${escapeHtml(localizeText(label))}" title="${escapeHtml(localizeText(label))}"${action === "play" ? ` aria-pressed="${Boolean(playing)}"` : ""}${inactive ? " disabled" : ""}>${action === "latest" ? escapeHtml(localizeText(mode === "weather-distribution" ? "現在" : "最新")) : `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[action === "play" && playing ? "stop" : action]}</svg>`}</button>`).join("")}</div>
  </div>`;
}

export function getMobileWeatherFocusSelector(root) {
  const active = root.ownerDocument?.activeElement;
  if (!active || !root.contains(active)) return "";
  for (const attribute of ["data-mobile-weather-action", "data-weather-chart-action", "data-weather-satellite-action"]) {
    const action = active.getAttribute(attribute);
    if (["prev", "next", "play", "latest"].includes(action)) return `[${attribute}="${action}"]`;
  }
  for (const attribute of ["data-mobile-radar-slider", "data-mobile-lightning-slider", "data-mobile-weather-distribution-slider", "data-mobile-weather-chart-slider", "data-mobile-weather-satellite-slider"]) {
    if (active.hasAttribute(attribute)) return `[${attribute}]`;
  }
  return "";
}
