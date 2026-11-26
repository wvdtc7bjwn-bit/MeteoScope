import assert from "node:assert/strict";
import { test } from "node:test";
import { buildAmedasPoints } from "../src/jma/amedas.js";
import { estimateLocalTemperature, selectTemperatureStations, fitTemperatureLapse, validatedDynamicLapse } from "../src/location/temperatureEstimation.js";
import { loadTemperatureEstimationEnabled, saveTemperatureEstimationEnabled, TEMPERATURE_ESTIMATION } from "../src/location/temperatureEstimationPolicy.js";

const stamp = "20261125150000", now = Date.parse("2026-11-25T15:05:00+09:00"), coordinates = [135, 35];
export function samples(lapse = .0065) {
  return Array.from({ length: 8 }, (_, i) => {
    const angle = i * Math.PI / 4, elevation = [30, 370, 90, 560, 150, 680, 260, 800][i];
    return { id: String(i + 1), name: `Station ${i}`, coordinates: [135 + Math.sin(angle) * .1, 35 + Math.cos(angle) * .1],
      elevation, temperatureQuality: 0, observationTime: stamp, values: { temperature: 20 - lapse * elevation } };
  });
}
const run = (extra = {}) => estimateLocalTemperature({ points: samples(), coordinates, elevation: 300, observationTime: stamp, now, ...extra });
test("quality metadata, degrees/minutes, sea-level and zero are preserved; missing never becomes zero", () => {
  const stations = { a: { kjName: "a", lat: [35, 30], lon: [135, 15], alt: 0, elems: "11112010" } };
  for (const raw of [null, undefined, "", false]) assert.equal(buildAmedasPoints({ a: { temp: [raw, 0] } }, stations)[0].values.temperature, null);
  const point = buildAmedasPoints({ a: { temp: [0, 0] } }, stations, null, stamp)[0];
  assert.deepEqual(point.coordinates, [135.25, 35.5]); assert.equal(point.elevation, 0); assert.equal(point.values.temperature, 0);
  assert.equal(point.temperatureQuality, 0); assert.equal(point.observationTime, stamp);
  stations.a.lat[1] = 60; assert.equal(buildAmedasPoints({ a: {} }, stations).length, 0);
});
test("fixed IDW reproduces an elevation lapse, no unit conversions or zero division", () => {
  const result = run(); assert.equal(result.method, "fixed-idw"); assert.ok(Math.abs(result.value - 18.05) < 1e-9);
  assert.equal(result.stationCount, 8); assert.ok(!result.diagnostics.outsideHull);
  const point = samples()[0]; const exact = run({ coordinates: point.coordinates, elevation: point.elevation });
  assert.equal(exact.kind, "observed"); assert.equal(exact.value, point.values.temperature); assert.ok(Number.isFinite(exact.value));
});
test("height weighting favors comparable stations, but plain IDW and missing height keep their original meaning",()=>{
  const points=Array.from({length:4},(_,i)=>({id:String(i+1),name:`Sample ${i}`,coordinates:[135+(i%2?.05:-.05),35+(i<2?.05:-.05)],
    elevation:i<2?0:500,temperatureQuality:0,values:{temperature:i<2?20:14}}));
  const options={points,coordinates,elevation:0,observationTime:stamp,now};
  const baseline=estimateLocalTemperature({...options,config:{heightSimilarityScaleM:0}});
  const weighted=estimateLocalTemperature({...options,config:{heightSimilarityScaleM:200}});
  assert.ok(weighted.value>baseline.value);assert.equal(weighted.heightWeighted,true);
  for(const extra of [{method:"idw"},{elevation:null}]) {
    const a=estimateLocalTemperature({...options,...extra,config:{heightSimilarityScaleM:200}});
    const b=estimateLocalTemperature({...options,...extra,config:{heightSimilarityScaleM:0}});
    assert.equal(a.value,b.value);assert.equal(a.heightWeighted,false);
  }
});
test("stale, future, mixed timestamps, duplicate IDs, missing and bad-quality values excluded", () => {
  assert.equal(run({ now: now + 40 * 60000 }).kind, "unavailable");
  assert.equal(run({ now: now - 10 * 60000 }).kind, "unavailable");
  const points = samples(); points[0].temperatureQuality = 1; points[1].values.temperature = null;
  points[2].observationTime = "20261125145000"; points[3].coordinates[0] = null;
  const valid = selectTemperatureStations({ points: [...points, points[4]], coordinates, observationTime: stamp, now });
  assert.equal(valid.length, 4);
});
test("plain IDW, nearest and unavailable fallback are explicit", () => {
  assert.equal(run({ elevation: null }).method, "idw");
  const sparse = run({ points: samples().slice(0, 2) }); assert.equal(sparse.kind, "observed"); assert.equal(sparse.stationCount, 1);
  assert.equal(run({ points: [] }).kind, "unavailable");
  assert.equal(run({ elevation: 3000 }).kind, "observed");
  const sea = samples().map(p => ({ ...p, landConnected: false }));
  assert.equal(run({ points: sea }).kind, "observed");
});
test("inversion can be fitted, but flat-height, unstable and outlier fits are rejected", () => {
  const select = points => selectTemperatureStations({ points, coordinates, observationTime: stamp, now });
  const points = select(samples(-.003));
  assert.ok(Math.abs(fitTemperatureLapse(points).lapse + .003) < 1e-9);
  assert.ok(validatedDynamicLapse(points, coordinates).lapse < 0);
  assert.equal(fitTemperatureLapse(select(samples().map(p => ({ ...p, elevation: 100 })))), null);
  assert.equal(fitTemperatureLapse(points.slice(0, 4)), null);
  const result = run({ points: samples(-.003), method: "dynamic" });
  assert.equal(result.method, "dynamic-idw"); assert.ok(Math.abs(result.value - 20.9) < 1e-8);
  assert.equal(TEMPERATURE_ESTIMATION.dynamicEnabled, false, "no unverified production adoption");
  assert.equal(run({ method: "dynamic" }).method, "fixed-idw", "no gain over fixed does not adopt dynamic");
});
test("horizontal gradients can be separated from height in the candidate regression", () => {
  const points = selectTemperatureStations({ points: samples(), coordinates, observationTime: stamp, now });
  const plane = points.map(p => ({ ...p, value: 20 + .2 * p.x - .1 * p.y - .0065 * p.elevation }));
  const fit = fitTemperatureLapse(plane, { plane: true });
  assert.ok(Math.abs(fit.lapse - .0065) < 1e-9); assert.ok(fit.r2 > .99);
  assert.equal(run({ points: samples().map((p, i) => ({ ...p, values: { temperature: i % 2 ? -10 : 20 } })) }).kind, "observed");
});
test("preferences default off and survive denied storage", () => {
  const storage = { value: null, getItem() { return this.value; }, setItem(k, v) { this.value = v; } };
  assert.equal(loadTemperatureEstimationEnabled(storage), false);
  saveTemperatureEstimationEnabled(true, storage); assert.equal(loadTemperatureEstimationEnabled(storage), true);
  const denied = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  assert.equal(loadTemperatureEstimationEnabled(denied), false); assert.equal(saveTemperatureEstimationEnabled(false, denied), false);
});
