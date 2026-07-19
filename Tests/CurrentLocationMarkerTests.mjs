import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { setupLongPressButton } from "../src/ui/longPressButton.js";

class FakeButton {
  constructor() {
    this.disabled = false;
    this.listeners = new Map();
    const classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
      contains: (name) => classes.has(name)
    };
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  dispatch(type, properties = {}) {
    let prevented = false;
    let stopped = false;
    this.listeners.get(type)?.({
      button: 0,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; },
      ...properties
    });
    return { prevented, stopped };
  }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function testShortPress() {
  const button = new FakeButton();
  let presses = 0;
  let longPresses = 0;
  const cleanup = setupLongPressButton(button, {
    duration: 20,
    onPress: () => { presses += 1; },
    onLongPress: () => { longPresses += 1; }
  });
  button.dispatch("pointerdown");
  button.dispatch("pointerup");
  button.dispatch("click");
  assert.equal(presses, 1);
  assert.equal(longPresses, 0);
  cleanup();
}

async function testLongPressSuppressesClick() {
  const button = new FakeButton();
  let presses = 0;
  let longPresses = 0;
  const cleanup = setupLongPressButton(button, {
    duration: 10,
    onPress: () => { presses += 1; },
    onLongPress: () => { longPresses += 1; }
  });
  button.dispatch("pointerdown");
  await sleep(20);
  button.dispatch("pointerup");
  const click = button.dispatch("click");
  assert.equal(longPresses, 1);
  assert.equal(presses, 0);
  assert.equal(click.prevented, true);
  cleanup();
}

async function testMovementCancelsLongPress() {
  const button = new FakeButton();
  let longPresses = 0;
  const cleanup = setupLongPressButton(button, {
    duration: 10,
    moveTolerance: 5,
    onLongPress: () => { longPresses += 1; }
  });
  button.dispatch("pointerdown");
  button.dispatch("pointermove", { clientX: 8 });
  await sleep(20);
  assert.equal(longPresses, 0);
  cleanup();
}

async function testPlatformWiring() {
  const [app, map, dashboard, swiftMap] = await Promise.all([
    readFile(new URL("../src/app.js", import.meta.url), "utf8"),
    readFile(new URL("../src/map/weatherMap.js", import.meta.url), "utf8"),
    readFile(new URL("../ios/MeteoScope/Views/MapDashboardView.swift", import.meta.url), "utf8"),
    readFile(new URL("../ios/MeteoScope/Map/WeatherMapView.swift", import.meta.url), "utf8")
  ]);
  assert.match(app, /setupLongPressButton\(document\.getElementById\("locate-button"\)/);
  assert.match(map, /setCurrentLocationVisible/);
  assert.match(map, /CURRENT_LOCATION_LAYER_IDS/);
  assert.match(dashboard, /LongPressGesture\(minimumDuration: 0\.65\)/);
  assert.match(dashboard, /accessibilityAction/);
  assert.match(swiftMap, /showsUserLocationMarker/);
}

await testShortPress();
await testLongPressSuppressesClick();
await testMovementCancelsLongPress();
await testPlatformWiring();
console.log("Current-location marker controls: OK");
