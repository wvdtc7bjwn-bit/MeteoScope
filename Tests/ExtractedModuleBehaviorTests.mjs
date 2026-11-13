import assert from "node:assert/strict";
import { buildEarthquakeFocusCoordinates, buildTyphoonFocusCoordinates, buildWorldTyphoonFocusCoordinates } from "../src/app/focusCoordinates.js";
import { mergeRefreshedData, mergeWarningTabData } from "../src/app/refreshedData.js";
import { renderVolcanoList } from "../src/ui/panels/volcanoPanel.js";
import { createTyphoonCircleFeature, createTyphoonForecastAreaFeatures } from "../src/map/typhoonFeatures.js";

// Camera bounds must keep observed stations and reject invalid coordinates.
assert.deepEqual(buildEarthquakeFocusCoordinates(null), []);
assert.deepEqual(buildEarthquakeFocusCoordinates({ coordinates: [140, 36], intensityStations: [{ coordinates: [141, 37] }, { coordinates: [NaN, 0] }] }), [[140, 36], [141, 37]]);
const bounds = [[139, 35], [142, 38]];
assert.deepEqual(buildEarthquakeFocusCoordinates({ coordinates: [140, 36], estimatedIntensity: { bounds }, intensityAreaFeatures: [{ geometry: { type: "Polygon", coordinates: [[[100, 10], [101, 11]]] } }] }), [[140, 36], ...bounds]);
assert.deepEqual(buildTyphoonFocusCoordinates(null), []);
const focus = buildTyphoonFocusCoordinates({ center: [179, 20], strongWindRadius: 100, forecastTrack: [[-179, 21]] });
assert.ok(focus.some(([lng]) => lng === -179));
assert.ok(focus.every((point) => point.length === 2 && point.every(Number.isFinite)));
assert.deepEqual(buildWorldTyphoonFocusCoordinates({ worldForecastLayers: [{ system: { id: "selected" }, forecastPositions: [{ system: { id: "other" }, position: { coordinates: [130, 25] } }, { system: { id: "selected" }, position: { coordinates: [140, 30] } }] }] }), [[140, 30]]);

// A weather refresh must not discard rankings or loaded warning details.
const rankings = { status: "ok", items: [1] };
assert.equal(mergeRefreshedData("amedas", { temperatureRankings: rankings }, { temperatureRankings: { status: "error" } }).temperatureRankings, rankings);
const old = { earlyDetailsLoaded: true, earlyWarnings: ["early"], activeAreas: [{ areaCode: "a", outlook: ["forecast"] }], statusDetailsLoaded: true, statusDetailAreaCodes: ["a"] };
const next = { detailsLoaded: true, activeAreas: [{ areaCode: "a", name: "updated" }], groups: [{ areas: [{ areaCode: "a" }] }] };
const merged = mergeWarningTabData(old, next);
assert.deepEqual(merged.activeAreas[0].outlook, ["forecast"]);
assert.equal(merged.groups[0].areas[0], merged.activeAreas[0]);
assert.deepEqual(merged.earlyWarnings, ["early"]);
assert.equal(next.activeAreas[0].outlook, undefined);
const frames = [{ validtime: "a", isForecast: false }, { validtime: "b", isForecast: false }];
const refreshed = mergeRefreshedData("radar", { frames, activeFrameIndex: 0 }, { frames: [...frames, { validtime: "c", isForecast: false }] });
assert.equal(refreshed.activeFrameIndex, 0);

// The extracted renderer still escapes external bulletin text.
let markup = "";
renderVolcanoList({ status: "loading" }, (html) => { markup = html; });
assert.match(markup, /取得中/);
renderVolcanoList({ status: "error" }, (html) => { markup = html; });
assert.match(markup, /取得できません/);
renderVolcanoList({ data: { reports: [{ volcanoCode: "test", volcanoName: "<script>test</script>", level: 2, activity: "<b>activity</b>" }] }, selectedVolcanoCode: "test" }, (html) => { markup = html; });
assert.ok(!markup.includes("<script>test</script>"));
assert.match(markup, /&lt;script&gt;/);
assert.equal(createTyphoonCircleFeature(null, 10, {}), null);
assert.deepEqual(createTyphoonForecastAreaFeatures({ center: [179, 20], forecastCircles: [] }), []);
const circle = createTyphoonCircleFeature([179, 20], 100, { kind: "test" });
assert.equal(circle.geometry.type, "Polygon");
assert.deepEqual(circle.geometry.coordinates[0][0], circle.geometry.coordinates[0].at(-1));
console.log("Extracted panel, focus, refresh and geometry behavior tests passed");
import { readFile } from "node:fs/promises";

// Bundlers may discard unused imports; browsers still validate every named binding.
for (const [sourceFile, specifier, targetFile] of [
  ["../src/app.js", "./app/focusCoordinates.js", "../src/app/focusCoordinates.js"],
  ["../src/app.js", "./app/refreshedData.js", "../src/app/refreshedData.js"],
  ["../src/ui/leftPanel.js", "./panels/volcanoPanel.js", "../src/ui/panels/volcanoPanel.js"],
  ["../src/map/weatherMap.js", "./typhoonFeatures.js", "../src/map/typhoonFeatures.js"]
]) {
  const source = await readFile(new URL(sourceFile, import.meta.url), "utf8");
  const pattern = /import\s*\{([^}]+)\}\s*from\s*["']([^"']+)["']/g;
  const declaration = [...source.matchAll(pattern)].find((match) => match[2] === specifier);
  assert.ok(declaration, `Missing import of ${specifier}`);
  const exports = await import(targetFile);
  for (const binding of declaration[1].split(",").map((text) => text.trim()).filter(Boolean)) {
    const name = binding.split(/\s+as\s+/)[0];
    assert.ok(Object.hasOwn(exports, name), `${specifier} does not export ${name}`);
  }
}
