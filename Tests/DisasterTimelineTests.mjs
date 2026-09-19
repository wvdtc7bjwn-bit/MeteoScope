import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  DISASTER_TIMELINE_CATEGORIES,
  DISASTER_TIMELINE_EVENTS,
  filterDisasterTimelineEvents,
  formatDisasterTimelineDate,
  getDisasterTimelineEra
} from "../src/domain/disasterTimeline.js";
import { buildDisasterTimelineMarkup } from "../src/ui/disasterTimelineModal.js";

assert.ok(DISASTER_TIMELINE_EVENTS.length >= 100, "年表には主要災害を十分に収録する");
assert.deepEqual(
  new Set(DISASTER_TIMELINE_EVENTS.map((item) => item.category)),
  new Set(["earthquake", "volcano", "flood", "snow"])
);
assert.equal(new Set(DISASTER_TIMELINE_EVENTS.map((item) => item.id)).size, DISASTER_TIMELINE_EVENTS.length);
assert.equal(
  new Set(DISASTER_TIMELINE_EVENTS.map((item) => `${item.occurredOn}:${item.title}`)).size,
  DISASTER_TIMELINE_EVENTS.length,
  "同じ日付・名称の重複を登録しない"
);
assert.equal(DISASTER_TIMELINE_CATEGORIES[0].id, "all");

for (const item of DISASTER_TIMELINE_EVENTS) {
  assert.match(item.occurredOn, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(item.year, Number(item.occurredOn.slice(0, 4)));
  assert.ok(item.title && item.region && item.summary);
  assert.match(item.source.url, /^https:\/\/(www\.)?(bousai\.go\.jp|jma\.go\.jp|data\.jma\.go\.jp|mlit\.go\.jp)\//);
}

assert.equal(getDisasterTimelineEra(2024), "2000-present");
assert.equal(getDisasterTimelineEra(1995), "1950-1999");
assert.equal(getDisasterTimelineEra(1923), "before-1950");

const newestFirst = filterDisasterTimelineEvents();
assert.equal(newestFirst[0].id, "chiba-rain-2026");
assert.equal(newestFirst.at(-1).id, "genroku-1703");
assert.ok(newestFirst.some((item) => item.year === 2025));
assert.ok(newestFirst.some((item) => item.year === 2026));

const oldestVolcanoes = filterDisasterTimelineEvents(DISASTER_TIMELINE_EVENTS, {
  category: "volcano",
  direction: "asc"
});
assert.equal(oldestVolcanoes[0].id, "fuji-hoei-1707");
assert.ok(oldestVolcanoes.every((item) => item.category === "volcano"));

const modernFloods = filterDisasterTimelineEvents(DISASTER_TIMELINE_EVENTS, {
  category: "flood",
  era: "2000-present"
});
assert.ok(modernFloods.length >= 8);
assert.ok(modernFloods.every((item) => item.category === "flood" && item.year >= 2000));

assert.deepEqual(
  filterDisasterTimelineEvents(DISASTER_TIMELINE_EVENTS, { query: "能登" }).map((item) => item.id),
  ["noto-2024", "noto-2007"]
);
assert.ok(filterDisasterTimelineEvents(DISASTER_TIMELINE_EVENTS, { query: "北海道" }).length >= 2);
assert.equal(formatDisasterTimelineDate(DISASTER_TIMELINE_EVENTS.find((item) => item.id === "noto-2024")), "2024年1月1日");

const notoEvent = DISASTER_TIMELINE_EVENTS.find((item) => item.id === "noto-2024");
const markup = buildDisasterTimelineMarkup([notoEvent]);
assert.match(markup, /令和6年能登半島地震/);
assert.match(markup, /地震・津波/);
assert.match(markup, /target="_blank" rel="noopener noreferrer"/);
assert.match(markup, /data\.jma\.go\.jp/);

const escapedMarkup = buildDisasterTimelineMarkup([{
  ...notoEvent,
  title: "<script>alert(1)</script>"
}]);
assert.doesNotMatch(escapedMarkup, /<script>/);
assert.match(escapedMarkup, /&lt;script&gt;/);
assert.match(buildDisasterTimelineMarkup([]), /該当する災害がありません/);

const [html, appSource, css] = await Promise.all([
  readFile(new URL("../index.html", import.meta.url), "utf8"),
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/style.css", import.meta.url), "utf8")
]);

assert.match(html, /id="map-utility-actions"[\s\S]*id="disaster-timeline-button"/);
assert.match(html, /aria-controls="disaster-timeline-modal"/);
assert.match(html, /id="disaster-timeline-modal"/);
assert.match(html, /data-disaster-timeline-category="earthquake"/);
assert.match(html, /data-disaster-timeline-category="volcano"/);
assert.match(html, /data-disaster-timeline-category="flood"/);
assert.match(html, /data-disaster-timeline-category="snow"/);
assert.match(html, /風水害、雪害の主な記録/);
assert.match(html, /class="disaster-timeline-filter-heading"/);
assert.match(html, /id="disaster-timeline-count"/);
assert.match(appSource, /setupDisasterTimelineModal\(\)/);
assert.match(css, /\.disaster-timeline-open-button::before/);
assert.match(css, /\.disaster-timeline-panel/);
assert.match(css, /\.disaster-timeline-filter-heading/);
assert.match(css, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
assert.match(css, /\.disaster-timeline-list::before\s*\{[\s\S]*?width: 1px;/);
assert.match(css, /\.disaster-timeline-marker\s*\{[\s\S]*?width: 7px;/);
assert.match(css, /\.disaster-timeline-item\s*\{\s*--timeline-category-color: #d2a653;/);
assert.match(css, /\.disaster-timeline-item\.is-flood\s*\{\s*--timeline-category-color: #5eafd6;/);
assert.match(css, /\.disaster-timeline-category::before/);
assert.match(css, /\.disaster-timeline-card\s*\{[\s\S]*?background: var\(--timeline-entry\);/);
assert.match(css, /backdrop-filter: none/);

console.log("Disaster timeline tests passed.");
