import assert from "node:assert/strict";
import { createSimulationMapOverlay } from "../src/map/simulationOverlay.js";
const sources = new Map(), layers = new Map([["eew-wave-fill", {}]]), listeners = new Map();
let fullWrites = 0, patches = 0, faultWrites = 0;
const state = new Map();
const map = {
  getLayer: id => layers.get(id), getSource: id => sources.get(id),
  getCanvas: () => ({ style: {} }),
  addLayer: layer => layers.set(layer.id, layer), setPaintProperty() {}, setLayoutProperty() {},
  on: (event, layer, callback) => listeners.set(`${event}:${layer}`, callback), off() {},
  addSource(id, source) {
    sources.set(id, { setData(data) {
      if (id.endsWith("stations")) { fullWrites++; state.clear(); data.features.forEach(f => state.set(f.properties.id, structuredClone(f))); }
      else faultWrites++;
    }, updateData(diff) {
      patches++;
      diff.remove.forEach(id => state.delete(id));
      diff.add.forEach(f => state.set(f.properties.id, structuredClone(f)));
      diff.update.forEach(update => {
        const f = state.get(update.id);
        if (update.newGeometry) f.geometry = update.newGeometry;
        update.removeProperties.forEach(key => delete f.properties[key]);
        update.addOrUpdateProperties.forEach(({ key, value }) => f.properties[key] = value);
      });
    }, promoteId: source.promoteId });
  }
};
const feature = (id, intensity) => ({ type: "Feature", geometry: { type: "Point", coordinates: [139, 35] }, properties: { id, intensity } });
const fault = { type: "FeatureCollection", features: [] };
const frame = features => ({ stations: { type: "FeatureCollection", features }, fault });
const overlay = createSimulationMapOverlay(() => map, () => {}, () => {});
const initial = [feature("001", "1"), feature("002", "2")];
overlay.render(frame(initial));
assert.equal(sources.get("earthquake-simulation-stations").promoteId, "id");
overlay.render(frame(initial));
assert.equal(patches, 0); assert.equal(fullWrites, 1); assert.equal(faultWrites, 1);
overlay.render(frame([feature("001", "3"), initial[1]]));
assert.equal(patches, 1); assert.equal(fullWrites, 1); assert.equal(faultWrites, 1);
assert.equal(state.get("001").properties.intensity, "3");
overlay.render(frame([initial[0], feature("003", "4")]));
assert.equal(state.has("002"), false); assert.equal(state.get("003").properties.intensity, "4");
assert.equal(state.get("001").properties.intensity, "1", "rewind uses the same diff path");
overlay.clear(); assert.equal(state.size, 0);
overlay.render(frame(initial)); assert.equal(state.get("001").properties.intensity, "1");
assert.equal(fullWrites, 3, "clear and new playback initialize a fresh complete dataset");
console.log("Simulation rendering: stable leading-zero IDs, initial load, changed-only updates, unchanged fault suppression, add/remove, rewind and restart passed");
