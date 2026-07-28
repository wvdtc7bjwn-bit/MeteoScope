import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const app = read("src", "app.js");
const config = read("src", "config.js");
const xml = read("src", "jma", "earthquakeXml.js");
const leftPanel = read("src", "ui", "leftPanel.js");
const worker = read("workers", "earthquake-realtime", "src", "index.js");
const workerConfig = read("workers", "earthquake-realtime", "wrangler.toml");
const pagesProxy = read("functions", "api", "earthquakes", "[[path]].js");

assert.match(app, /fetchEarthquakeXmlList/u);
assert.doesNotMatch(app, /Dmdata|DMDATA|startDmdataEarthquakeUpdates/u);
assert.match(config, /developer\/xml\/feed\/eqvol\.xml/u);
assert.match(config, /developer\/xml\/feed\/eqvol_l\.xml/u);
assert.match(xml, /VXSE5\[1-3\]/u);
assert.match(xml, /VTSE\(\?:41\|51\|52\)/u);
assert.match(xml, /Earthquake XML detail unavailable/u);
assert.match(xml, /EARTHQUAKE_XML_INITIAL_DETAIL_FETCH_LIMIT\s*=\s*48/u);
assert.match(xml, /EARTHQUAKE_XML_DETAIL_FETCH_INCREMENT\s*=\s*48/u);
assert.match(xml, /EARTHQUAKE_XML_MAX_DETAIL_FETCH_LIMIT\s*=\s*144/u);
assert.match(xml, /earthquakeHistoryHasMoreSourceEntries/u);
assert.match(xml, /tsunamiReport:\s*tsunamiReportsByEventId\.get/u);
assert.match(xml, /isCancellation/u);
assert.match(xml, /EARTHQUAKE_HISTORY_INITIAL_VISIBLE_COUNT\s*=\s*11/u);
assert.match(xml, /EARTHQUAKE_HISTORY_LOAD_MORE_COUNT\s*=\s*15/u);
assert.match(app, /onHistoryLoadMore:\s*loadMoreEarthquakeHistory/u);
assert.match(app, /targetVisibleCount\s*=\s*previousVisibleCount\s*\+\s*EARTHQUAKE_HISTORY_LOAD_MORE_COUNT/u);
assert.match(app, /earthquakes\?\.length\s*\?\?\s*0\)\s*<\s*targetVisibleCount/u);
assert.match(app, /older earthquake history load failed/u);
assert.match(leftPanel, /data-earthquake-history-load-more/u);
assert.match(leftPanel, /earthquakes\.slice\(0,\s*visibleCount\)/u);
assert.match(leftPanel, /isCancellation\s*\?\s*"解除"/u);

assert.match(worker, /readJmaDailyHypocenterDistribution/u);
assert.doesNotMatch(worker, /DMDATA|EARTHQUAKE_HUB|MeteoScopeEarthquakeHub/u);
assert.doesNotMatch(workerConfig, /^DMDATA_[A-Z_]+\s*=/mu);
assert.doesNotMatch(workerConfig, /durable_objects/u);
assert.match(workerConfig, /deleted_classes\s*=\s*\["MeteoScopeEarthquakeHub"\]/u);
assert.match(pagesProxy, /HYPOCENTER_ARCHIVE/u);
assert.match(pagesProxy, /earthquake-worker\.internal\/api\/earthquakes/u);
assert.doesNotMatch(pagesProxy, /EARTHQUAKE_REALTIME/u);

console.log("JMA earthquake source tests passed.");
