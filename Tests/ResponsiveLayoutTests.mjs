import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [styles, index, panel, app] = await Promise.all([
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8")
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
  /\.mobile-context-dock\s*\{[\s\S]*?height:\s*126px;[\s\S]*?min-height:\s*126px;[\s\S]*?max-height:\s*126px;/
);
assert.match(styles, /#map-attribution\s*\{[\s\S]*?max-height:\s*24px;[\s\S]*?white-space:\s*nowrap;/);
assert.match(
  styles,
  /body,\s*body \*\s*\{[\s\S]*?-webkit-user-select:\s*none;[\s\S]*?user-select:\s*none;/
);
assert.match(
  styles,
  /input,\s*textarea,\s*select,\s*option,\s*\[contenteditable="true"\],\s*\[data-user-select="text"\]\s*\{[\s\S]*?-webkit-user-select:\s*text;[\s\S]*?user-select:\s*text;/
);

assert.match(index, /width=device-width/);
assert.match(index, /viewport-fit=cover/);
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
assert.match(panel, /Math\.round\(\(startX - clientX\) \/ frameWidth\)/);
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
  /html\[data-theme="light"\] :is\(#main-tabs, \.mobile-context-dock\)\s*\{[\s\S]*?background:\s*rgba\(244, 249, 253, 0\.9\)/
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
  /html\[data-theme="light"\] \.volcano-ash-slider::\-webkit-slider-thumb\s*\{[\s\S]*?border-color:\s*#147b9f;/
);
assert.match(
  styles,
  /html\[data-theme="light"\] \.volcano-selected-header h2\s*\{[\s\S]*?color:\s*#0c2b47;[\s\S]*?font-weight:\s*950;/
);
assert.match(
  styles,
  /@media \(max-width: 800px\) and \(orientation: portrait\)\s*\{[\s\S]*?html\[data-theme="light"\] #sidebar\s*\{[\s\S]*?background:\s*rgba\(246, 250, 254, 0\.94\)/
);

console.log("Responsive layouts: OK");
