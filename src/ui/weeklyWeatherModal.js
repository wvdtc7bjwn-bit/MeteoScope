import {
  fetchWeeklyForecastForLocation,
  fetchWeeklyForecastForRegion,
  fetchWeeklyForecastRegionCatalog
} from "../jma/weeklyForecastXml.js";
import {
  getJmaWeeklyWeatherLabel,
  renderWeeklyWeatherGlyph
} from "./weeklyWeatherGlyph.js";

let initialized = false;
let getCurrentLocation = () => ({ status: "idle" });
let requestCurrentLocation = async () => {};
let regionCatalog = [];
let regionByKey = new Map();
let regionOptionsPromise = null;
let loadSequence = 0;

export function setupWeeklyWeatherModal(options = {}) {
  if (initialized) return;
  initialized = true;
  getCurrentLocation = options.getCurrentLocation ?? getCurrentLocation;
  requestCurrentLocation = options.requestCurrentLocation ?? requestCurrentLocation;

  const button = document.getElementById("weekly-weather-button");
  const modal = document.getElementById("weekly-weather-modal");
  const regionSelect = document.getElementById("weekly-weather-region-select");
  if (!button || !modal) return;

  button.addEventListener("click", () => void openWeeklyWeatherModal());
  regionSelect?.addEventListener("change", () => void loadWeeklyWeather());
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
  await ensureRegionOptions();
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

async function ensureRegionOptions() {
  if (regionCatalog.length) return;
  if (!regionOptionsPromise) {
    regionOptionsPromise = fetchWeeklyForecastRegionCatalog()
      .then((catalog) => {
        regionCatalog = catalog;
        regionByKey = new Map();
        renderRegionOptions(catalog);
      })
      .catch((error) => {
        regionOptionsPromise = null;
        console.warn("[MeteoScope] weekly forecast region catalog unavailable", error);
      });
  }
  await regionOptionsPromise;
}

function renderRegionOptions(catalog) {
  const select = document.getElementById("weekly-weather-region-select");
  if (!select) return;
  const selectedValue = select.value || "current";
  const fragment = document.createDocumentFragment();
  fragment.append(new Option("現在地", "current"));

  catalog.forEach((office) => {
    const group = document.createElement("optgroup");
    group.label = office.officeName;
    office.regions.forEach((region) => {
      const key = `${office.officeCode}:${region.areaCode}:${region.forecastAreaCode}`;
      regionByKey.set(key, {
        ...region,
        officeCode: office.officeCode,
        officeName: office.officeName
      });
      const optionLabel = region.areaName === office.officeName
        ? region.areaName
        : `${office.officeName}・${region.areaName}`;
      group.append(new Option(optionLabel, key));
    });
    fragment.append(group);
  });

  select.replaceChildren(fragment);
  select.value = regionByKey.has(selectedValue) || selectedValue === "current"
    ? selectedValue
    : "current";
}

async function loadWeeklyWeather() {
  const body = document.getElementById("weekly-weather-body");
  const select = document.getElementById("weekly-weather-region-select");
  if (!body) return;
  const requestId = ++loadSequence;
  const selectedValue = select?.value || "current";

  try {
    let forecast;
    if (selectedValue === "current") {
      renderState(body, "現在地を確認しています", "予報区域を特定しています。", true);
      let locationInfo = getCurrentLocation();
      if (locationInfo?.status !== "found" || !locationInfo.areaCode) {
        await requestCurrentLocation();
        locationInfo = getCurrentLocation();
      }
      if (locationInfo?.status !== "found" || !locationInfo.areaCode) {
        throw new Error(locationInfo?.message || "現在地を取得できませんでした。");
      }
      renderState(body, "週間天気予報を取得中", "気象庁の最新予報を読み込んでいます。", true);
      forecast = await fetchWeeklyForecastForLocation(locationInfo);
    } else {
      const region = regionByKey.get(selectedValue);
      if (!region) throw new Error("選択した予報区域を確認できません。");
      renderState(
        body,
        `${region.areaName}の週間天気予報を取得中`,
        "気象庁の最新予報を読み込んでいます。",
        true
      );
      forecast = await fetchWeeklyForecastForRegion(region);
    }

    if (requestId !== loadSequence) return;
    renderForecast(body, forecast);
  } catch (error) {
    if (requestId !== loadSequence) return;
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
  const officeName = forecast.officeName || forecast.publishingOffice;
  const summaryLabel = officeName && officeName !== forecast.areaName
    ? officeName
    : "予報区域";
  body.innerHTML = `
    <div class="weekly-weather-summary">
      <div class="weekly-weather-summary-heading">
        <span>${escapeHtml(summaryLabel)}</span>
        <h3>${escapeHtml(forecast.areaName)}</h3>
      </div>
      <p class="weekly-weather-issued">
        <small>最新発表</small>
        <strong>${escapeHtml(forecast.reportTimeLabel)}</strong>
        <span>${escapeHtml(forecast.publishingOffice)}</span>
      </p>
    </div>
    <div class="weekly-weather-days" role="list" aria-label="週間天気予報">
      ${days.map(renderDay).join("")}
    </div>
    <footer class="weekly-weather-source">
      <span>気象庁 防災情報XML「府県天気予報・府県週間天気予報」</span>
      <span>${escapeHtml(forecast.bulletinCode)}${forecast.stationName ? `・気温 ${escapeHtml(forecast.stationName)}` : ""}</span>
    </footer>
  `;
}

function renderDay(day, index) {
  const date = new Date(day.date);
  const weatherLabel = day.weather || getJmaWeeklyWeatherLabel(day.weatherCode) || "天気未取得";
  const dateLabel = Number.isNaN(date.getTime())
    ? day.date
    : new Intl.DateTimeFormat("ja-JP", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
      timeZone: "Asia/Tokyo"
    }).format(date);
  const temperature = day.maxTemperature === null && day.minTemperature === null
    ? `<span class="weekly-weather-temperature-empty">気温未発表</span>`
    : `
      <span class="weekly-weather-temperature-item is-high">
        <small>最高</small>
        <b class="weekly-weather-high">${formatTemperature(day.maxTemperature)}</b>
      </span>
      <span class="weekly-weather-temperature-item is-low">
        <small>最低</small>
        <b class="weekly-weather-low">${formatTemperature(day.minTemperature)}</b>
      </span>
    `;
  const precipitation = day.precipitationProbability === null ? "－" : `${day.precipitationProbability}%`;
  const reliability = day.reliability
    ? `<span class="weekly-weather-reliability" aria-label="予報の信頼度 ${escapeHtml(day.reliability)}">${escapeHtml(day.reliability)}</span>`
    : "";
  const relativeDayLabel = getWeeklyWeatherRelativeDayLabel(day.date);
  const dayLabel = relativeDayLabel
    ? `<span class="weekly-weather-today">${relativeDayLabel}</span>`
    : "";

  return `
    <article class="weekly-weather-day${index === 0 ? " is-first" : ""}" role="listitem">
      <header class="weekly-weather-day-heading">
        <div>${dayLabel}<time datetime="${escapeHtml(day.date)}">${escapeHtml(dateLabel)}</time></div>
        ${reliability}
      </header>
      <div class="weekly-weather-icon">
        ${renderWeeklyWeatherGlyph(day.weatherCode, weatherLabel)}
      </div>
      <strong class="weekly-weather-label">${escapeHtml(weatherLabel)}</strong>
      <div class="weekly-weather-temperature">${temperature}</div>
      <p class="weekly-weather-precipitation"><span>降水確率</span><b>${escapeHtml(precipitation)}</b></p>
    </article>
  `;
}

export function getWeeklyWeatherRelativeDayLabel(dayValue, referenceDate = new Date()) {
  const dayKey = String(dayValue ?? "").slice(0, 10);
  if (!dayKey) return "";
  const todayKey = formatJapanDateKey(referenceDate);
  if (dayKey === todayKey) return "今日";
  const tomorrow = new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000);
  return dayKey === formatJapanDateKey(tomorrow) ? "明日" : "";
}

function formatJapanDateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Tokyo"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
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
  return Number.isFinite(value) ? `${value}°` : "－";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#039;");
}
