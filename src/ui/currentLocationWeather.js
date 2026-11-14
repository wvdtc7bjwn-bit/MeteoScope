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

export function findCurrentLocationForecast(forecast, now = Date.now()) {
  const hourly = findCurrentWeatherForecast(forecast, now);
  if (hourly) return { ...hourly, forecastType: "three-hourly" };
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
  const daily = (forecast?.days ?? []).find((day) => String(day.date ?? "").slice(0, 10) === date && String(day.weather ?? "").trim());
  return daily ? { ...daily, forecastType: "daily" } : null;
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
    const slot = findCurrentLocationForecast(forecast);
    const message = slot ? slot.weather : (unavailable || (forecast ? "予報を取得できません" : ""));
    element.hidden = !message;
    element.setAttribute("data-has-forecast", slot ? "true" : "false");
    if (!message) return;
    element.querySelector(".current-location-weather-icon").innerHTML = slot ? renderWeeklyWeatherIcon(slot.weatherCode, slot.weather) : "";
    element.querySelector(".current-location-weather-icon").hidden = !slot;
    const text = element.querySelector(".current-location-weather-text");
    text.textContent = slot ? "" : message;
    text.hidden = Boolean(slot);
    const label = element.querySelector(".current-location-weather-copy small");
    if (label) label.textContent = slot ? slot.forecastType === "daily" ? "今日の予報" : "3時間予報" : "現在地・予報";
    element.title = slot ? `現在地付近の${slot.forecastType === "daily" ? "今日の予報" : "３時間予報"}：${message}` : message;
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
        unavailable = findCurrentLocationForecast(result) ? "" : "予報を取得できません";
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
