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
      const key = `${office.officeCode}:${region.areaCode}`;
      regionByKey.set(key, {
        ...region,
        officeCode: office.officeCode,
        officeName: office.officeName
      });
      group.append(new Option(`${office.officeName}・${region.areaName}`, key));
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
      renderState(body, "週間天気予報を取得中", "気象庁の最新VPFW50を読み込んでいます。", true);
      forecast = await fetchWeeklyForecastForLocation(locationInfo);
    } else {
      const region = regionByKey.get(selectedValue);
      if (!region) throw new Error("選択した予報区域を確認できません。");
      renderState(
        body,
        `${region.areaName}の週間天気予報を取得中`,
        "気象庁の最新VPFW50を読み込んでいます。",
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
  body.innerHTML = `
    <div class="weekly-weather-summary">
      <div>
        <span>${escapeHtml(forecast.officeName || forecast.publishingOffice)}</span>
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
    ? `<span class="weekly-weather-temperature-empty">－</span>`
    : `<span class="weekly-weather-high">${formatTemperature(day.maxTemperature)}</span><i>/</i><span class="weekly-weather-low">${formatTemperature(day.minTemperature)}</span>`;
  const precipitation = day.precipitationProbability === null ? "－" : `${day.precipitationProbability}%`;
  const reliability = day.reliability ? `<span class="weekly-weather-reliability">信頼度 ${escapeHtml(day.reliability)}</span>` : "";

  return `
    <article class="weekly-weather-day${index === 0 ? " is-first" : ""}" role="listitem">
      <time datetime="${escapeHtml(day.date)}">${escapeHtml(dateLabel)}</time>
      <div class="weekly-weather-icon">
        ${renderWeeklyWeatherGlyph(day.weatherCode, weatherLabel)}
      </div>
      <strong>${escapeHtml(weatherLabel)}</strong>
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
