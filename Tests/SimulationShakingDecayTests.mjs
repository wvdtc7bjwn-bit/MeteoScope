import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createWeSimulatorModel, classifyIntensity } from "../src/simulation/weSimulatorModel.js";
import { prepareEarthquakeSimulation, getSimulationPresetOptions } from "../src/simulation/earthquakeSimulation.js";

const model = createWeSimulatorModel({ magnitude: 6 });
const sample = { id: "001", pArrivalSec: 2, sArrivalSec: 5, epicentralDistanceKm: 20, predictedIntensityValue: 5.8,
  ...model.getStationWaveResponseProperties("001", 5.8) };
const timing = model.getStationShakingTiming(sample);
assert.equal(model.getCurrentIntensityProperties(sample, 1).observed, false);
assert.equal(model.getCurrentIntensityProperties(sample, sample.pArrivalSec).currentIntensityValue, 0, "P arrival begins the response without an instant recorded-floor jump");
for (const magnitude of [4, 6, 9]) {
  for (const depthKm of [10, 590]) {
    for (const predictedIntensityValue of [.6, 3.5, 5.8, 6.8]) {
      const responseModel = createWeSimulatorModel({ magnitude, depthKm });
      const site = { ...sample, predictedIntensityValue, ...responseModel.getStationWaveResponseProperties("001", predictedIntensityValue) };
      const siteTiming = responseModel.getStationShakingTiming(site);
      const beforeS = responseModel.getCurrentIntensityProperties(site, site.sArrivalSec - .001);
      const afterS = responseModel.getCurrentIntensityProperties(site, site.sArrivalSec + .001);
      assert.ok(Math.abs(afterS.currentIntensityValue - beforeS.currentIntensityValue) <= .02, "S arrival cannot instantly switch from P intensity to an advanced S response");
      let previous = responseModel.getCurrentIntensityProperties(site, site.sArrivalSec).currentIntensityValue;
      for (let t = site.sArrivalSec + .1; t <= siteTiming.shakingPeakSec; t += .1) {
        const value = responseModel.getCurrentIntensityProperties(site, t).currentIntensityValue;
        assert.ok(value >= previous && value - previous <= .65, "the S response rises continuously without skipping several intensity classes in one frame");
        previous = value;
      }
      previous = responseModel.getCurrentIntensityProperties(site, siteTiming.shakingDecayStartSec).currentIntensityValue;
      for (let t = siteTiming.shakingDecayStartSec + 1; t <= siteTiming.shakingEndSec + 1; t++) {
        const state = responseModel.getCurrentIntensityProperties(site, t);
        assert.ok(previous - state.currentIntensityValue <= .21, "the tail cannot collapse several intensity units in its last seconds");
        assert.equal(state.recordedIntensityValue, predictedIntensityValue, "smoothing never lowers the recorded maximum");
        previous = state.currentIntensityValue;
      }
    }
  }
}
const peak = model.getCurrentIntensityProperties(sample, timing.shakingDecayStartSec);
assert.equal(peak.recordedIntensityValue, sample.predictedIntensityValue);
assert.equal(peak.currentIntensityValue, 5.8);
let lastCurrent = peak.currentIntensityValue;
for (let step = 1; step <= 40; step++) {
  const t = timing.shakingDecayStartSec + (timing.shakingEndSec - timing.shakingDecayStartSec) * step / 40;
  const state = model.getCurrentIntensityProperties(sample, t);
  assert.ok(state.currentIntensityValue <= lastCurrent, "shaking decays without pulsating or rising again");
  assert.equal(state.recordedIntensityValue, 5.8, "historical maximum remains after current shaking falls");
  lastCurrent = state.currentIntensityValue;
}
const quiet = model.getCurrentIntensityProperties(sample, timing.shakingEndSec + 1);
assert.equal(quiet.currentIntensityValue, 0);
assert.equal(quiet.intensityLabel, "0", "the P-wave recorded floor cannot hold current intensity at 1");
assert.equal(quiet.settled, true);
assert.deepEqual(model.getCurrentIntensityProperties(sample, timing.shakingDecayStartSec), peak, "rewind restores the exact peak");
assert.equal(model.getCurrentIntensityProperties(sample).intensityLabel, "6-", "the non-playback reference maximum remains unchanged");
const giant = createWeSimulatorModel({ magnitude: 9 }).getStationShakingTiming(sample);
assert.ok(giant.shakingDecayStartSec > timing.shakingDecayStartSec + 150, "giant events sustain shaking longer");
const delayed = model.getStationShakingTiming({ ...sample, lastStrongSArrivalSec: 100 });
assert.ok(delayed.shakingDecayStartSec > 100, "wait for later strong waves from finite rupture segments");
const soft = model.getStationShakingTiming({ ...sample, groundAvs: 150 });
assert.ok(soft.shakingEndSec > timing.shakingEndSec, "site softness affects the decay tail");

// Hold magnitude, site and arrivals fixed to isolate deep-event coda from
// maximum-intensity, travel-time and ground-amplification calculations.
const distant = { ...sample, pArrivalSec: 90, sArrivalSec: 165, epicentralDistanceKm: 550 };
const shallowModel = createWeSimulatorModel({ magnitude: 8.1, depthKm: 150 });
const shallowTiming = shallowModel.getStationShakingTiming(distant);
assert.deepEqual(shallowTiming, createWeSimulatorModel({ magnitude: 8.1, depthKm: 10 }).getStationShakingTiming(distant));
const deepModel = createWeSimulatorModel({ magnitude: 8.1, depthKm: 590 });
const deepTiming = deepModel.getStationShakingTiming(distant);
assert.equal(deepTiming.shakingPeakSec, shallowTiming.shakingPeakSec);
assert.equal(deepTiming.shakingDecayStartSec, shallowTiming.shakingDecayStartSec, "extend the falling tail rather than freeze the peak longer");
assert.equal(deepTiming.shakingEndSec - shallowTiming.shakingEndSec, 37.5);
assert.ok(createWeSimulatorModel({ magnitude: 8.1, depthKm: 150.001 }).getStationShakingTiming(distant).shakingEndSec - shallowTiming.shakingEndSec < .001, "smooth model boundary");
assert.ok(createWeSimulatorModel({ magnitude: 8.1, depthKm: 225 }).getStationShakingTiming(distant).shakingEndSec < deepTiming.shakingEndSec);
assert.deepEqual(createWeSimulatorModel({ magnitude: 8.1, depthKm: 700 }).getStationShakingTiming(distant), deepTiming, "depth cannot amplify the coda without bound");
const oldQuietTime = shallowTiming.shakingEndSec + .1;
assert.equal(shallowModel.getCurrentIntensityProperties(distant, oldQuietTime).currentIntensityValue, 0);
assert.ok(deepModel.getCurrentIntensityProperties(distant, oldQuietTime).currentIntensityValue > .5, "a deep-event tail remains felt beyond the old cut-off");
let previousDeep = Infinity;
for (let step = 0; step <= 100; step++) {
  const t = deepTiming.shakingDecayStartSec + (deepTiming.shakingEndSec - deepTiming.shakingDecayStartSec) * step / 100;
  const state = deepModel.getCurrentIntensityProperties(distant, t);
  assert.ok(state.currentIntensityValue <= previousDeep, "deep coda declines without pulses or secondary increases");
  assert.equal(state.recordedIntensityValue, distant.predictedIntensityValue);
  previousDeep = state.currentIntensityValue;
}
assert.equal(deepModel.getCurrentIntensityProperties(distant, deepTiming.shakingEndSec + 1).settled, true);
for (const [pArrivalSec, sArrivalSec] of [[1, 1000], [10, 5], [Infinity, Infinity]]) {
  const site = { ...distant, pArrivalSec, sArrivalSec };
  const plain = shallowModel.getStationShakingTiming(site), extended = deepModel.getStationShakingTiming(site);
  if (Number.isFinite(sArrivalSec)) assert.ok(extended.shakingEndSec - plain.shakingEndSec <= 90, "bounded additional tail");
  else assert.equal(extended.shakingEndSec, Infinity, "out-of-table arrivals do not fabricate a finite shaking window");
}

const catalogue = JSON.parse(await readFile(new URL("../public/data/jma-intensity-stations.json", import.meta.url), "utf8"));
for (const input of [{ magnitude: 6 }, getSimulationPresetOptions("nankai-trough"), getSimulationPresetOptions("kuril-trench")]) {
  const simulation = await prepareEarthquakeSimulation(input, catalogue, { yieldTask: async () => {} });
  const affected = simulation.stations.filter(s => s.predictedIntensityValue >= .5 && Number.isFinite(s.sArrivalSec));
  assert.ok(affected.length);
  assert.ok(affected.every(s => simulation.duration > s.shakingEndSec), "playback includes the final site's decay tail");
  for (const s of [affected[0], affected.at(-1)]) {
    const atPeak = simulation.frame(s.shakingDecayStartSec).stations.features.find(f => f.properties.id === s.id).properties;
    assert.equal(atPeak.intensity, classifyIntensity(s.predictedIntensityValue).label);
    const after = simulation.frame(simulation.duration).stations.features.find(f => f.properties.id === s.id).properties;
    assert.equal(after.intensity, "0");
    assert.equal(after.color, "#8c9dad");
    assert.equal(after.settled, true);
    assert.equal(after.active, false);
    assert.equal(after.recordedIntensity, atPeak.intensity);
  }
  const end = simulation.frame(simulation.duration);
  assert.ok(end.stations.features.every(f => f.properties.intensity === "0"), "no colored station remains permanently at the end");
  assert.equal(end.event.maxIntensity, classifyIntensity(Math.max(...simulation.stations.map(s => s.predictedIntensityValue))).label, "EEW prediction does not fade with current shaking");
  assert.equal(end.event.isFinal, true);
  assert.deepEqual(simulation.frame(0).stations.features.map(f => f.properties.intensity), simulation.stations.map(() => "0"));
  console.log(`${input.model ?? "point"}: ${affected.length} felt sites settle within ${simulation.duration.toFixed(1)}s`);
}
console.log("Shaking decay: rise/peak/tail, retained maximum, large/finite sources, ground response, final quiet state and deterministic seeking passed");
