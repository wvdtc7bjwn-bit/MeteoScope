import assert from "node:assert/strict";
import {
  isAllowedDmdataTelegramDataUrl,
  mergeDmdataTsunamiSnapshots
} from "../workers/earthquake-realtime/src/dmdataTsunami.js";

const warning = {
  eventId: "20260716090000",
  type: "VTSE41",
  reportTime: "2026-07-16T09:05:00+09:00",
  areas: [{ code: "210", name: "青森県太平洋沿岸", kind: "津波注意報" }],
  observations: [],
  estimations: [],
  isCanceled: false
};
const observation = {
  eventId: warning.eventId,
  type: "VTSE51",
  reportTime: "2026-07-16T09:20:00+09:00",
  areas: [],
  observations: [{
    code: "210",
    name: "青森県太平洋沿岸",
    stations: [{ code: "87110", name: "八戸港", maxHeight: "0.4" }]
  }],
  estimations: [],
  isCanceled: false
};

const merged = mergeDmdataTsunamiSnapshots(warning, observation);
assert.equal(merged.areas[0].kind, "津波注意報");
assert.equal(merged.observations[0].stations[0].name, "八戸港");

const canceled = mergeDmdataTsunamiSnapshots(merged, {
  eventId: warning.eventId,
  type: "VTSE41",
  areas: [],
  observations: [],
  estimations: [],
  isCanceled: true
});
assert.equal(canceled.isCanceled, true);
assert.deepEqual(canceled.areas, []);

assert.equal(isAllowedDmdataTelegramDataUrl("https://data.api.dmdata.jp/v1/abc_DEF-123"), true);
assert.equal(isAllowedDmdataTelegramDataUrl("https://example.com/v1/abc"), false);
assert.equal(isAllowedDmdataTelegramDataUrl("https://data.api.dmdata.jp/v1/../secret"), false);

console.log("DM-D.S.S tsunami tests passed");
