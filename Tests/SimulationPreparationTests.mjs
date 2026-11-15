import assert from "node:assert/strict";
import { loadSimulationResource, SimulationPreparationError } from "../src/simulation/preparationErrors.js";
assert.equal(await loadSimulationResource("stations", async () => 42), 42);
const controller = new AbortController();
controller.abort(new DOMException("Loading deadline", "TimeoutError"));
await assert.rejects(loadSimulationResource("ground", async () => { throw new Error("network"); }, controller.signal), error => error.resource === "ground" && error.timedOut);
const stationError = new SimulationPreparationError("stations", new Error("HTTP 503"));
await assert.rejects(loadSimulationResource("ground", () => Promise.reject(stationError)), error => error === stationError && error.resource === "stations", "a dependent station failure must not offer an irrelevant ground fallback");
for (const resource of ["ground", "areas", "stations"]) {
  await assert.rejects(loadSimulationResource(resource, () => Promise.reject(new Error("HTTP 503"))), error => error.resource === resource && !error.timedOut);
  assert.equal(await loadSimulationResource(resource, async () => "retry succeeded"), "retry succeeded", "failure must not poison retries");
}
console.log("Simulation loading: resource-specific failure, timeout, dependency attribution and successful retry passed");
