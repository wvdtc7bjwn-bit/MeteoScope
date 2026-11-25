import assert from "node:assert/strict";
import { mergeRefreshedData, mergeWarningTabData } from "../src/app/refreshedData.js";

const outlook = [{ type: "雷", slots: [{ time: "2026-11-25T18:00:00+09:00", level: 2 }] }];
const area = (code, rows = [], warning = "雷注意報") => ({ areaCode: code, areaName: code,
  warnings: warning ? [{ label: warning }] : [], outlook: rows });
const overview = (areas, extra = {}) => ({ activeAreas: areas, groups: [{ areas }], outlookAreas: [],
  detailsLoaded: false, statusDetailsLoaded: false, statusDetailAreaCodes: [], earlyDetailsLoaded: false, ...extra });
const initial = overview([area("1521200", outlook)], { detailsLoaded: true, statusDetailsLoaded: true,
  statusDetailAreaCodes: ["1521200"], earlyDetailsLoaded: true, earlyAreas: ["early"] });
const original = JSON.stringify(initial);

let refreshed = initial;
for (let cycle = 0; cycle < 5; cycle += 1) {
  refreshed = mergeRefreshedData("warnings", refreshed, overview([area("1521200", [], "強風注意報")]));
  assert.deepEqual(refreshed.activeAreas[0].outlook, outlook, "overview-only refresh must retain the already loaded outlook");
  assert.equal(refreshed.groups[0].areas[0], refreshed.activeAreas[0], "modal/list and active-area data must agree");
  assert.equal(refreshed.groups[0].areas[0].warnings[0].label, "強風注意報", "current warnings must still refresh");
  assert.deepEqual(refreshed.statusDetailAreaCodes, ["1521200"]);
}
assert.equal(JSON.stringify(initial), original, "merging must not mutate cached snapshots");

const otherDetail = mergeWarningTabData(refreshed, overview([area("1521200"), area("other", outlook)], {
  detailsLoaded: true, statusDetailsLoaded: true, statusDetailAreaCodes: ["other"]
}));
assert.deepEqual(otherDetail.activeAreas[0].outlook, outlook, "loading another municipality must not erase this one");
assert.deepEqual(otherDetail.statusDetailAreaCodes, ["1521200", "other"]);

const cleared = mergeWarningTabData(otherDetail, overview([area("1521200"), area("other")], {
  detailsLoaded: true, statusDetailsLoaded: true, statusDetailAreaCodes: ["1521200"]
}));
assert.deepEqual(cleared.activeAreas[0].outlook, [], "a successful empty detail response must clear the old outlook");
assert.deepEqual(cleared.activeAreas[1].outlook, outlook, "clearing is scoped to the acquired municipality");
assert.deepEqual(mergeWarningTabData(cleared, overview([area("1521200"), area("other")])).activeAreas[0].outlook, [],
  "a cleared outlook must not reappear on the following refresh");

const futureOnly = mergeWarningTabData(initial, overview([]));
assert.equal(futureOnly.activeAreas.length, 0, "a cancelled warning must not be retained");
assert.deepEqual(futureOnly.outlookAreas[0].outlook, outlook, "retain the forecast even after the active warning ends");
assert.deepEqual(futureOnly.outlookAreas[0].warnings, [], "forecast retention must not restore obsolete warnings");
assert.deepEqual(mergeWarningTabData(futureOnly, overview([], { outlookAreas: [area("1521200")] })).outlookAreas[0].outlook,
  outlook, "an unacquired empty future-area placeholder must not erase the forecast either");
const activeAgain = mergeWarningTabData(futureOnly, overview([area("1521200")]));
assert.deepEqual(activeAgain.activeAreas[0].outlook, outlook, "future-only outlook survives reactivation");
assert.equal(activeAgain.outlookAreas.length, 0, "the same municipality must not be duplicated");

const replaced = [{ type: "波浪", slots: [{ level: 1 }] }];
assert.deepEqual(mergeWarningTabData(initial, overview([area("1521200", replaced)], {
  detailsLoaded: true, statusDetailsLoaded: true, statusDetailAreaCodes: ["1521200"]
})).activeAreas[0].outlook, replaced, "fresh detail replaces rather than appends old forecast slots");
assert.deepEqual(mergeWarningTabData(initial, overview([area("1521200")], {
  detailsLoaded: true, earlyDetailsLoaded: true, earlyAreas: ["new early"]
})).activeAreas[0].outlook, outlook, "early-warning-only retrieval has no authority to clear status outlooks");

const deletedFuture = mergeWarningTabData(futureOnly, overview([], {
  detailsLoaded: true, statusDetailsLoaded: true, statusDetailAreaCodes: ["1521200"]
}));
assert.equal(deletedFuture.outlookAreas.length, 0, "successful empty details also clear a future-only municipality");
console.log("Warning outlook retention: repeated overview refresh, current warnings, scoped replacement/empty results, area lifecycle and immutable snapshots passed");
