import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [styles, index, panel] = await Promise.all([
  readFile(new URL("../src/style.css", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8")
]);

assert.match(styles, /--sidebar-width:\s*clamp\(300px,\s*24vw,\s*380px\)/);
assert.match(styles, /grid-template-columns:\s*var\(--sidebar-width\)\s+minmax\(0,\s*1fr\)/);
assert.match(
  styles,
  /@media \(orientation: landscape\) and \(max-width: 1024px\) and \(max-height: 600px\)/
);
assert.match(styles, /#main-tabs\s*\{[\s\S]*?bottom:\s*max\(8px,\s*env\(safe-area-inset-bottom\)\)/);
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
assert.match(panel, /function buildWeatherTimeTimelineMarkup/);
assert.match(panel, /class="weather-time-active-marker"/);
assert.match(panel, /--weather-time-shift:/);
assert.match(panel, /const step = compact \? 30 : 40/);
assert.match(panel, /data-mobile-weather-chart-slider/);
assert.match(panel, /data-mobile-radar-slider/);
assert.match(panel, /function updateSliderFromTimelineDrag/);
assert.match(panel, /Math\.round\(\(startX - clientX\) \/ frameWidth\)/);
assert.equal(panel.match(/function updateSliderFromTimelineDrag/g)?.length, 1);
assert.match(styles, /\.weather-time-active-marker\s*\{[\s\S]*?left:\s*50%/);
assert.match(styles, /\.weather-time-(?:labels|ticks)[\s\S]*?translateX\(var\(--weather-time-shift\)\)/);

console.log("Responsive layouts: OK");
