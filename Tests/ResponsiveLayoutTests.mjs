import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [styles, index, panel, app, weatherMap, panelToggle, tabs, time, mapUtilityMenu] = await Promise.all([
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/panelToggle.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/tabs.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/time.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/mapUtilityMenu.js", import.meta.url), "utf8")
]);

assert.match(styles, /--sidebar-width:\s*clamp\(300px,\s*24vw,\s*380px\)/);
assert.match(styles, /grid-template-columns:\s*var\(--sidebar-width\)\s+minmax\(0,\s*1fr\)/);
assert.match(
  styles,
  /@media \(orientation: landscape\) and \(max-width: 1024px\) and \(max-height: 600px\)/
);
assert.match(styles, /#main-tabs\s*\{[\s\S]*?bottom:\s*max\(8px,\s*env\(safe-area-inset-bottom\)\)/);
assert.match(
  styles,
  /@media \(max-width: 800px\) and \(orientation: portrait\)\s*\{[\s\S]*?#main-tabs,\s*#main-tabs \.tab-button\s*\{[\s\S]*?-webkit-tap-highlight-color:\s*transparent;[\s\S]*?-webkit-touch-callout:\s*none;/
);
assert.match(
  styles,
  /@media screen\s*\{[\s\S]*?#main-tabs::after\s*\{[\s\S]*?background:\s*rgba\(151, 174, 199, 0\.14\);[\s\S]*?box-shadow:\s*none;[\s\S]*?#main-tabs\.is-dragging::after\s*\{[\s\S]*?radial-gradient[\s\S]*?backdrop-filter:\s*blur\(8px\) saturate\(1\.08\);/
);
assert.match(
  styles,
  /html\[data-theme="light"\] #main-tabs\.is-dragging::after\s*\{[\s\S]*?radial-gradient[\s\S]*?inset 0 -1px 0 rgba\(47, 117, 165, 0\.06\);/
);
assert.match(tabs, /root\?\.addEventListener\("lostpointercapture", \(event\) => \{[\s\S]*?finishIndicatorDrag/);
assert.match(tabs, /window\.addEventListener\("blur", cancelIndicatorDrag\)/);
assert.match(
  tabs,
  /function finishIndicatorDrag[\s\S]*?const completedPointerId = dragPointerId;[\s\S]*?activateTab\(completedTabId[\s\S]*?dragPointerId = null;[\s\S]*?hasPointerCapture\?\.\(completedPointerId\)[\s\S]*?releasePointerCapture\(completedPointerId\)/
);
assert.match(tabs, /dragTargetTabId = getTabFromPoint\(point, dragAxis\) \?\? dragTargetTabId/);
assert.match(tabs, /const completedTabId = type === "pointerup" && point[\s\S]*?getTabFromPoint\(point, dragAxis\) \?\? dragTargetTabId/);
assert.match(
  styles,
  /@media screen\s*\{[\s\S]*?#sidebar\s*\{[\s\S]*?html:not\(\.mobile-drawer-open\) #sidebar\s*\{[\s\S]*?opacity:\s*0;[\s\S]*?\.mobile-context-dock\s*\{[\s\S]*?display:\s*block;/
);
assert.match(
  styles,
  /@media \(orientation: landscape\), \(min-width: 801px\)\s*\{[\s\S]*?--shared-dock-left:\s*12px;[\s\S]*?--shared-nav-height:\s*64px;[\s\S]*?--shared-summary-height:\s*118px;[\s\S]*?#app\s*\{[\s\S]*?display:\s*block;[\s\S]*?#main-tabs\s*\{[\s\S]*?inset:\s*auto auto var\(--shared-dock-bottom\) var\(--shared-dock-left\);[\s\S]*?\.mobile-context-dock\s*\{[\s\S]*?left:\s*var\(--shared-dock-left\);/
);
assert.match(
  styles,
  /@media screen\s*\{[\s\S]*?#sidebar-drawer-handle\s*\{[\s\S]*?height:\s*22px;[\s\S]*?touch-action:\s*none;[\s\S]*?#sidebar-drawer-handle::before\s*\{[\s\S]*?content:\s*"";[\s\S]*?width:\s*48px;[\s\S]*?height:\s*5px;[\s\S]*?border-radius:\s*999px;/
);
assert.match(
  styles,
  /@media \(orientation: landscape\), \(min-width: 801px\)\s*\{[\s\S]*?#sidebar,[\s\S]*?width:\s*var\(--shared-dock-width\);/
);
assert.match(
  styles,
  /@media \(min-width: 801px\)\s*\{[\s\S]*?--shared-dock-left:\s*20px;[\s\S]*?--shared-dock-width:\s*390px;/
);
assert.match(
  styles,
  /@media \(min-width: 801px\)\s*\{[\s\S]*?--shared-nav-height:\s*68px;[\s\S]*?--shared-summary-height:\s*126px;/
);
assert.match(
  styles,
  /@media \(orientation: landscape\) and \(max-width: 1024px\) and \(max-height: 600px\) and \(hover: none\) and \(pointer: coarse\)\s*\{[\s\S]*?--shared-dock-width:\s*min\(360px, calc\(100vw - 24px\)\);[\s\S]*?--shared-nav-height:\s*62px;[\s\S]*?--shared-summary-height:\s*120px;[\s\S]*?#sidebar,[\s\S]*?max-height:\s*min\(82dvh, 480px\);/
);
assert.match(
  styles,
  /:root\s*\{[\s\S]*?--shared-shell-glass-background:\s*rgba\(7, 16, 34, 0\.34\);[\s\S]*?--shared-shell-glass-filter:\s*blur\(26px\) saturate\(1\.5\);/
);
assert.match(
  styles,
  /html\[data-theme="light"\]\s*\{[\s\S]*?--shared-shell-glass-background:\s*rgba\(246, 250, 255, 0\.34\);/
);
assert.match(
  styles,
  /The sheet, summary bar, and bottom tab slider share the same glass density\.[\s\S]*?:is\(#sidebar, #sidebar\.drawer-open, \.mobile-context-dock, #main-tabs\)[\s\S]*?background:\s*var\(--shared-shell-glass-background\);[\s\S]*?backdrop-filter:\s*var\(--shared-shell-glass-filter\);[\s\S]*?#sidebar \.current-panel,[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/
);
assert.match(
  panelToggle,
  /function isCompactLandscape\(\)[\s\S]*?max-width: 1024px[\s\S]*?pointer: coarse[\s\S]*?if \(isCompactLandscape\(\)\)[\s\S]*?viewportHeight \* 0\.82, 480/
);
assert.match(
  styles,
  /@media \(orientation: landscape\), \(min-width: 801px\)\s*\{[\s\S]*?\.map-utility-menu-toggle\s*\{[\s\S]*?left:\s*var\(--shared-dock-left\);[\s\S]*?\.map-locate-button\s*\{[\s\S]*?bottom:\s*var\(--shared-map-controls-bottom\);[\s\S]*?\.map-legend\s*\{[\s\S]*?bottom:\s*calc\(var\(--shared-map-controls-bottom\) \+ 54px\);/
);
assert.match(
  styles,
  /@media \(orientation: landscape\), \(min-width: 801px\)\s*\{[\s\S]*?#map-attribution\s*\{[\s\S]*?left:\s*auto;[\s\S]*?display:\s*block;[\s\S]*?max-width:\s*calc\(100vw - var\(--shared-dock-left\) - var\(--shared-dock-width\) - 32px\);[\s\S]*?text-overflow:\s*ellipsis;/
);
assert.doesNotMatch(
  styles,
  /#sidebar-drawer-handle,\s*\.mobile-context-dock\s*\{\s*display:\s*none\s*!important;/
);
assert.doesNotMatch(panelToggle, /isMobileSheet/);
assert.doesNotMatch(panelToggle, /isPortraitSheet/);
assert.match(panelToggle, /sidebar\.style\.transform = "translateY\(0\) translateZ\(0\)";/);
assert.match(
  panelToggle,
  /function setSummaryTransition\(offset, offsets = getSnapOffsets\(\)\)[\s\S]*?tabBarHeight[\s\S]*?summaryHeight[\s\S]*?retreatDistance[\s\S]*?absorptionProgress[\s\S]*?--mobile-summary-retreat-y[\s\S]*?--mobile-summary-absorb-opacity[\s\S]*?--mobile-summary-absorb-scale/
);
assert.match(panelToggle, /setSummaryTransition\(nextOffset, offsets\);/);
assert.match(panelToggle, /classList\.toggle\("is-vertical-dragging", initialAxis === "y"\)/);
assert.match(panelToggle, /classList\.remove\("is-vertical-dragging"\)/);
assert.match(panelToggle, /setDrawerState\(drawerState === "peek" \? "full" : "peek"\);/);
assert.match(
  styles,
  /\.mobile-context-dock\s*\{[\s\S]*?opacity:\s*var\(--mobile-summary-absorb-opacity, 1\);[\s\S]*?translateX\(-50%\) translateY\(var\(--mobile-summary-retreat-y, 0px\)\) scale\(var\(--mobile-summary-absorb-scale, 1\)\)[\s\S]*?transform-origin:\s*50% 100%;[\s\S]*?\.mobile-drawer-open \.mobile-context-dock:not\(\.is-vertical-dragging\)\s*\{[\s\S]*?pointer-events:\s*none;[\s\S]*?\.mobile-context-dock\.is-vertical-dragging\s*\{[\s\S]*?transition:\s*none;/
);
assert.doesNotMatch(styles, /\.mobile-drawer-open \.mobile-context-dock\s*\{[\s\S]{0,160}?opacity:\s*0;/);
assert.match(
  styles,
  /\.weather-time-timeline,\s*\.weather-time-timeline \*\s*\{[\s\S]*?-webkit-tap-highlight-color:\s*transparent;[\s\S]*?-webkit-touch-callout:\s*none;/
);
assert.match(
  styles,
  /\.weather-time-range\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;[\s\S]*?-webkit-tap-highlight-color:\s*transparent;/
);
assert.match(
  styles,
  /\.volcano-ash-timeline,\s*\.volcano-ash-timeline \*\s*\{[\s\S]*?-webkit-tap-highlight-color:\s*transparent;[\s\S]*?-webkit-touch-callout:\s*none;/
);
assert.match(
  styles,
  /\.mobile-context-dock\s*\{[\s\S]*?bottom:\s*calc\(max\(0px,\s*env\(safe-area-inset-bottom\)\)\s*\+\s*76px\);[\s\S]*?width:\s*min\(390px,\s*calc\(100vw\s*-\s*22px\)\);[\s\S]*?height:\s*126px;[\s\S]*?min-height:\s*126px;[\s\S]*?max-height:\s*126px;/
);
assert.match(
  styles,
  /\.mobile-context-dock\[data-tab="earthquake"\]\s*\{[\s\S]*?bottom:\s*calc\(max\(0px,\s*env\(safe-area-inset-bottom\)\)\s*\+\s*76px\);[\s\S]*?padding-top:\s*10px;[\s\S]*?padding-bottom:\s*9px;/
);
assert.match(
  styles,
  /\.mobile-context-dock\s+\.mobile-dock-content:has\(\.mobile-dock-mode-switch\)\s*\{[\s\S]*?top:\s*-4px;/
);
assert.doesNotMatch(styles, /\.mobile-context-dock\[data-tab="typhoon"\]\s*\{/);
assert.match(styles, /#map-attribution\s*\{[\s\S]*?max-height:\s*24px;[\s\S]*?white-space:\s*nowrap;/);
assert.match(
  styles,
  /body,\s*body \*\s*\{[\s\S]*?-webkit-user-select:\s*none;[\s\S]*?user-select:\s*none;/
);
assert.match(
  styles,
  /input,\s*textarea,\s*select,\s*option,\s*\[contenteditable="true"\],\s*\[data-user-select="text"\]\s*\{[\s\S]*?-webkit-user-select:\s*text;[\s\S]*?user-select:\s*text;/
);
assert.match(
  styles,
  /html\[data-theme="light"\] \.settings-modal-header\s*\{[\s\S]*?background:\s*transparent;/
);
assert.match(styles, /\.warning-modal-head\s*\{[\s\S]*?border-bottom:\s*1px solid/);
assert.match(styles, /--modal-shell-radius:\s*22px/);
assert.match(styles, /--modal-header-height:\s*62px/);
assert.match(
  styles,
  /\.warning-modal-panel\s*\{[\s\S]*?border:\s*1px solid var\(--modal-shell-border\);[\s\S]*?border-radius:\s*var\(--modal-shell-radius\);[\s\S]*?background:\s*var\(--modal-shell-bg\);/
);
assert.match(
  styles,
  /\.disaster-dashboard-modal\s*\{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?box-sizing:\s*border-box;/
);
assert.match(
  styles,
  /\.disaster-dashboard-panel\s*\{[\s\S]*?width:\s*min\(900px,\s*100%\);[\s\S]*?max-width:\s*100%;[\s\S]*?margin-inline:\s*auto;/
);
assert.match(
  styles,
  /\.settings-modal-header\s*\{[\s\S]*?min-height:\s*var\(--modal-header-height\);[\s\S]*?padding:\s*var\(--modal-header-padding\);[\s\S]*?border-bottom:\s*1px solid var\(--modal-shell-divider\);/
);
assert.match(
  styles,
  /\.hypocenter-date-wheel-sheet\s*\{[\s\S]*?border:\s*1px solid var\(--modal-shell-border\);[\s\S]*?background:\s*var\(--modal-shell-bg\);/
);
assert.match(
  styles,
  /@media \(max-width: 600px\)\s*\{[\s\S]*?\.social-share-panel\s*\{[\s\S]*?border-radius:\s*var\(--modal-shell-radius\);/
);
assert.match(
  styles,
  /@media \(max-width: 520px\)\s*\{[\s\S]*?\.community-report-panel\s*\{[\s\S]*?border-radius:\s*var\(--modal-shell-radius\);/
);
assert.doesNotMatch(
  styles,
  /\.community-report-panel\s*\{[^}]*border-radius:\s*var\(--modal-shell-radius\)\s+var\(--modal-shell-radius\)\s+0\s+0;/
);
assert.match(
  styles,
  /\.earthquake-distribution-range-controls label\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\);[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?overflow:\s*hidden;/
);
assert.match(
  styles,
  /\.earthquake-distribution-range-controls input\s*\{[\s\S]*?width:\s*100%;[\s\S]*?min-width:\s*0;[\s\S]*?max-width:\s*100%;[\s\S]*?box-sizing:\s*border-box;/
);
assert.match(
  styles,
  /@supports \(-webkit-touch-callout:\s*none\)\s*\{[\s\S]*?@media \(max-width:\s*600px\)\s*\{[\s\S]*?\.earthquake-distribution-range-controls input\[type="date"\]\s*\{[\s\S]*?-webkit-appearance:\s*none;[\s\S]*?appearance:\s*none;[\s\S]*?inline-size:\s*100%;[\s\S]*?min-inline-size:\s*0;[\s\S]*?max-inline-size:\s*100%;[\s\S]*?overflow:\s*hidden;/
);

assert.match(index, /width=device-width/);
assert.match(index, /viewport-fit=cover/);
assert.match(index, /id="map-utility-menu-toggle"[\s\S]*?aria-controls="map-utility-actions"/u);
assert.match(index, /id="map-utility-actions"[\s\S]*?id="disaster-quiz-button"[\s\S]*?id="weekly-weather-button"[\s\S]*?id="disaster-map-button"[\s\S]*?id="social-share-map-button"[\s\S]*?id="settings-button"/u);
assert.equal((index.match(/id="settings-button"/gu) ?? []).length, 1, "設定ボタンを機能メニュー内だけに置く");
assert.match(styles, /\.map-settings-open-button::before\s*\{[\s\S]*?mask:/u);
assert.match(styles, /\.map-utility-actions\s*\{[\s\S]*?display:\s*flex;[\s\S]*?gap:\s*8px;/u);
assert.match(styles, /\.map-utility-actions\[hidden\]\s*\{[\s\S]*?display:\s*none;/u);
assert.match(mapUtilityMenu, /toggle\.addEventListener\("click"/u);
assert.match(mapUtilityMenu, /event\.key !== "Escape"/u);
assert.match(app, /setupMapUtilityMenu\(\)/u);
assert.match(time, /hour:\s*"2-digit"[\s\S]*?minute:\s*"2-digit"[\s\S]*?second:\s*"2-digit"/u);
assert.doesNotMatch(time, /month:\s*"2-digit"|day:\s*"2-digit"/u);
for (const removedModalSubtitle of ["MeteoScope", "MeteoScope Guide", "自治体公開資料", "防災学習", "雨雲レーダー"]) {
  assert.doesNotMatch(index, new RegExp(`<span>${removedModalSubtitle}<\\/span>`, "u"));
}
for (const modalId of ["settings", "feedback", "weekly-weather", "disaster-map", "disaster-quiz", "community-report", "social-share"]) {
  assert.match(
    index,
    new RegExp(`id="${modalId}-modal"[\\s\\S]*?<header class="settings-modal-header(?: [^"]+)?">[\\s\\S]*?<h2 id="${modalId}-(?:modal-)?title"`, "u")
  );
}
assert.match(index, /<header class="settings-modal-header legal-consent-header">\s*<h2 id="legal-consent-title">/u);
assert.match(index, /<header class="settings-modal-header onboarding-header">\s*<h2 id="onboarding-title">/u);
assert.match(index, /id="radar-time-timeline"\s+class="weather-time-timeline"/);
assert.match(index, /id="community-report-map-open"\s+class="map-community-report-button"/);
assert.match(index, /id="community-report-open"[^>]*aria-label="投稿"[^>]*><\/button>/);
for (const [id, label] of [["radar-prev", "5分前"], ["radar-play", "再生"], ["radar-now", "現在"], ["radar-next", "5分後"]]) {
  assert.match(index, new RegExp(`id="${id}"[^>]*aria-label="${label}"[^>]*><\\/button>`, "u"));
}
assert.match(panel, /function buildWeatherTimeTimelineMarkup/);
assert.match(panel, /class="weather-time-active-marker"/);
assert.match(panel, /--weather-time-shift:/);
assert.match(panel, /const step = compact \? 30 : 40/);
assert.match(panel, /data-mobile-weather-chart-slider/);
assert.match(panel, /data-mobile-radar-slider/);
assert.match(panel, /data-mobile-weather-tap-controls/);
assert.match(panel, /export function setupTideObservationControls/);
assert.match(panel, /data-tide-range-hours="\$\{nextRangeHours\}"/);
assert.match(panel, /class="mobile-dock-earthquake-summary-page mobile-dock-tide"/);
assert.match(styles, /\.mobile-dock-earthquake-summary-track\s*\{[\s\S]*?width:\s*300%;/);
assert.match(
  styles,
  /\.mobile-dock-earthquake-summary-viewport\s*\{[\s\S]*?top:\s*3\.1667px;[\s\S]*?width:\s*calc\(100% \+ 36px\);[\s\S]*?margin-inline:\s*-18px;/
);
assert.match(
  styles,
  /\.mobile-dock-earthquake-summary-page\s*\{[\s\S]*?padding-inline:\s*24px;/
);
assert.match(
  styles,
  /\.mobile-dock-earthquake-text strong\s*\{[\s\S]*?line-height:\s*1\.24;/
);
assert.match(
  panel,
  /localizeText\("地震情報を読み込み中"\)/
);
assert.match(
  panel,
  /mobile-dock-earthquake-empty-state/
);
assert.match(
  styles,
  /\.mobile-dock-earthquake-empty-state\s*\{[\s\S]*?place-items:\s*center;[\s\S]*?overflow-wrap:\s*anywhere;/
);
assert.doesNotMatch(
  styles,
  /\.mobile-dock-earthquake-distribution\s*\{[^}]*transform:\s*translateY/
);
const mobileEarthquakeIntensityStyle = styles.match(
  /\.mobile-dock-earthquake-intensity\s*\{([^}]*)\}/
)?.[1] ?? "";
assert.match(mobileEarthquakeIntensityStyle, /box-shadow:\s*none/);
assert.doesNotMatch(mobileEarthquakeIntensityStyle, /box-shadow:\s*inset/);
const lightMobileEarthquakeIntensityStyle = styles.match(
  /html\[data-theme="light"\] \.mobile-dock-earthquake-intensity\s*\{([^}]*)\}/
)?.[1] ?? "";
assert.match(lightMobileEarthquakeIntensityStyle, /box-shadow:\s*none/);
assert.doesNotMatch(lightMobileEarthquakeIntensityStyle, /box-shadow:\s*inset/);
assert.match(styles, /\.mobile-dock-tide\s*\{[\s\S]*?grid-template-rows:\s*26px 62px;/);
assert.doesNotMatch(styles, /\.mobile-context-dock\.is-tide-observation/);
assert.match(panel, /data-mobile-earthquake-summary="tide"/);
assert.match(panel, /data-mobile-earthquake-summary-target="\$\{page\}"/);
assert.match(panel, /const pages = \["earthquake", "tsunami", "tide"\]/);
assert.match(panel, /function buildMobileEarthquakeSummaryCarousel\(\{/);
assert.equal(panel.match(/class="mobile-dock-earthquake-summary-track"/g)?.length, 1);
assert.match(
  panel,
  /function buildEarthquakeDistributionMobileContextMarkup[\s\S]*?return buildMobileEarthquakeSummaryCarousel\(\{[\s\S]*?primaryAriaLabel: isEnglish \? "Epicenter distribution summary" : "震央分布要約"[\s\S]*?primaryDotLabel: isEnglish \? "Epicenter distribution" : "地震・震央分布"/
);
assert.match(panel, /export function setupMobileEarthquakeSummarySwipe\(\{ onChange \} = \{\}\)/);
assert.match(panel, /mobileEarthquakeSummaryCommitTimer = window\.setTimeout/);
assert.match(panel, /if \(mobileEarthquakeSummaryPage === page\) onChange\?\.\(page\)/);
assert.match(panel, /Math\.abs\(velocityX\) < 0\.35/);
assert.match(panel, /const direction = directionSource < 0 \? 1 : -1/);
assert.match(panelToggle, /function applyHorizontalDragSoon\(offset\)/);
assert.match(panelToggle, /horizontalVelocityX = horizontalVelocityX \* 0\.65/);
assert.match(panelToggle, /velocityX: event\.type === "pointercancel" \? 0 : horizontalVelocityX/);
assert.match(tabs, /let suppressNextClick = false;/);
assert.match(
  tabs,
  /if \(suppressNextClick\) \{[\s\S]*?suppressNextClick = false;[\s\S]*?clearPointerPreview\(\);[\s\S]*?event\.preventDefault\(\);[\s\S]*?return;/
);
assert.match(
  tabs,
  /function beginIndicatorDrag\([\s\S]*?suppressNextClick = false;/
);
assert.match(
  tabs,
  /if \(dragMoved && completedTabId\) \{[\s\S]*?suppressNextClick = true;[\s\S]*?activateTab\(completedTabId, \{ force: true \}\);/
);
assert.doesNotMatch(tabs, /suppressClickUntil/);
assert.match(
  styles,
  /\.mobile-dock-earthquake-summary-track\s*\{[\s\S]*?transition:\s*transform 360ms cubic-bezier\(0\.22, 1, 0\.36, 1\);/
);
assert.match(app, /tideStationsVisible:\s*earthquakeSummaryPage === "tide"/);
assert.match(
  app,
  /const earthquakeMapView = earthquakeSummaryPage === "earthquake"\s*\? earthquakeView\s*:\s*"recent"/
);
assert.match(app, /earthquakeView,\s*earthquakeMapView,/);
assert.match(app, /setupMobileEarthquakeSummarySwipe\(\{[\s\S]*?onChange:\s*\(page\)/);
assert.match(weatherMap, /function getEarthquakeMapView\(data\)/);
assert.match(weatherMap, /getEarthquakeMapView\(data\) === "distribution"/);
assert.equal(weatherMap.match(/getEarthquakeMapView\(data\) === "distribution"/g)?.length, 2);
assert.match(weatherMap, /function createTideStationFeatures\(data\)\s*\{\s*if \(data\?\.tideStationsVisible !== true\) return \[\];/);
assert.match(weatherMap, /!\["tsunami-coastal", "tsunami-offshore"\]\.includes\(feature\?\.properties\?\.markerType\)/);
assert.match(panel, /const tideStationLegend = data\?\.tideStationsVisible === true/);
assert.match(panel, /const tsunamiObservationLegend = data\?\.tideStationsVisible === true \? \[\] : \[/);
assert.match(panel, /data-mobile-earthquake-detail="tide"/);
assert.match(panel, /レベル4危険警報基準/);
assert.match(panel, /レベル5特別警報基準/);
assert.match(panel, /includeReferencesInScale:\s*true/);
assert.match(panel, /function createTideDeviationGraphGeometry/);
assert.match(panel, /実測潮位 − 天文潮位/);
assert.match(panel, /class="tide-deviation-zero"/);
assert.match(panel, /state\.level === "none" \? "警報・注意報なし"/);
assert.match(panel, /mobile-dock-tsunami-main\$\{hasCounts \? "" : " no-counts"\}/);
assert.match(panel, /class="mobile-dock-tsunami-area-ticker"/);
assert.match(panel, /class="mobile-dock-tsunami-area-ticker-track"/);
assert.match(panel, /class="mobile-dock-tsunami-area-ticker-sequence"/);
assert.match(panel, /data-mobile-tsunami-area-level="\$\{escapeHtml\(area\.level\)\}"/);
assert.match(panel, /data-mobile-tsunami-ticker-level="\$\{escapeHtml\(group\.level\)\}"/);
assert.match(panel, /data-mobile-tsunami-ticker-duration="\$\{duration\}"/);
assert.match(panel, /data-mobile-tsunami-level-badge/);
assert.match(panel, /function syncMobileTsunamiAreaTickers\(root\)/);
assert.match(panel, /function activateMobileTsunamiTickerGroup\(ticker, groupIndex\)/);
assert.match(panel, /function switchMobileTsunamiTickerGroup\(ticker\)/);
assert.match(panel, /const overflows = sequence\.scrollWidth > ticker\.clientWidth/);
assert.match(panel, /duplicate\.setAttribute\("aria-hidden", "true"\)/);
assert.match(panel, /duplicate\.setAttribute\("data-mobile-tsunami-ticker-duplicate", ""\)/);
assert.match(panel, /const isVisible = summaryPage\?\.getAttribute\("aria-hidden"\) !== "true"/);
assert.match(panel, /const tickerAreas = \[\.\.\.areas\]\.sort\(/);
assert.match(panel, /const tickerGroups = tickerAreas/);
assert.match(panel, /function getMobileTsunamiLevelRank\(level\)/);
assert.match(panel, /badgeText\.textContent = getMobileTsunamiLevelShortLabel\(level\)/);
assert.match(panel, /main\.style\.setProperty\("--mobile-tsunami-color", getTsunamiLevelColor\(level\)\)/);
assert.match(panel, /groups\.length > 1 && isVisible/);
assert.match(panel, /overflows && !prefersReducedMotion\s*\? durationSeconds \* 1000\s*:\s*3500/);
assert.match(panel, /ticker\.classList\.add\("is-group-changing"\)/);
assert.doesNotMatch(panel, /areas\.length > 1 \? " is-animated"/);
assert.match(styles, /\.mobile-dock-tsunami-area-ticker\.is-animated \.mobile-dock-tsunami-area-ticker-track\s*\{[\s\S]*?animation:\s*remoteTickerLeft/);
assert.match(styles, /\.mobile-dock-tsunami-area-ticker\.is-group-changing\s*\{[\s\S]*?opacity:\s*0/);
assert.match(styles, /\.mobile-dock-tsunami-area-ticker-sequence\[hidden\]\s*\{[\s\S]*?display:\s*none/);
assert.match(styles, /mask-image:\s*linear-gradient\(90deg,\s*#000 0,\s*#000 calc\(100% - 7px\),\s*transparent 100%\)/);
assert.doesNotMatch(styles, /mask-image:\s*linear-gradient\(90deg,\s*transparent 0,\s*#000 7px/);
assert.equal(styles.match(/@keyframes remoteTickerLeft/g)?.length, 1);
const mobileTsunamiLevelStyle = styles.match(
  /\.mobile-dock-tsunami-level\s*\{([^}]*)\}/
)?.[1] ?? "";
const lightMobileTsunamiLevelStyle = styles.match(
  /html\[data-theme="light"\] \.mobile-dock-tsunami-level\s*\{([^}]*)\}/
)?.[1] ?? "";
assert.match(mobileTsunamiLevelStyle, /box-shadow:\s*none/);
assert.match(lightMobileTsunamiLevelStyle, /box-shadow:\s*none/);
const tsunamiMobileSummaryStart = panel.indexOf("function buildMobileTsunamiSummaryMarkup");
const tsunamiMobileSummaryEnd = panel.indexOf("\nfunction ", tsunamiMobileSummaryStart + 1);
const tsunamiMobileSummary = panel.slice(tsunamiMobileSummaryStart, tsunamiMobileSummaryEnd);
assert.doesNotMatch(tsunamiMobileSummary, /<small>津波<\/small>/);
assert.doesNotMatch(tsunamiMobileSummary, /primaryArea\.arrivalCondition|primaryArea\.arrivalTime/);
assert.doesNotMatch(tsunamiMobileSummary, /primaryArea\.heightCondition|primaryArea\.height/);
assert.match(tsunamiMobileSummary, /const areaTickerText = tickerAreas\s*\.map\(\(area\) => area\.name\)\s*\.filter\(Boolean\)\s*\.join\(/);
const mobileTapControlsStart = panel.indexOf("export function setupMobileWeatherTimelineTapControls");
const mobileTapControlsEnd = panel.indexOf("\nexport function ", mobileTapControlsStart + 1);
const mobileTapControls = panel.slice(mobileTapControlsStart, mobileTapControlsEnd);
assert.ok(mobileTapControlsStart >= 0);
assert.match(mobileTapControls, /getElementById\("mobile-context-dock"\)/);
assert.doesNotMatch(mobileTapControls, /getElementById\("(?:radar-time-controls|weather-chart-controls)"\)/);
assert.match(mobileTapControls, /MOBILE_WEATHER_TIMELINE_TAP_MOVE_THRESHOLD_PX/);
assert.match(mobileTapControls, /tapCount === 3/);
assert.match(mobileTapControls, /\[onWeatherChartPlay, onWeatherChartStop, onWeatherChartGoLatest\]/);
assert.match(mobileTapControls, /\[onRadarPlay, onRadarStop, onRadarGoLatest\]/);
assert.match(app, /let weatherChartPlayTimer = null/);
assert.match(
  app,
  /setupMobileWeatherTimelineTapControls\(\{[\s\S]*?onRadarPlay: startRadarPlayback,[\s\S]*?onRadarStop: stopRadarPlaybackAndRefresh,[\s\S]*?onRadarGoLatest: goLatestRadarObservation,[\s\S]*?onWeatherChartPlay: startWeatherChartPlayback,[\s\S]*?onWeatherChartStop: stopWeatherChartPlayback,[\s\S]*?onWeatherChartGoLatest: goLatestWeatherChartFrame/
);
assert.match(panel, /function updateSliderFromTimelineDrag/);
assert.match(panel, /function getWeatherTimelineDragIndex/);
assert.match(panel, /\(startX - clientX\) \/ frameWidth/);
assert.match(panel, /function updateWeatherTimelineFractionalPosition/);
assert.match(panel, /function interpolateWeatherTimelineTime/);
assert.equal(panel.match(/function updateSliderFromTimelineDrag/g)?.length, 1);
assert.match(
  panel,
  /function setupRadarControls[\s\S]*?slider\?\.id === "radar-time-slider"[\s\S]*?slider\?\.matches\?\.\("\[data-mobile-radar-slider\]"\)/
);
assert.match(
  panel,
  /function setupRadarControls[\s\S]*?sliderRoots\.forEach\(\(root\) => \{[\s\S]*?root\.addEventListener\("pointerdown", handlePointerDown\)[\s\S]*?root\.addEventListener\("pointermove", handlePointerMove\)[\s\S]*?root\.addEventListener\("pointerup", finishSlider\)/
);
assert.match(
  panel,
  /function setupRadarControls[\s\S]*?previewSlider[\s\S]*?updateSliderFromTimelineDrag\([\s\S]*?onSeek\?\.\(value\)[\s\S]*?updateWeatherTimelineDragPosition\(/
);
assert.match(
  styles,
  /\.weather-time-range:focus-visible,\s*\.weather-time-timeline:focus-within\s*\{\s*outline:\s*none;/
);
assert.match(panel, /function updateWeatherTimelineDragPosition/);
assert.match(panel, /startValue \+ \(\(startX - clientX\) \/ frameWidth\)/);
assert.match(panel, /if \(value !== previousValue\) onSeek\?\.\(value\)/);
assert.match(panel, /import \{ findLatestRadarObservationIndex \} from "\.\.\/jma\/radar\.js"/);
assert.doesNotMatch(panel, /function findLatestRadarObservationIndex/);
assert.match(panel, /const currentChartIndex = findLatestWeatherChartAnalysisIndex\(chartFrames\)/);
assert.match(panel, /frameIndex === currentRadarIndex/);
assert.match(panel, /frameIndex === currentChartIndex/);
assert.match(panel, /const currentIndex = frames\.findIndex\(\(frame\) => frame\?\.isCurrent === true\)/);
assert.match(panel, /class="\$\{frame\?\.isCurrent \? "is-current" : ""\}"/);
assert.match(
  styles,
  /\.weather-time-labels span\.is-current\s*\{[\s\S]*?border:\s*1px solid #68d5ff;[\s\S]*?border-radius:\s*999px;/
);
assert.doesNotMatch(panel, /function updateSliderFromPointer/);
assert.match(
  panel,
  /function setupWeatherChartControls[\s\S]*?beginWeatherTimelineDrag\(event\.target\)[\s\S]*?updateSliderFromTimelineDrag\([\s\S]*?updateWeatherTimelineDragPosition\(/
);
assert.match(
  panel,
  /const handlePointerUp = \(event\) => \{[\s\S]*?updateSliderFromTimelineDrag\([\s\S]*?commitSlider\(draggingSlider\)/
);
assert.match(panel, /data-mobile-weather-date/);
assert.match(panel, /data-mobile-weather-dates=/);
assert.match(panel, /class="mobile-dock-weather-timeline"/);
assert.match(panel, /function compactWeatherDateLabel/);
assert.match(panel, /updateMobileWeatherDate\(slider/);
assert.match(
  styles,
  /\.mobile-dock-date\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*0;[\s\S]*?left:\s*2px;/
);
assert.match(
  styles,
  /\.mobile-dock-world-time-control \.weather-time-timeline\s*\{[\s\S]*?width:\s*calc\(100% - 68px\);[\s\S]*?margin:\s*0 34px;/
);
assert.match(
  styles,
  /\.mobile-dock-world-time-control \.mobile-dock-date\s*\{[\s\S]*?left:\s*0;[\s\S]*?width:\s*30px;/
);
assert.match(styles, /\.mobile-dock-weather-timeline\s*\{[\s\S]*?height:\s*52px;/);
assert.match(styles, /\.mobile-dock-radar \.weather-time-timeline\s*\{[\s\S]*?height:\s*42px;[\s\S]*?margin:\s*10px 0 0;/);
assert.match(
  panel,
  /function updateMobileRadarSliderProgress[\s\S]*?syncWeatherTimelineActiveTick\(timeline,\s*value\)/
);
assert.match(panel, /root\.addEventListener\("selectstart", preventTimelineSelection\)/);
assert.match(panel, /root\.addEventListener\("dragstart", preventTimelineSelection\)/);
assert.doesNotMatch(panel, /mobile-dock-radar-summary/);
assert.doesNotMatch(styles, /\.mobile-context-dock\[data-tab="radar"\]\s*\{/);
assert.match(styles, /\.map-community-report-button\s*\{[\s\S]*?right:\s*17px;[\s\S]*?display:\s*grid;/);
assert.match(styles, /#community-report-open::before\s*\{[\s\S]*?--community-report-icon/);
assert.match(styles, /\.radar-action-button::before\s*\{[\s\S]*?--radar-action-icon/);
assert.match(panel, /playButton\.setAttribute\("aria-label", label\)/);
for (const [action, label] of [["prev", "前"], ["latest", "最新"], ["next", "次"]]) {
  assert.match(
    panel,
    new RegExp(`data-weather-chart-action="${action}"[^\\r\\n]*aria-label="${label}"[^\\r\\n]*><\\/button>`, "u")
  );
}
assert.match(styles, /\[data-weather-chart-action="prev"\][\s\S]*?--radar-action-icon/);
assert.match(styles, /\[data-weather-chart-action="latest"\][\s\S]*?--radar-action-icon/);
assert.match(styles, /\[data-weather-chart-action="next"\][\s\S]*?--radar-action-icon/);
assert.match(
  styles,
  /\.weather-time-timeline,\s*\.weather-time-timeline \*\s*\{[\s\S]*?-webkit-user-select:\s*none;[\s\S]*?user-select:\s*none;/
);
assert.match(styles, /\.weather-time-timeline\s*\{[\s\S]*?-webkit-touch-callout:\s*none;/);
assert.match(styles, /\.weather-time-timeline\.is-dragging :is\(\.weather-time-labels, \.weather-time-ticks\)\s*\{[\s\S]*?transition:\s*none;/);
assert.match(styles, /\.weather-time-timeline\.is-dragging \.weather-time-ticks span\.active\s*\{[\s\S]*?opacity:\s*1;/);
assert.match(styles, /\.weather-time-active-marker\s*\{[\s\S]*?left:\s*50%/);
assert.match(styles, /\.weather-time-(?:labels|ticks)[\s\S]*?translateX\(var\(--weather-time-shift\)\)/);
assert.match(
  styles,
  /html\[data-theme="light"\] :is\(#main-tabs, \.mobile-context-dock\)\s*\{[\s\S]*?background:\s*var\(--shared-shell-glass-background\);[\s\S]*?backdrop-filter:\s*var\(--shared-shell-glass-filter\);/
);
assert.match(
  styles,
  /html\[data-theme="light"\] \.weather-time-labels span\s*\{[\s\S]*?color:\s*#405a73;/
);
assert.match(
  styles,
  /html\[data-theme="light"\] \.weather-time-active-marker\s*\{[\s\S]*?background:\s*#08a9df;/
);
assert.match(
  styles,
  /html\[data-theme="light"\] \.volcano-ash-timeline\s*\{[\s\S]*?--volcano-ash-thumb-border:\s*#167997;[\s\S]*?--volcano-ash-thumb-background:\s*#55c7db;/
);
assert.match(
  styles,
  /html\[data-theme="light"\] \.volcano-selected-header h2\s*\{[\s\S]*?color:\s*#0c2b47;[\s\S]*?font-weight:\s*950;/
);
assert.doesNotMatch(styles, /html\[data-theme="light"\] #sidebar\s*\{[\s\S]{0,320}?background:\s*rgba\(246, 250, 254, 0\.94\)/);
assert.match(
  panel,
  /class="mobile-dock-tsunami-heading">\$\{isEnglish \? "Tsunami information" : "津波情報"\}<\/div>/
);
assert.match(panel, /`Epicenters · \$\{periodLabel\} · \$\{rangeEnabled \? "Selected" : "Provisional"\}`/);
assert.match(panel, /\$\{isEnglish \? "Prev" : "前日"\}/);
assert.match(panel, /\$\{isEnglish \? "Next" : "翌日"\}/);
assert.match(
  styles,
  /\.earthquake-distribution-date-navigation\.compact \.earthquake-distribution-date-step\s*\{[\s\S]*?white-space:\s*nowrap;/
);
assert.match(
  styles,
  /\.mobile-dock-tsunami-heading,\s*\.mobile-tide-empty-heading\s*\{[\s\S]*?width:\s*max-content;[\s\S]*?min-width:\s*88px;[\s\S]*?height:\s*26px;[\s\S]*?white-space:\s*nowrap;/
);
assert.match(panel, /function applyMobileEarthquakeDetailPage\(page\)/);
assert.match(
  panel,
  /data-mobile-earthquake-detail="earthquake"[\s\S]*?data-mobile-earthquake-detail="tsunami"/
);
assert.match(
  panel,
  /const renderDetailPages = \(earthquakeMarkup\) => render\([\s\S]*?data-mobile-earthquake-detail="earthquake"[\s\S]*?data-mobile-earthquake-detail="tsunami"[\s\S]*?data-mobile-earthquake-detail="tide"/
);
assert.match(
  panel,
  /if \(view === "distribution"\) \{\s*renderDetailPages\([\s\S]*?buildEarthquakeDistributionMarkup/
);
assert.match(panel, /function buildTsunamiDedicatedDetailMarkup\(earthquake, tsunami, status\)/);
assert.doesNotMatch(panel, /class="tsunami-dedicated-header"/);
assert.doesNotMatch(panel, /class="tsunami-dedicated-level"/);
assert.doesNotMatch(styles, /\.tsunami-dedicated-header\s*\{/);
assert.match(panel, /沿岸の津波観測/);
assert.match(panel, /沖合の津波観測/);
assert.equal(panel.match(/function getCurrentTsunamiState/g)?.length, 1);
assert.match(styles, /\.earthquake-detail-mode\[hidden\]\s*\{\s*display:\s*none;/);
assert.match(styles, /\.tsunami-dedicated-panel\s*\{[\s\S]*?gap:\s*0;[\s\S]*?padding:\s*2px 2px 0;/);
assert.doesNotMatch(panel, /class="tsunami-dedicated-counts"/);
assert.match(styles, /html\[data-theme="light"\] \.tsunami-dedicated-panel\s*\{/);
assert.match(
  styles,
  /html\[data-theme="light"\] \.tsunami-observation-station\s*\{[\s\S]*?color:\s*#102a43 !important;/
);
assert.match(
  styles,
  /html\[data-theme="light"\] \.tsunami-observation-station small\s*\{[\s\S]*?color:\s*#526980;[\s\S]*?font-weight:\s*800;/
);
assert.match(
  styles,
  /\.social-share-segmented\s*\{[\s\S]*?backdrop-filter:\s*blur\(16px\) saturate\(1\.2\);/
);
assert.match(
  styles,
  /\.social-share-segmented button\.active\s*\{[\s\S]*?background:\s*rgba\(37, 135, 190, 0\.42\);[\s\S]*?box-shadow:\s*none;/
);
assert.match(
  styles,
  /html\[data-theme="light"\] \.social-share-segmented\s*\{[\s\S]*?background:\s*rgba\(232, 243, 251, 0\.56\);/
);
assert.match(
  styles,
  /html\[data-theme="light"\] \.social-share-segmented button\.active\s*\{[\s\S]*?background:\s*rgba\(116, 198, 236, 0\.42\);[\s\S]*?box-shadow:\s*none;/
);
for (const metric of ["temperature", "precipitation", "wind", "humidity", "pressure", "snow"]) {
  assert.match(
    styles,
    new RegExp(`data-mobile-amedas-metric="${metric}"[^}]*::after`)
  );
  assert.match(
    styles,
    new RegExp(`data-amedas-ranking-title="${metric}"[^}]*::after`)
  );
}
assert.match(
  styles,
  /html\[data-language="en"\] \.mobile-dock-amedas-grid \.mobile-dock-chip\s*\{[\s\S]*?display:\s*flex;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?height:\s*30px;[\s\S]*?padding:\s*0;/
);
assert.match(
  styles,
  /\.mobile-dock-amedas-head\s*>\s*\.mobile-dock-kicker\s*\{[\s\S]*?min-width:\s*max-content;[\s\S]*?white-space:\s*nowrap;/
);
assert.match(
  styles,
  /\.mobile-dock-earthquake-layer\s*\{[\s\S]*?white-space:\s*nowrap;/
);
assert.match(
  styles,
  /\.mobile-dock-earthquake-facts \.earthquake-tsunami-status\s*\{[\s\S]*?flex:\s*0 0 auto;[\s\S]*?white-space:\s*nowrap;/
);
assert.match(
  styles,
  /html\[data-language="en"\] \.tab-button-label\s*\{[\s\S]*?font-size:\s*9px;/
);
assert.doesNotMatch(
  styles,
  /\.mobile-dock-amedas-grid \[data-amedas-metric=/
);
assert.match(panel, /data-amedas-ranking-title="\$\{escapeHtml\(metric\.id\)\}"/);
assert.match(
  styles,
  /html\[data-language="en"\] \.warning-area-row > strong\s*\{[\s\S]*?white-space:\s*nowrap;/
);

console.log("Responsive layouts: OK");
