import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const main = read('../src/main.js');
const listeners = new Map();
let reloads = 0;
let registrations = 0;
const workerListeners = new Map();
const context = vm.createContext({
  navigator: { serviceWorker: {
    addEventListener: (name, callback) => workerListeners.set(name, callback),
    register: async () => { registrations++; return { update: async () => {} }; }
  } },
  window: { isSecureContext: true, location: { reload: () => reloads++ },
    addEventListener: (name, callback) => listeners.set(name, callback) }, console
});
vm.runInContext(main.slice(main.indexOf('function registerAppServiceWorker()'), main.indexOf('function setupConnectionStatus()')), context);
context.registerAppServiceWorker();
listeners.get('load')();
await Promise.resolve();
workerListeners.get('controllerchange')?.();
workerListeners.get('controllerchange')?.();
assert.equal(registrations, 1);
assert.equal(reloads, 0, 'worker activation must not replace a running or resumed document');
const mapSource = read('../src/map/weatherMap.js');
const start = mapSource.indexOf('  function resize() {');
const end = mapSource.indexOf('\n  }', start) + 4;
const calls = [];
const mapContext = vm.createContext({ map: { resize: () => calls.push('resize'), triggerRepaint: () => calls.push('paint') } });
vm.runInContext(mapSource.slice(start, end), mapContext);
mapContext.resize();
assert.deepEqual(calls, ['resize', 'paint']);
const html = read('../index.html');
assert.ok(html.indexOf('html { background:') < html.indexOf('https://fonts.googleapis.com'));
const app = read('../src/app.js');
assert.match(app, /if \(!document.hidden\) \{\s*weatherMap\?\.resize\(\);/);
assert.match(app, /addEventListener\("pageshow", \(\) => \{\s*weatherMap\?\.resize\(\);/);
console.log('App resume tests passed');
