import assert from 'node:assert/strict';
import { createEewAutoFocus } from '../src/eew/eewAutoFocus.js';
const values = new Map();
const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
const focus = createEewAutoFocus(storage);
const moves = [];
const move = coordinates => moves.push(coordinates);
const event = { eventId: 'A', coordinates: [140, 36], announcedTime: '2026-11-13T10:00:00+09:00' };
assert.equal(focus.enabled, true);
assert.equal(focus.focus([event], move), true);
assert.equal(focus.focus([{ ...event, reportNum: 2, coordinates: [141, 37] }], move), false);
assert.equal(focus.focus([], move), false);
assert.equal(focus.focus([event], move), false, 'reconnect cannot refocus a manually moved map');
for (const patch of [{ isCancel: true }, { isTraining: true }, { isAssumption: true },
  { coordinates: [null, 36] }, { coordinates: [181, 36] }, { coordinates: [140, NaN] }, { hypocenterMethod: 'level' }]) {
  assert.equal(focus.focus([{ ...event, eventId: 'B', ...patch }], move), false);
}
focus.setEnabled(false);
assert.equal(createEewAutoFocus(storage).enabled, false, 'disabled preference persists');
assert.equal(focus.focus([{ ...event, eventId: 'B' }], move), false);
focus.setEnabled(true);
assert.equal(focus.focus([{ ...event, eventId: 'B' }], move), true);
assert.equal(moves.length, 2);
assert.equal(focus.focus([{ ...event, eventId: 'C' }, { ...event, eventId: 'D', announcedTime: '2026-11-13T10:01:00+09:00', coordinates: [142, 38] }], move), true);
assert.deepEqual(moves.at(-1), [142, 38]);
assert.equal(focus.focus([{ ...event, eventId: 'C' }], move), false);
const blockedStorage = { getItem() { throw Error(); }, setItem() { throw Error(); } };
assert.doesNotThrow(() => createEewAutoFocus(blockedStorage).setEnabled(false));
console.log('EEW auto-focus tests passed');
