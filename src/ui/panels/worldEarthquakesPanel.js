import { formatWorldEarthquakeDepth, getWorldEarthquakePlace, WORLD_EARTHQUAKE_MIN_MAGNITUDE, WORLD_EARTHQUAKE_SOURCE_URL } from "../../earthquake/worldEarthquakes.js";
import { escapeHtmlString as escapeHtml } from "../../utils/html.js";
import { getCurrentLanguage } from "../locale.js";

export function buildRecentEarthquakeScopeToggle(scope, compact = false) {
  const en = getCurrentLanguage() === "en";
  const options = [
    ["japan", "JMA", en ? "Near Japan" : "日本周辺"],
    ["world", "USGS", en ? "World" : "世界"]
  ];
  return `<div class="earthquake-recent-scope mobile-dock-action-row mobile-dock-mode-switch mobile-dock-segmented${compact ? " is-compact" : ""}" role="group" aria-label="${en ? "Earthquake region" : "地震の表示範囲"}">
    ${options.map(([key, source, region]) => `<button type="button" class="mobile-dock-action${scope === key ? " active" : ""}"${compact ? " data-mobile-dock-control" : ""} aria-label="${source}・${region}" data-earthquake-recent-scope="${key}" aria-pressed="${scope === key}">${source}</button>`).join("")}
  </div>`;
}

export function getWorldEarthquakeStatusText(status, en) {
  if (status === "error") return en ? "Could not load USGS earthquake data." : "USGSの地震情報を取得できませんでした。";
  if (status === "ok") return en ? "No earthquakes in this period." : "対象期間の地震情報はありません。";
  return en ? "Loading USGS earthquake data…" : "USGSの地震情報を取得中…";
}

export function buildWorldEarthquakesList(state, selectedId) {
  const en = getCurrentLanguage() === "en";
  const events = state?.events ?? [];
  const status = state?.status;
  const period = en ? "Past 7 days" : "直近7日間";
  const source = en ? "U.S. Geological Survey (USGS)" : "米国地質調査所（USGS）";
  const count = en ? `${events.length} events` : `${events.length}件`;
  const retry = `<button type="button" class="earthquake-distribution-retry" data-world-earthquakes-retry>${en ? "Retry" : "再試行"}</button>`;
  const notice = status === "error" && events.length
    ? `<p role="status">${en ? "Update failed. Showing previously loaded events." : "更新できませんでした。前回取得した地震を表示しています。"}${retry}</p>`
    : "";
  const items = events.map((event) => {
    const active = event.id === selectedId;
    const place = getWorldEarthquakePlace(event, en);
    const depth = formatWorldEarthquakeDepth(event.depthKm, en);
    const intensity = event.mmi === null ? "" : ` · <abbr title="${en ? "Modified Mercalli Intensity" : "改良メルカリ震度"}">MMI</abbr> ${event.mmi.toFixed(1)}`;
    return `<li class="earthquake-world-event${active ? " active" : ""}">
      <button type="button" class="earthquake-world-event-button" data-world-earthquake-id="${escapeHtml(event.id)}" aria-pressed="${active}">
        <span class="earthquake-world-magnitude">M${event.magnitude}</span>
        <span class="earthquake-world-event-copy">
          <strong>${escapeHtml(place)}</strong>
          <span><time datetime="${escapeHtml(event.datetime)}">${escapeHtml(event.eventTime)} JST</time> · ${escapeHtml(depth)}${intensity}</span>
        </span>
      </button>
      ${active ? `<a href="${escapeHtml(event.url)}" target="_blank" rel="noopener noreferrer">${en ? "USGS event details" : "USGSの地震詳細"} ↗</a>` : ""}
    </li>`;
  }).join("");
  return `<section class="earthquake-world-catalog" aria-label="${en ? "World earthquakes" : "世界の地震"}">
    <div class="earthquake-world-heading">
      <span>${period} · M${WORLD_EARTHQUAKE_MIN_MAGNITUDE}${en ? "+" : "以上"}${events.length ? ` · ${count}` : ""}</span>
      <a href="${WORLD_EARTHQUAKE_SOURCE_URL}" target="_blank" rel="noopener noreferrer" title="${source}">${en ? "Source" : "出典"} USGS ↗</a>
    </div>
    ${notice}
    ${items ? `<ul class="earthquake-world-list">${items}</ul>`
      : `<div class="earthquake-empty" role="status">${getWorldEarthquakeStatusText(status, en)}${status === "error" ? retry : ""}</div>`}
  </section>`;
}
