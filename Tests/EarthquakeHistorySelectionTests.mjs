import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { CUSTOMIZATION_DEFAULTS } from "../src/preferences/customization.js";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const requests = [], fits = [];
let nextSearch = deferred();
const context = vm.createContext({
  customization: CUSTOMIZATION_DEFAULTS,
  AbortController, earlyAccessEnabled: true, activeTab: "earthquake", earthquakeView: "history",
  earthquakeNearbySearchActive: false, TABS: [{ id: "earthquake" }], latestDataByTab: {},
  earthquakeArchiveRenderFrame: null, earthquakeArchiveAbortController: null, earthquakeArchiveRequestId: 0,
  earthquakeArchiveFilters: {}, earthquakeArchiveState: { status: "ok", data: { items: [] } },
  earthquakeHistoryRecentEnabled: true,
  historicalEarthquakeDetailController: null, historicalEarthquakeDetailRequestId: 0,
  historicalEarthquakeDetailVisible: false, selectedHistoricalEarthquakeId: "",
  selectedHistoricalEarthquakeDetail: { status: "idle" },
  updateCurrentView: () => {}, cancelAnimationFrame: () => {}, requestAnimationFrame: () => 1,
  weatherMap: { flyToLocation: () => {}, fitToCoordinates: coordinates => fits.push(coordinates) },
  fetchEarthquakeHistoryEvent: (id, { signal }) => {
    const request = { id, signal, ...deferred() }; requests.push(request); return request.promise;
  },
  searchEarthquakeHistory: () => nextSearch.promise
});
vm.runInContext(source.slice(source.indexOf("  function isEarthquakeArchiveVisible()"), source.indexOf("  function updateEarthquakeDistributionFilters(")), context);
const first = { id: "first", coordinates: [140, 35] }, second = { id: "second", coordinates: [141, 36] };
const observations = { stations: [{ coordinates: [139, 35] }], longPeriodStatus: "available" };
const settle = () => new Promise(resolve => setImmediate(resolve));
context.earthquakeArchiveState.data.items = [first, second];
context.selectHistoricalEarthquake("first");
assert.equal(requests.length, 1);
const search = context.refreshEarthquakeArchive({ startDate: "2024-01-01", endDate: "2024-01-02" });
assert.equal(requests[0].signal.aborted, true, "new searches must cancel an old detail request");
assert.equal(context.historicalEarthquakeDetailVisible, false);
requests[0].resolve(observations);
await settle();
assert.equal(fits.length, 0, "an old response must not reposition the new search map");
assert.equal(context.selectedHistoricalEarthquakeDetail.status, "idle");
nextSearch.resolve({ filters: {}, items: [second], complete: true });
await search;
assert.equal(context.selectedHistoricalEarthquakeId, "second");

context.earthquakeArchiveState.data.items = [first, second];
context.selectHistoricalEarthquake("first");
context.selectHistoricalEarthquake("second");
assert.equal(requests[1].signal.aborted, true);
requests[2].resolve(observations);
await settle();
requests[1].resolve(observations);
await settle();
assert.equal(context.selectedHistoricalEarthquakeDetail.id, "second");
assert.equal(fits.length, 1, "rapid marker changes must fit only the currently selected earthquake");

context.selectHistoricalEarthquake("first");
context.closeHistoricalEarthquakeDetail();
requests[3].resolve(observations);
await settle();
assert.equal(context.historicalEarthquakeDetailVisible, false);
assert.equal(fits.length, 1, "closing detail must invalidate its pending response");
context.selectHistoricalEarthquake("first");
requests[4].resolve({ ...observations, longPeriodStatus: "unavailable" });
await settle();
context.closeHistoricalEarthquakeDetail();
context.selectHistoricalEarthquake("first");
assert.equal(requests.length, 6, "reselecting must allow failed supplementary observations to recover");
requests[5].resolve(observations);
await settle();
context.closeHistoricalEarthquakeDetail();
context.selectHistoricalEarthquake("first");
assert.equal(requests.length, 6, "successfully loaded detail may be reused");
context.fetchRecentEarthquakeDetail = (item, { signal }) => {
  const request = { id: item.id, signal, ...deferred() }; requests.push(request); return request.promise;
};
context.earthquakeArchiveState.data.items.push({ id: "p2p:recent", dataSource: "p2p", coordinates: [130,32] });
context.selectHistoricalEarthquake("p2p:recent");
assert.equal(requests.at(-1).id, "p2p:recent", "supplementary selection uses its own detail loader");
requests.at(-1).resolve(observations);
await settle();
assert.equal(context.selectedHistoricalEarthquakeDetail.id, "p2p:recent");
console.log("Earthquake history selection: new search, rapid selection, close, stale replies and supplementary retry passed");

const panelSource = await readFile(new URL("../src/ui/leftPanel.js", import.meta.url), "utf8");
class MockElement {
  closest(selector) { return selector === "[data-earthquake-history-detail-back]" ? this : null; }
}
const eventRoot = () => ({
  listeners: [], addEventListener(type, listener) { if (type === "click") this.listeners.push(listener); }
});
const list = eventRoot(), dock = eventRoot();
let backCalls = 0;
const ui = vm.createContext({
  Element: MockElement, HTMLInputElement: class {}, HTMLSelectElement: class {}, HTMLFormElement: class {},
  document: { getElementById: id => id === "earthquake-list" ? list : dock }, setupSegmentedControls: () => {}
});
vm.runInContext(panelSource.slice(panelSource.indexOf("export function setupEarthquakeSelector("), panelSource.indexOf("export function setupEarthquakeMapLayerToggles(")).replace(/^export /u, ""), ui);
ui.setupEarthquakeSelector({ onArchiveDetailBack: () => backCalls++ });
const event = { target: new MockElement(), preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; } };
for (const listener of dock.listeners) listener(event);
assert.equal(backCalls, 1, "a mobile back tap must invoke the action only once");
assert.equal(event.prevented, true);
assert.equal(event.stopped, true, "back must not also open or drag the summary drawer");
console.log("Earthquake history back control: one action per tap and no drawer propagation passed");
