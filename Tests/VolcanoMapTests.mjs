import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createPropertyExpression, validateStyleMin, v8 } from "@maplibre/maplibre-gl-style-spec";
import { getVolcanoLevelColor, VOLCANO_UNKNOWN_LEVEL_COLOR } from "../src/volcanoLevels.js";
import { getHighestPriorityVolcanoReport } from "../src/jma/volcanoXml.js";

const source = readFileSync(new URL("../src/map/weatherMap.js", import.meta.url), "utf8").replace(/\r\n/g, "\n");
const layers = [];
const context = vm.createContext({ map: { addLayer: layer => layers.push(layer) }, activeTheme: "dark",
  SAMPLE_SOURCE_ID: "test-volcanoes", VOLCANO_MARKER_IMAGE_ID: "volcano-filled-triangle",
  VOLCANO_UNKNOWN_LEVEL_COLOR, getVolcanoMarkerColor: getVolcanoLevelColor, getHighestPriorityVolcanoReport,
  getAvailableVolcanoAshForecasts: () => [], getVolcanoAshfallAreasForDisplay: () => [], localizeText: text => text });
vm.runInContext(source.slice(source.indexOf("const MAP_THEME_COLORS ="), source.indexOf("const EMPTY_GEOJSON")), context);
vm.runInContext(source.slice(source.indexOf("function buildVolcanoIconSizeExpression("), source.indexOf("function setupWindArrowImage(")), context);
vm.runInContext(source.slice(source.indexOf('    map.addLayer({\n      id: "sample-volcano-selection"'), source.indexOf('    map.addLayer({\n      id: "sample-label"')), context);
assert.equal(layers.length, 4);
assert.deepEqual(Array.from(layers.find(layer => layer.id === "sample-volcano-label").layout["text-writing-mode"]), ["horizontal"]);
assert.equal(layers.find(layer => layer.id === "sample-volcano-label").layout["text-max-width"], 100, "map names stay on one line");
for (const name of ["霧島山（新燃岳）", "霧島山 (新燃岳)"]) {
  assert.equal(context.formatVolcanoMapName(name), "霧島山・新燃岳");
}
assert.equal(context.formatVolcanoMapName("桜島"), "桜島");
const styleErrors = validateStyleMin({ version: 8, glyphs: "https://example.invalid/{fontstack}/{range}.pbf",
  sources: { "test-volcanoes": { type: "geojson", data: { type: "FeatureCollection", features: [] } } }, layers });
assert.deepEqual(styleErrors.map(error => error.message), [], "all new layer filters and expressions must be valid MapLibre styles");

const compile = (expression, spec) => {
  const result = createPropertyExpression(expression, spec);
  assert.equal(result.result, "success", JSON.stringify(result.value));
  return (properties, zoom = 4) => result.value.evaluate({ zoom }, { type: "Point", properties });
};
const size = compile(context.buildVolcanoIconSizeExpression("dark"), v8.layout_symbol["icon-size"]);
assert.ok(size({ selected: true, level: 1 }) > size({ selected: false, level: 3 }));
assert.ok(size({ selected: false, level: 3 }) > size({ selected: false, level: 1 }));
assert.ok(size({ selected: false, level: 1 }, 9) > size({ selected: false, level: 1 }, 4));
const label = compile(layers.find(layer => layer.id === "sample-volcano-label").layout["text-field"], v8.layout_symbol["text-field"]);
const text = properties => label(properties).toString();
assert.equal(text({ selected: false, level: 1, volcanoName: "通常の火山" }), "");
assert.equal(text({ selected: true, level: 1, volcanoName: "選択中" }), "選択中");
assert.equal(text({ selected: false, level: 2, volcanoName: "警戒中" }), "警戒中");
assert.equal(label({ selected: false, level: 1, volcanoName: "拡大時" }, 8).toString(), "拡大時");

vm.runInContext(source.slice(source.indexOf("function createEarthquakeFeatures("), source.indexOf("function createEarthquakeAreaIntensityMarkers(")), context);
const reports = [
  { volcanoCode: "test-a", volcanoName: "通常の火山", coordinates: [140, 36], level: 1 },
  { volcanoCode: "test-b", volcanoName: "警戒中の火山", coordinates: [141, 37], level: 3 },
  { volcanoCode: "test-c", volcanoName: "位置なし", level: 1 }
];
const render = selectedVolcanoCode => context.createEarthquakeFeatures({ earthquakeContentMode: "volcano", reports, selectedVolcanoCode });
const features = render("test-a");
assert.equal(features.length, 2);
assert.equal(features.filter(feature => feature.properties.selected).length, 1);
assert.equal(features.find(feature => feature.properties.selected).properties.volcanoName, "通常の火山");
assert.ok(features[0].properties.sortKey > features[1].properties.sortKey, "selected marker is drawn and hit-tested above nearby markers");
assert.equal(render("").find(feature => feature.properties.selected).properties.volcanoCode, "test-b", "initial selection agrees with the highest-priority summary");
assert.equal(reports[0].volcanoCode, "test-a", "feature generation does not reorder caller data");
const interactive = source.match(/const EARTHQUAKE_INTERACTIVE_LAYERS = (\[[^;]+\]);/)[1];
assert.equal((interactive.match(/sample-volcano/g) ?? []).length, 1, "one layer handles taps, avoiding duplicate selection callbacks");
assert.match(interactive, /sample-volcano-hit/);
console.log("Volcano map: valid MapLibre styles, zoom/priority/selection hierarchy, label decluttering and single tap routing passed");
