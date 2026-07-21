import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), "utf8");

const app = read("src", "app.js");
const config = read("src", "config.js");
const xml = read("src", "jma", "earthquakeXml.js");
const endpoints = read("ios", "MeteoScope", "Services", "MeteoScopeEndpoints.swift");
const client = read("ios", "MeteoScope", "Services", "WeatherAPIClient.swift");
const shell = read("ios", "MeteoScope", "App", "AppShellView.swift");
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

assert.match(endpoints, /static let earthquakeFeeds/u);
assert.doesNotMatch(endpoints, /dmdata|DMDATA/u);
assert.match(client, /fetchJMAEarthquakeSnapshot/u);
assert.match(client, /EarthquakeXMLDecoder\.feedEntries/u);
assert.doesNotMatch(client, /DMData|DMDATA|EarthquakeUpdateClient/u);
assert.doesNotMatch(shell, /EarthquakeUpdateClient|startRealtimeEarthquakeObserver/u);

assert.match(worker, /readJmaDailyHypocenterDistribution/u);
assert.doesNotMatch(worker, /DMDATA|EARTHQUAKE_HUB|MeteoScopeEarthquakeHub/u);
assert.doesNotMatch(workerConfig, /^DMDATA_[A-Z_]+\s*=/mu);
assert.doesNotMatch(workerConfig, /durable_objects/u);
assert.match(workerConfig, /deleted_classes\s*=\s*\["MeteoScopeEarthquakeHub"\]/u);
assert.match(pagesProxy, /HYPOCENTER_ARCHIVE/u);
assert.doesNotMatch(pagesProxy, /EARTHQUAKE_REALTIME/u);

console.log("JMA earthquake source tests passed.");
