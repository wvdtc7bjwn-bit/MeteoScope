import assert from "node:assert/strict";
import {evaluateShallowIntensityObservations} from "../scripts/validate-simulation-shallow-intensity.mjs";
const result = await evaluateShallowIntensityObservations();
assert.equal(result.events.length, 9);
assert.ok(result.collectedObservations > 15000);
// Equal earthquake weights keep one densely reported disaster from dominating.
for (const split of ["development", "holdout", "all"]) {
  const group = result.summary[split];
  assert.ok(group.strong.revisedMae < group.strong.baselineMae, `${split}: improve strong-motion distribution`);
  assert.ok(group.all.revisedMae < group.all.baselineMae, `${split}: also check weak motions`);
}
for (const event of result.events) {
  assert.ok(event.strong.revised.mae < event.strong.baseline.mae, `${event.name}: no earthquake-specific strong-region regression`);
  assert.ok(Number.isFinite(event.all.revised.mae));
}
console.log(`Shallow simulation: ${result.events.length} earthquakes / ${result.collectedObservations} JMA station observations, strong and whole-distribution errors checked`);
