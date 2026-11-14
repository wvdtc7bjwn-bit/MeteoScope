import assert from 'node:assert/strict';
import { createAdminWorkspace, filterAdminAccounts, loadAdminResources, setAdminMessage } from '../src/ui/adminWorkspace.js';

const accounts = [
  { id: 'a1', displayName: '天気 ユーザー', username: 'Weather_User', earlyAccessAllowed: true },
  { id: 'a2', displayName: 'テスト', username: 'sample', earlyAccessAllowed: false },
  { id: 'a3', displayName: '<img onerror=alert(1)>', username: null }
];
assert.deepEqual(filterAdminAccounts(accounts, ' ｗｅａｔｈｅｒ 天気 ', 'allowed'), [accounts[0]]);
assert.deepEqual(filterAdminAccounts(accounts, 'A2', 'not-allowed'), [accounts[1]]);
assert.deepEqual(filterAdminAccounts(accounts, '', 'allowed'), [accounts[0]]);
assert.deepEqual(filterAdminAccounts(accounts, 'no-match'), []);
assert.equal(filterAdminAccounts(accounts).length, 3);
assert.equal(accounts.length, 3, 'Filtering must not change the loaded page or its pagination');

const events = new Map();
const selectorEvents = new Map();
let focusCount = 0;
const title = { focus() { focusCount++; } }, description = {};
const input = { value: 'unsaved notice' };
const panel = (id, label) => ({ id, hidden: false, input,
  querySelector(selector) { return { textContent: selector === 'h2' ? label : label + ' description' }; }
});
const panels = [panel('status', '稼働状況'), panel('accounts', 'アカウント')];
const links = panels.map(p => ({ attrs: { href: '#' + p.id },
  getAttribute(key) { return this.attrs[key]; }, setAttribute(key, value) { this.attrs[key] = value; }, removeAttribute(key) { delete this.attrs[key]; }
}));
const select = { value: '', addEventListener(key, callback) { selectorEvents.set(key, callback); } };
const root = {
  querySelectorAll(selector) { return selector.includes('section') ? panels : links; },
  querySelector(selector) { return ({ '#admin-section-select': select, '#admin-page-title': title, '#admin-page-description': description,
    '#admin-workspace': { focus() { focusCount++; }, scrollIntoView() {} } })[selector]; },
  addEventListener(key, callback) { events.set(key, callback); }
};
const navigations = [];
const workspace = createAdminWorkspace(root, id => navigations.push(id));
assert.equal(workspace.activeId, 'status');
assert.equal(panels[1].hidden, true);
assert.equal(links[0].attrs['aria-current'], 'page');
select.value = 'accounts';
selectorEvents.get('change')();
assert.equal(panels[0].hidden, true);
assert.equal(panels[1].hidden, false);
assert.equal(title.textContent, 'アカウント');
assert.equal(description.textContent, 'アカウント description');
assert.equal(links[0].attrs['aria-current'], undefined);
assert.equal(links[1].attrs['aria-current'], 'page');
assert.equal(workspace.selectSection('missing'), false);
assert.equal(workspace.activeId, 'accounts');
let prevented = false;
events.get('click')({ target: { closest: () => links[0] }, button: 0, preventDefault() { prevented = true; } });
assert.equal(prevented, true);
assert.equal(focusCount, 1);
assert.equal(workspace.activeId, 'status');
assert.equal(panels[1].input, input, 'Navigation keeps the actual form and its edits');
assert.equal(input.value, 'unsaved notice');
assert.equal(navigations.length, 3);

let release;
const slow = new Promise(resolve => { release = resolve; });
const rendered = [];
const resources = [
  { label: 'quota', load: async () => { throw Error('offline'); }, render() { assert.fail('A failed resource must not render empty defaults'); } },
  { label: 'accounts', load: async () => accounts, render: payload => rendered.push(payload) },
  { label: 'config', load: () => slow, render: payload => rendered.push(payload) }
];
const pending = loadAdminResources(resources);
await new Promise(resolve => setImmediate(resolve));
assert.deepEqual(rendered, [accounts], 'A slow or failed Analytics request must not block available resources');
release({ maintenance: { enabled: true } });
const failures = await pending;
assert.deepEqual(failures, [resources[0]]);
assert.equal(rendered.length, 2);
resources[0].load = async () => ({ configured: true });
resources[0].render = value => rendered.push(value);
assert.deepEqual(await loadAdminResources(failures), []);
assert.equal(rendered.length, 3, 'Retry only failed resources, preserving already edited forms');
const classes = new Set(['admin-dashboard-message', 'error']);
const message = { classList: { add: value => classes.add(value), toggle(value, enabled) { enabled ? classes.add(value) : classes.delete(value); } } };
setAdminMessage(message, '保存しました', 'success');
assert.equal(message.textContent, '保存しました');
assert.ok(classes.has('admin-dashboard-message'), 'Status updates must preserve positioning classes');
assert.ok(classes.has('success'));
assert.ok(!classes.has('error'));
setAdminMessage(message, '');
assert.ok(!classes.has('success'));
console.log('Admin workspace navigation, filtering, independent loading, retry and status tests passed.');
