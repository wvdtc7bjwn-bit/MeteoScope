import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildHimawariInfraredTileUrl,
  isHimawariTimestampEqualToJstTime,
  normalizeHimawariSatelliteFrames
} from "../src/jma/himawariSatellite.js";
import { findRadarObservationFrameIndexAtTime } from "../src/jma/radar.js";

const frames = normalizeHimawariSatelliteFrames([
  { basetime: "20260918205000" },
  { basetime: "20260918210000" },
  { basetime: "20260918211000" }
]);

assert.equal(frames.length, 3);
assert.equal(buildHimawariInfraredTileUrl("20260918211000"), "https://www.jma.go.jp/bosai/himawari/data/satimg/20260918211000/fd/20260918211000/B13/TBB/{z}/{x}/{y}.jpg");
assert.equal(buildHimawariInfraredTileUrl("invalid"), "");
assert.equal(frames.at(-1)?.observedAt, "2026/09/19 06:10");
assert.equal(isHimawariTimestampEqualToJstTime("20260918211000", "2026/09/19 06:10"), true);
assert.equal(isHimawariTimestampEqualToJstTime("20260918211000", "2026/09/19 06:00"), false);
assert.equal(findRadarObservationFrameIndexAtTime([
  { validtime: "20260918210000", isForecast: false },
  { validtime: "20260918211000", isForecast: false },
  { validtime: "20260918211500", isForecast: true }
], "20260918211000"), 1);
assert.equal(findRadarObservationFrameIndexAtTime([{ validtime: "20260918211000", isForecast: true }], "20260918211000"), -1);

const [appSource, panelSource, mapSource, indexSource] = await Promise.all([
  readFile(new URL("../src/app.js", import.meta.url), "utf8"),
  readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8"),
  readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
  readFile(new URL("../index.html", import.meta.url), "utf8")
]);
assert.match(appSource, /getWeatherChartSatelliteState\(\)/);
assert.match(appSource, /"satellite"/);
assert.match(appSource, /onSatelliteSeek: setWeatherChartSatelliteFrame/);
assert.match(appSource, /Himawari satellite auto refresh failed/);
assert.match(appSource, /toggleWeatherChartSatelliteLayer/);
assert.match(appSource, /findRadarObservationFrameIndexAtTime\(latestDataByTab\.radar\?\.frames, frame\?\.timestamp\)/);
assert.match(panelSource, /data-radar-overlay="satellite"/);
assert.match(panelSource, /data-mobile-weather-satellite-slider/);
assert.doesNotMatch(panelSource, /satelliteActive/);
assert.match(mapSource, /updateWeatherChartSatelliteLayer\(map, mode, data\);[\s\S]*?updateWeatherChartLayer\(map, mode, data\);/);
assert.match(mapSource, /type: "raster"[\s\S]*?tiles: \[frame\.tileUrl\]/);
assert.match(mapSource, /HIMAWARI_SATELLITE_LAYER_ID[\s\S]*?"raster-opacity": 0\.58/);
assert.match(mapSource, /weatherChartSatellite\?\.weatherChartOverlayEnabled/);
assert.match(mapSource, /satellite\?\.enabled && satellite\.weatherChartOverlayEnabled/);
assert.match(mapSource, /weatherChartSatellite\?\.enabled\s*&&[\s\S]*?weatherChartSatellite\?\.weatherChartOverlayEnabled/);
assert.doesNotMatch(indexSource, /weather-chart-satellite-toggle/);

console.log("Himawari satellite tests passed");
