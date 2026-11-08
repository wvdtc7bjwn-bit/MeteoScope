import assert from "node:assert/strict";
import { findCurrentWeatherForecast } from "../src/ui/currentLocationWeather.js";
import { startClock } from "../src/ui/time.js";

const slots = { threeHourlyForecasts: [
  { dateTime: "2026-11-08T12:00:00+09:00", duration: "PT3H", weather: "晴れ" },
  { dateTime: "2026-11-08T15:00:00+09:00", duration: "PT3H", weather: "くもり" }
] };
assert.equal(findCurrentWeatherForecast(slots, Date.parse("2026-11-08T14:59:00+09:00"))?.weather, "晴れ");
assert.equal(findCurrentWeatherForecast(slots, Date.parse("2026-11-08T15:00:00+09:00"))?.weather, "くもり");
assert.equal(findCurrentWeatherForecast(slots, Date.parse("2026-11-08T18:00:00+09:00")), null);
assert.equal(findCurrentWeatherForecast({ threeHourlyForecasts: [] }), null);
assert.equal(findCurrentWeatherForecast({ threeHourlyForecasts: [{ dateTime: "invalid", weather: "晴れ" }] }), null);
const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const face = { innerHTML: "" };
const button = { innerHTML: "weather must remain", querySelector: () => face };
globalThis.document = { getElementById: (id) => id === "clock" ? button : null };
globalThis.window = { setTimeout: () => 1, clearTimeout: () => {} };
const stopClock = startClock("clock");
assert.match(face.innerHTML, /clock-seven-segment/u);
assert.equal(button.innerHTML, "weather must remain", "clock ticks must preserve weather content");
stopClock();
globalThis.document = originalDocument;
globalThis.window = originalWindow;
console.log("Current location weather tests passed");
