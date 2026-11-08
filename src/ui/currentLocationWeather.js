import { fetchWeeklyForecastForLocation } from "../jma/weeklyForecastXml.js";
import { renderWeeklyWeatherIcon } from "./weeklyWeatherIcon.js";

// JMA's three-hour weather describes the interval beginning at dateTime.
export function findCurrentWeatherForecast(forecast, now = Date.now()) {
  const slots = Array.isArray(forecast?.threeHourlyForecasts) ? forecast.threeHourlyForecasts : [];
  return slots.find((slot) => {
    const start = Date.parse(slot.dateTime);
    const match = /^PT(\d+)H$/u.exec(slot.duration ?? "");
    const duration = match ? Number(match[1]) * 3600000 : 3 * 3600000;
    return Number.isFinite(start) && duration > 0 && now >= start && now < start + duration
      && Boolean(String(slot.weather ?? "").trim());
  }) ?? null;
}

export function createCurrentLocationWeather() {
  let requestId = 0;
  let locationKey = "";
  let forecast = null;
  let pending = null;
  const element = document.getElementById("current-location-weather");
  const clock = document.getElementById("clock");

  function render() {
    if (!element) return;
    const slot = findCurrentWeatherForecast(forecast);
    element.hidden = !slot;
    clock?.setAttribute("aria-label", slot ? `現在地付近の３時間予報 ${slot.weather}。時計表示モードを開く` : "時計表示モードを開く");
    if (!slot) return;
    element.querySelector(".current-location-weather-icon").innerHTML = renderWeeklyWeatherIcon(slot.weatherCode, slot.weather);
    element.querySelector(".current-location-weather-text").textContent = slot.weather;
    element.title = `現在地付近の３時間予報：${slot.weather}`;
    element.setAttribute("aria-label", element.title);
  }

  return {
    clear() {
      requestId += 1;
      locationKey = "";
      forecast = null;
      pending = null;
      render();
    },
    async refresh(location) {
      const key = location?.status === "found" ? String(location.areaCode ?? "") : "";
      if (!key) { this.clear(); return; }
      if (pending && key === locationKey) return pending;
      if (key !== locationKey) { forecast = null; render(); }
      locationKey = key;
      const id = ++requestId;
      pending = fetchWeeklyForecastForLocation(location).then((result) => {
        if (id !== requestId) return;
        forecast = result;
        render();
      }).catch((error) => {
        if (id !== requestId) return;
        forecast = null;
        render();
        console.warn("[MeteoScope] current location forecast unavailable", error);
      }).finally(() => { if (id === requestId) pending = null; });
      return pending;
    }
  };
}
