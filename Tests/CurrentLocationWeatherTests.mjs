import assert from "node:assert/strict";
import { createCurrentLocationWeather, findCurrentWeatherForecast } from "../src/ui/currentLocationWeather.js";
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

const icon = { innerHTML: "", hidden: false };
const text = { textContent: "" };
const weather = {
  hidden: true,
  title: "",
  setAttribute() {},
  querySelector: (selector) => selector.endsWith("-icon") ? icon : text
};
const clock = { setAttribute() {} };
globalThis.document = { getElementById: (id) => id === "clock" ? clock : weather };
const current = createCurrentLocationWeather({ fetchForecast: async () => ({
  threeHourlyForecasts: [{ dateTime: new Date(Date.now() - 60000).toISOString(), duration: "PT3H", weather: "晴れ", weatherCode: "100" }]
}) });
current.clear("位置情報が許可されていません");
assert.equal(weather.hidden, false);
assert.equal(text.textContent, "位置情報が許可されていません");
assert.equal(icon.hidden, true);
await current.refresh({ status: "found", areaCode: "122010" });
assert.equal(text.textContent, "晴れ");
assert.equal(icon.hidden, false);
const missing = createCurrentLocationWeather({ fetchForecast: async () => ({ threeHourlyForecasts: [] }) });
await missing.refresh({ status: "found", areaCode: "122010" });
assert.equal(text.textContent, "予報を取得できません");
globalThis.document = originalDocument;
console.log("Current location weather tests passed");
