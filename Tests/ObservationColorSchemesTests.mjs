import assert from "node:assert/strict";
import { normalizeObservationColors, loadObservationColors, getObservationColors, setObservationColors, OBSERVATION_COLOR_SCHEMES } from "../src/preferences/observationColors.js";
import { getAmedasDisplayLevels, getAmedasObservationColor } from "../src/config.js";
import { EARTHQUAKE_INTENSITY_LEVELS, getEarthquakeIntensityColor, getEarthquakeIntensityMarkerTextColor } from "../src/earthquakeIntensity.js";
import { applyLongPeriodColors, getLongPeriodClassStyle } from "../src/earthquake/longPeriodGroundMotion.js";
import { getRecoloredEstimatedIntensityImageData, recolorEstimatedIntensityPixels } from "../src/jma/estimatedIntensity.js";
import { prepareEarthquakeSimulation } from "../src/simulation/earthquakeSimulation.js";
import { buildAmedasColorLegend, renderAmedasColorLegend } from "../src/ui/amedasColorLegend.js";

const defaults = { amedas: "meteoscope", intensity: "meteoscope", longPeriod: "meteoscope" };
const values = new Map();
const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
const denied = { getItem() { throw Error("denied"); }, setItem() { throw Error("denied"); } };
assert.deepEqual(loadObservationColors(denied), defaults);
assert.deepEqual(normalizeObservationColors({ amedas: "invalid", intensity: "jma", extra: "jma" }), { ...defaults, intensity: "jma" });
setObservationColors(defaults, storage);
const ownTemperature = getAmedasObservationColor("temperature", 18.6);
for (const value of [-10, -15, -20, -25]) {
  assert.ok(getAmedasDisplayLevels("temperature").some(level => level.min === value));
  assert.ok(buildAmedasColorLegend("temperature").rows.some(row => row.min === value));
}
assert.equal(getAmedasObservationColor("temperature", -25), getAmedasObservationColor("temperature", -30), "the coldest gradient endpoint is clamped continuously");
assert.notEqual(getAmedasObservationColor("temperature", -12.5), getAmedasObservationColor("temperature", -15), "new cold ranges retain continuous interpolation");
assert.equal(getEarthquakeIntensityColor("1"), "#01aff9");

setObservationColors({ amedas: "jma" }, storage);
assert.deepEqual(loadObservationColors(storage), { ...defaults, amedas: "jma" });
assert.equal(getEarthquakeIntensityColor("1"), "#01aff9", "AMeDAS does not change earthquake colors");
// Current JMA Amedas.Common.elemInfo definitions, including extended cold bins.
for (const [value, color] of [[40,"#50002e"],[39.9,"#b40068"],[30,"#ff2800"],[25,"#ff9900"],[20,"#faf500"],[15,"#ffff96"],[10,"#fffff0"],[5,"#b9ebff"],[0,"#0096ff"],[-5,"#0041ff"],[-10,"#002080"],[-15,"#4d4471"],[-20,"#776fa4"],[-25,"#a8a3c5"],[-25.1,"#d8d6e4"]]) {
  assert.equal(getAmedasObservationColor("temperature", value), color, `official temperature bin at ${value}`);
}
assert.equal(getAmedasObservationColor("temperature", 18.6), "#ffff96", "JMA is discrete, not interpolated");
for (const [metric, value, color] of [["humidity",100,"#011f7d"],["humidity",50,"#fffff0"],["humidity",9.9,"#540600"],["wind",25,"#b40068"],["wind",4.9,"#f2f2ff"],["snow",1,"#a0d2ff"],["snow",200,"#b40068"]]) {
  assert.equal(getAmedasObservationColor(metric, value), color);
}
for (const [period, boundary] of [["10m",30],["1h",80],["3h",150],["24h",300]]) {
  assert.equal(getAmedasObservationColor("precipitation", boundary, period), "#b40068");
  const legend = getAmedasDisplayLevels("precipitation", period);
  for (const level of legend) if (Number.isFinite(level.min)) {
    assert.equal(getAmedasObservationColor("precipitation", level.min, period), level.color, "marker and legend agree at boundaries");
  }
  assert.equal(getAmedasObservationColor("precipitation", 0.5, period), "#f2f2ff");
}
assert.equal(getAmedasObservationColor("pressure", 980), getAmedasObservationColor("pressure", 1040));
assert.equal(getAmedasObservationColor("pressure", 1013), "#ffffff", "official map uses white when no classified scale exists");
assert.match(getAmedasDisplayLevels("pressure")[0].label, /階級別配色なし/);

setObservationColors({ intensity: "jma", longPeriod: "jma" }, storage);
const officialIntensity = { "1":"#f2f2ff", "2":"#00aaff", "3":"#0041ff", "4":"#fae696", "5-":"#ffe600", "5+":"#ff9900", "6-":"#ff2800", "6+":"#a50021", "7":"#b40068" };
for (const [grade, color] of Object.entries(officialIntensity)) {
  assert.equal(getEarthquakeIntensityColor(grade), color);
  assert.equal(EARTHQUAKE_INTENSITY_LEVELS.find(level => level.value === grade).color, color, "legend follows the selected scheme");
}
assert.equal(getEarthquakeIntensityColor("5"), officialIntensity["5-"]);
assert.equal(getEarthquakeIntensityColor("6"), officialIntensity["6-"]);
assert.equal(getEarthquakeIntensityMarkerTextColor("3"), "#f8fbff");
assert.equal(getEarthquakeIntensityMarkerTextColor("5-"), "#07162b");
assert.equal(getEarthquakeIntensityColor(null), "#4b5563");
const variables = new Map();
applyLongPeriodColors({ style: { setProperty: (key, value) => variables.set(key, value) } });
for (const [grade, color] of [[1,"#0041ff"],[2,"#ffe600"],[3,"#ff2800"],[4,"#a50021"]]) {
  assert.equal(getLongPeriodClassStyle(grade).color, color);
  assert.equal(variables.get(`--long-period-${grade}-bg`), color, "retained history badges update through shared variables");
}

const simulation = await prepareEarthquakeSimulation({ magnitude: 6 }, { "001": { code: "001", latitude: 35.68, longitude: 139.76 } });
const time = simulation.stations[0].shakingDecayStartSec;
const jmaFrame = simulation.frame(time, { renderOnly: true });
setObservationColors({ intensity: "meteoscope" }, storage);
const ownFrame = simulation.frame(time, { renderOnly: true });
assert.notEqual(jmaFrame.stations.features[0], ownFrame.stations.features[0], "a paused frame must not reuse old colors");
assert.notEqual(jmaFrame.stations.features[0].properties.color, ownFrame.stations.features[0].properties.color);
assert.deepEqual(jmaFrame.event, ownFrame.event, "colors cannot change magnitudes, intensity estimates or EEW timing");
assert.equal(simulation.frame(time, { renderOnly: true }).stations.features[0], ownFrame.stations.features[0], "unchanged frames still reuse their immutable features");

// A deferred image load must retain its requested palette across a later toggle.
const originals = { fetch: globalThis.fetch, document: globalThis.document, createImageBitmap: globalThis.createImageBitmap };
const pending = [];
let fetches = 0;
try {
  globalThis.fetch = () => {
    fetches++;
    return new Promise(resolve => { pending.push(() => resolve(new Response(new Uint8Array([0])))); });
  };
  globalThis.createImageBitmap = async () => ({ width: 1, height: 1, close() {} });
  globalThis.document = { createElement() {
    const data = new Uint8ClampedArray([250,231,151,255]);
    return { getContext: () => ({ drawImage() {}, getImageData: () => ({ data }), putImageData() {} }),
      toBlob: callback => callback(new Blob([data])) };
  } };
  const own = getRecoloredEstimatedIntensityImageData("https://example.test/palette.png");
  setObservationColors({ intensity: "jma" }, storage);
  const jma = getRecoloredEstimatedIntensityImageData("https://example.test/palette.png");
  pending.forEach(resolve => resolve());
  assert.deepEqual([...new Uint8Array(await own)], [248,179,4,255]);
  assert.deepEqual([...new Uint8Array(await jma)], [250,230,150,255]);
  assert.equal(await getRecoloredEstimatedIntensityImageData("https://example.test/palette.png"), await jma);
  assert.equal(fetches, 2, "image caches are isolated by palette and reused within it");
  const transparent = new Uint8ClampedArray([250,231,151,0]);
  assert.deepEqual(recolorEstimatedIntensityPixels(transparent), transparent);
} finally { Object.assign(globalThis, originals); }

setObservationColors(defaults, denied);
assert.deepEqual(getObservationColors(), defaults, "denied storage must not prevent in-session changes");
assert.equal(getAmedasObservationColor("temperature", 18.6), ownTemperature);
assert.equal(getEarthquakeIntensityColor("1"), "#01aff9");
assert.equal(getLongPeriodClassStyle(1).color, "#00a9e8");
const legendRowCounts = new Map();
for (const scheme of OBSERVATION_COLOR_SCHEMES) {
  setObservationColors({ amedas: scheme }, storage);
  for (const metric of ["temperature", "precipitation", "wind", "humidity", "pressure", "snow"]) {
    for (const period of metric === "precipitation" ? ["10m", "1h", "3h", "24h"] : ["1h"]) {
      const legend = buildAmedasColorLegend(metric, period);
      assert.equal(legend.metric.id, metric);
      assert.equal(legend.period, period);
      assert.ok(legend.rows.length);
      for (let index = 1; index < legend.rows.length; index++) assert.ok(legend.rows[index - 1].min > legend.rows[index].min, "legend always lists high to low");
      const key = `${metric}:${period}`;
      if (!legendRowCounts.has(key)) legendRowCounts.set(key, legend.gridRowCount);
      assert.equal(legend.gridRowCount, legendRowCounts.get(key), "the next setting does not jump vertically on palette changes");
      assert.ok(legend.gridRowCount * 2 >= legend.rows.length);
      assert.match(renderAmedasColorLegend(metric, period), /class="settings-color-gradient"/, "each scheme reserves the color bar slot");
      for (const level of getAmedasDisplayLevels(metric, period)) assert.equal(typeof level.label, "string", "map legends retain labels for every scale");
      if (legend.gradient) {
        const first = legend.rows[0].min, last = legend.rows.at(-1).min;
        for (const stop of legend.stops) {
          const value = first + (last - first) * stop.position / 100;
          assert.equal(stop.color, getAmedasObservationColor(metric, value, period), "preview gradient samples the real map scale");
        }
        for (const row of legend.rows) assert.ok(row.label.includes(legend.metric.unit));
      } else {
        assert.deepEqual(legend.rows, getAmedasDisplayLevels(metric, period), "discrete legends include every bin, including coldest and highest");
      }
    }
  }
}
setObservationColors({ amedas: "jma" }, storage);
assert.equal(buildAmedasColorLegend("temperature").rows.length, 15, "all official temperature bins are shown");
assert.match(renderAmedasColorLegend("temperature"), /-25℃未満/);
assert.match(renderAmedasColorLegend("precipitation", "24h"), /300mm以上/);
assert.match(renderAmedasColorLegend("pressure"), /階級別配色なし/);
assert.equal(buildAmedasColorLegend("invalid").metric.id, "temperature");
setObservationColors(defaults, storage);
console.log("Observation colors: independent preferences, official bins, aligned legends, storage failures, simulation cache and asynchronous image isolation passed");
