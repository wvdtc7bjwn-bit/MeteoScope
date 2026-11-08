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

export function createCurrentLocationWeather({ fetchForecast = fetchWeeklyForecastForLocation } = {}) {
  let requestId = 0;
  let locationKey = "";
  let forecast = null;
  let pending = null;
  let unavailable = "";
  const element = document.getElementById("current-location-weather");

  function render() {
    if (!element) return;
    const slot = findCurrentWeatherForecast(forecast);
    const message = slot ? slot.weather : unavailable;
    element.hidden = !message;
    if (!message) return;
    element.querySelector(".current-location-weather-icon").innerHTML = slot ? renderWeeklyWeatherIcon(slot.weatherCode, slot.weather) : "";
    element.querySelector(".current-location-weather-icon").hidden = !slot;
    element.querySelector(".current-location-weather-text").textContent = message;
    element.title = slot ? `現在地付近の３時間予報：${message}` : message;
    element.setAttribute("aria-label", `${element.title}。週間天気予報を開く`);
  }

  return {
    clear(message = "") {
      requestId += 1;
      locationKey = "";
      forecast = null;
      pending = null;
      unavailable = message;
      render();
    },
    async refresh(location) {
      const key = location?.status === "found" ? String(location.areaCode ?? "") : "";
      if (!key) { this.clear("現在地を取得できません"); return; }
      if (pending && key === locationKey) return pending;
      if (key !== locationKey) { forecast = null; unavailable = ""; render(); }
      locationKey = key;
      const id = ++requestId;
      pending = fetchForecast(location).then((result) => {
        if (id !== requestId) return;
        forecast = result;
        unavailable = findCurrentWeatherForecast(result) ? "" : "予報を取得できません";
        render();
      }).catch((error) => {
        if (id !== requestId) return;
        forecast = null;
        unavailable = "予報を取得できません";
        render();
        console.warn("[MeteoScope] current location forecast unavailable", error);
      }).finally(() => { if (id === requestId) pending = null; });
      return pending;
    }
  };
}
