import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../src/app.js', import.meta.url), 'utf8');
const start = source.indexOf('  function followLatestEarthquakeUpdate(');
const end = source.indexOf('  async function mergeEarthquakeRealtimeData(', start);
let cancelled = 0;
const context = vm.createContext({
  activeEarthquakeId: 'old', collapsedEarthquakeId: 'old',
  earthquakeContentMode: 'earthquake', earthquakeView: 'history',
  earthquakeNearbySearchActive: true, earthquakeDistributionAreaDrawing: true,
  earthquakeSummaryPage: 'earthquake',
  cancelEarthquakeArchiveAreaDrawing() { cancelled++; },
  weatherMap: { cancelHypocenterAreaDrawing() { cancelled++; } },
  showMobileEarthquakeSummaryPage() {}
});
vm.runInContext(source.slice(start, end), context);
const previous = { id: 'a', eventTimeRaw: '2026-11-12T10:00:00+09:00', reportTimeRaw: '2026-11-12T10:01:00+09:00' };
context.followLatestEarthquakeUpdate([previous], [{ ...previous }]);
assert.equal(context.earthquakeView, 'history');
context.followLatestEarthquakeUpdate([], [previous]);
assert.equal(context.earthquakeView, 'history');
context.followLatestEarthquakeUpdate([previous], [{ ...previous, id: 'b', reportTimeRaw: '2026-11-12T10:02:00+09:00' }]);
assert.equal(context.earthquakeView, 'recent');
assert.equal(context.activeEarthquakeId, 'b');
assert.equal(context.earthquakeNearbySearchActive, false);
assert.equal(context.earthquakeDistributionAreaDrawing, false);
assert.equal(context.collapsedEarthquakeId, '');
assert.equal(cancelled, 2);
context.earthquakeView = 'history';
context.followLatestEarthquakeUpdate([previous], [{ ...previous, reportTimeRaw: '2026-11-12T09:59:00+09:00' }]);
assert.equal(context.earthquakeView, 'history');
context.followLatestEarthquakeUpdate([previous], [{ id: 'invalid', eventTimeRaw: '', reportTimeRaw: '' }]);
assert.equal(context.earthquakeView, 'history');
context.followLatestEarthquakeUpdate([previous], [{ ...previous, id: 'new', eventTimeRaw: '2026-11-12T11:00:00+09:00' }]);
assert.equal(context.activeEarthquakeId, 'new');
assert.equal(context.earthquakeView, 'recent');
assert.equal((source.match(/followLatestEarthquakeUpdate\(previousEarthquakes, earthquakes\)/g) ?? []).length, 2);
console.log('Latest earthquake follow: new event, update, duplicate, stale, initial, invalid and cleanup passed.');
