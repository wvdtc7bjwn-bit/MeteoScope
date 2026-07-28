import { fetchWeeklyForecastForLocation } from "../jma/weeklyForecastXml.js";

let initialized = false;
let getCurrentLocation = () => ({ status: "idle" });
let requestCurrentLocation = async () => {};

export function setupWeeklyWeatherModal(options = {}) {
  if (initialized) return;
  initialized = true;
  getCurrentLocation = options.getCurrentLocation ?? getCurrentLocation;
  requestCurrentLocation = options.requestCurrentLocation ?? requestCurrentLocation;

  const button = document.getElementById("weekly-weather-button");
  const modal = document.getElementById("weekly-weather-modal");
  if (!button || !modal) return;

  button.addEventListener("click", () => void openWeeklyWeatherModal());
  modal.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-weekly-weather-close]")) closeWeeklyWeatherModal();
    if (event.target.closest("[data-weekly-weather-retry]")) void loadWeeklyWeather();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeWeeklyWeatherModal();
  });
}

export async function openWeeklyWeatherModal() {
  const modal = document.getElementById("weekly-weather-modal");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("weekly-weather-button")?.setAttribute("aria-expanded", "true");
  await loadWeeklyWeather();
}

function closeWeeklyWeatherModal() {
  const modal = document.getElementById("weekly-weather-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.getElementById("weekly-weather-button")?.setAttribute("aria-expanded", "false");
  if (![...document.querySelectorAll(".warning-modal:not([hidden])")].length) {
    document.body.classList.remove("modal-open");
  }
}

async function loadWeeklyWeather() {
  const body = document.getElementById("weekly-weather-body");
  if (!body) return;
  renderState(body, "現在地を確認しています", "予報区域を特定しています。", true);

  try {
    let locationInfo = getCurrentLocation();
    if (locationInfo?.status !== "found" || !locationInfo.areaCode) {
      await requestCurrentLocation();
      locationInfo = getCurrentLocation();
    }
    if (locationInfo?.status !== "found" || !locationInfo.areaCode) {
      throw new Error(locationInfo?.message || "現在地を取得できませんでした。");
    }

    renderState(body, "週間天気予報を取得中", "気象庁の最新VPFW50を読み込んでいます。", true);
    const forecast = await fetchWeeklyForecastForLocation(locationInfo);
    renderForecast(body, forecast);
  } catch (error) {
    console.warn("[MeteoScope] weekly forecast unavailable", error);
    renderState(
      body,
      "週間天気予報を表示できません",
      error?.message || "時間をおいてもう一度お試しください。",
      false,
      true
    );
  }
}

function renderForecast(body, forecast) {
  const days = forecast.days ?? [];
  body.innerHTML = `
    <div class="weekly-weather-summary">
      <div>
        <span>${escapeHtml(forecast.municipalityName || forecast.areaName)}</span>
        <h3>${escapeHtml(forecast.areaName)}</h3>
      </div>
      <p>${escapeHtml(forecast.reportTimeLabel)} 発表<br>${escapeHtml(forecast.publishingOffice)}</p>
    </div>
    <div class="weekly-weather-days" role="list" aria-label="7日間の天気予報">
      ${days.map(renderDay).join("")}
    </div>
    <footer class="weekly-weather-source">
      <span>気象庁 防災情報XML「府県週間天気予報」</span>
      <span>VPFW50${forecast.stationName ? `・気温 ${escapeHtml(forecast.stationName)}` : ""}</span>
    </footer>
  `;
}

function renderDay(day, index) {
  const date = new Date(day.date);
  const dateLabel = Number.isNaN(date.getTime())
    ? day.date
    : new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      timeZone: "Asia/Tokyo"
    }).format(date);
  const iconUrl = /^\d{3}$/u.test(day.weatherCode)
    ? `https://www.jma.go.jp/bosai/forecast/img/${day.weatherCode}.svg`
    : "";
  const temperature = day.maxTemperature === null && day.minTemperature === null
    ? `<span class="weekly-weather-temperature-empty">―</span>`
    : `<span class="weekly-weather-high">${formatTemperature(day.maxTemperature)}</span><i>/</i><span class="weekly-weather-low">${formatTemperature(day.minTemperature)}</span>`;
  const precipitation = day.precipitationProbability === null ? "―" : `${day.precipitationProbability}%`;
  const reliability = day.reliability ? `<span class="weekly-weather-reliability">信頼度 ${escapeHtml(day.reliability)}</span>` : "";

  return `
    <article class="weekly-weather-day${index === 0 ? " is-first" : ""}" role="listitem">
      <time datetime="${escapeHtml(day.date)}">${escapeHtml(dateLabel)}</time>
      <div class="weekly-weather-icon">
        ${iconUrl ? `<img src="${iconUrl}" alt="" width="64" height="48">` : ""}
      </div>
      <strong>${escapeHtml(day.weather || "天気未取得")}</strong>
      <div class="weekly-weather-temperature">${temperature}</div>
      <p><span>降水</span><b>${escapeHtml(precipitation)}</b></p>
      ${reliability}
    </article>
  `;
}

function renderState(body, title, message, loading = false, retry = false) {
  body.innerHTML = `
    <div class="weekly-weather-state${loading ? " is-loading" : ""}">
      <span class="weekly-weather-state-icon" aria-hidden="true"></span>
      <strong>${escapeHtml(title)}</strong>
      <p>${escapeHtml(message)}</p>
      ${retry ? `<button type="button" data-weekly-weather-retry>再読み込み</button>` : ""}
    </div>
  `;
}

function formatTemperature(value) {
  return Number.isFinite(value) ? `${value}°` : "―";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
