import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { getAutoTemperatureFallbackReason, selectAutoTemperature } from "../src/location/autoTemperature.js";
import { createJmaTemperatureController } from "../src/location/jmaTemperatureController.js";
import { loadTemperatureSource, saveTemperatureSource, effectiveTemperatureSource, usesTemperatureEstimation, createTemperatureSourceSelector } from "../src/preferences/temperatureSource.js";
import { buildLocalTemperatureButton, buildLocalTemperatureDetails } from "../src/ui/localTemperatureView.js";

const now = Date.parse("2026-11-28T03:20:00Z");
const location = { status: "found", coordinates: [139.75, 35.68] }; // Public reference, not a user's GPS fix.
const local = { kind: "estimated", value: 12.6, confidence: "medium", flags: [], stations: [], nearest: { name: "Test", distanceKm: 3 },
  observationTime: "2026-11-28T03:10:00Z", location };
const jma = { source: "jma", kind: "jma-estimated", value: null, range: { lowerC: 12, upperC: 13 },
  observationTime: "2026-11-28T03:00:00Z", retrievedAt: "2026-11-28T03:19:00Z", location };
const settle = () => new Promise(resolve => setImmediate(resolve));

test("AUTO persists and requires the same administrator permission and consent as independent estimation", async () => {
  const values = new Map(), storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(saveTemperatureSource("auto", storage), "auto");
  assert.equal(loadTemperatureSource(storage), "auto");
  assert.equal(effectiveTemperatureSource("auto", false), "nearest");
  assert.equal(effectiveTemperatureSource("auto", true), "auto");
  assert.equal(usesTemperatureEstimation("auto"), true);
  let state = { earlyAccessEnabled: true, temperatureEstimationAllowed: false, temperatureEstimationEnabled: false }, reply, prompts = 0;
  const changes = [];
  const select = createTemperatureSourceSelector({ getState: () => state, onChange: value => changes.push(value), confirm: () => { prompts++; return new Promise(resolve => { reply = resolve; }); } });
  assert.equal(await select("auto"), false); assert.equal(prompts, 0);
  state.temperatureEstimationAllowed = true;
  let pending = select("auto"); assert.equal(await select("auto"), false); reply(false);
  assert.equal(await pending, false); assert.deepEqual(changes, []);
  pending = select("auto"); await select("jma"); reply(true);
  assert.equal(await pending, false); assert.deepEqual(changes, ["jma"]);
  pending = select("auto"); state.temperatureEstimationAllowed = false; reply(true);
  assert.equal(await pending, false);
  state.temperatureEstimationAllowed = true;
  pending = select("auto"); reply(true); assert.equal(await pending, true); assert.equal(changes.at(-1), "auto");
});

test("high and medium estimates stay unchanged; low, stale, pending and unavailable estimates select JMA", () => {
  for (const confidence of ["high", "medium"]) {
    const value = { ...local, confidence };
    assert.equal(getAutoTemperatureFallbackReason(value, now), "");
    assert.equal(selectAutoTemperature(value, jma, now).value, local.value);
    assert.equal(selectAutoTemperature(value, jma, now).observationTime, local.observationTime);
  }
  for (const value of [
    { ...local, confidence: "low" }, { ...local, observationTime: "2026-11-28T02:00:00Z" },
    { ...local, observationTime: "2026-11-28T04:00:00Z" }, { ...local, observationTime: null },
    { ...local, kind: "observed", loading: true, confidence: "high" },
    { ...local, kind: "unavailable", value: null }, { ...local, flags: ["coarse-location"] },
    { ...local, confidence: "unknown" }, { ...local, value: NaN }, null
  ]) {
    const result = selectAutoTemperature(value, jma, now);
    assert.equal(result.source, "jma"); assert.equal(result.value, null);
    assert.deepEqual(result.range, jma.range);
    assert.equal(result.observationTime, jma.observationTime, "JMA analysis time must not inherit the AMeDAS time");
    assert.equal(result.retrievedAt, jma.retrievedAt);
    assert.equal(result.autoSelection.selectedSource, "jma");
  }
  assert.equal(getAutoTemperatureFallbackReason({ ...local, loading: true }, now), "", "retain a fresh acceptable estimate during its refresh");
  assert.equal(selectAutoTemperature(null, null, now), null);
  assert.equal(Object.hasOwn(local, "autoSelection"), false, "the estimator result is never mutated");
});

test("coincident observations remain observations; a distant station fallback is not an acceptable local estimate", () => {
  const observed = { ...local, kind: "observed", confidence: "high", nearest: { name: "Test", distanceKm: .05 } };
  assert.equal(selectAutoTemperature(observed, jma, now).kind, "observed");
  assert.equal(selectAutoTemperature({ ...observed, nearest: { distanceKm: 5 } }, jma, now).source, "jma");
});

test("failed JMA fallback shows missing data, keeps the switching reason, and does not display the low-confidence number", () => {
  const low = { ...local, confidence: "low" };
  const result = selectAutoTemperature(low, { ...jma, kind: "unavailable", range: null, reason: "request-failed" }, now);
  const summary = buildLocalTemperatureButton(result);
  assert.match(summary, /class="amedas-observation-value">—</);
  assert.doesNotMatch(summary, /12\.6/);
  const details = buildLocalTemperatureDetails(result);
  assert.match(details, /AUTO/); assert.match(details, /信頼度が低い/); assert.match(details, /取得できません/);
  const ready = buildLocalTemperatureDetails(selectAutoTemperature(low, jma, now));
  assert.match(ready, /11\/28 12:00/); assert.match(ready, /11\/28 12:19/);
  assert.doesNotMatch(ready, /11\/28 12:10/);
  assert.match(buildLocalTemperatureButton(selectAutoTemperature(low, jma, now)), />12〜13℃<\/span>/);
  assert.match(buildLocalTemperatureDetails(selectAutoTemperature(local, jma, now)), /信頼度が高または中/);
});

test("real application routing fetches fallback only as needed, shares controller cooldown, and cancels on recovery or revocation", async () => {
  let estimate = local, calls = 0, changes = 0;
  const controller = createJmaTemperatureController({ now: () => now, read: async () => { calls++; return jma; }, onChange: () => changes++ });
  const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
  const code = app.slice(app.indexOf("    const activeTemperatureSource = effectiveTemperatureSource"), app.indexOf("    const panelState = {", app.indexOf("    const activeTemperatureSource = effectiveTemperatureSource")));
  const ctx = vm.createContext({ Date: class extends Date { static now() { return now; } },
    effectiveTemperatureSource, usesTemperatureEstimation, getAutoTemperatureFallbackReason, selectAutoTemperature,
    hasTemperatureEstimationAccess: () => ctx.allowed, allowed: true,
    temperatureEstimationEnabled: true, temperatureSource: "auto", activeAmedasMetric: "temperature", tab: { id: "amedas" }, data: {},
    currentLocationInfo: location, localTemperatureController: { update: ({ enabled }) => enabled ? estimate : null }, jmaTemperatureController: controller });
  const render = vm.runInContext(`(function(){${code}\nreturn displayedTemperature;})`, ctx);
  assert.equal(render().value, local.value); await settle(); assert.equal(calls, 0);
  estimate = { ...local, confidence: "low" };
  assert.equal(render().source, "jma"); await settle();
  assert.equal(render().range.lowerC, 12); assert.equal(calls, 1); assert.equal(changes, 1);
  for (let i = 0; i < 10; i++) render(); await settle(); assert.equal(calls, 1);
  estimate = local; assert.equal(render().value, local.value); assert.equal(calls, 1);
  ctx.allowed = false; assert.equal(render(), null); assert.equal(calls, 1);
  ctx.allowed = true; ctx.activeAmedasMetric = "humidity"; assert.equal(render(), null); assert.equal(calls, 1);
});
