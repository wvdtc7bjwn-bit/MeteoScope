import {
  fetchWeeklyForecastForLocation,
  fetchWeeklyForecastForRegion,
  fetchWeeklyForecastRegionCatalog
} from "../jma/weeklyForecastXml.js";
import {
  getJmaWeeklyWeatherLabel,
  renderWeeklyWeatherGlyph
} from "./weeklyWeatherGlyph.js";
import {
  getCurrentLanguage,
  localizeText
} from "./locale.js";

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
    const hourlyToggle = event.target.closest("[data-weekly-weather-hourly-toggle]");
    if (hourlyToggle) {
      toggleThreeHourlyForecast(modal, hourlyToggle);
    }
  });
  modal.addEventListener("keydown", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.key !== "Enter" && event.key !== " ") return;
    const hourlyToggle = event.target.closest("[data-weekly-weather-hourly-toggle]");
    if (!hourlyToggle) return;
    event.preventDefault();
    toggleThreeHourlyForecast(modal, hourlyToggle);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeWeeklyWeatherModal();
  });
  window.addEventListener("meteoscope-language-change", () => {
    if (regionCatalog.length) renderRegionOptions(regionCatalog);
    if (!modal.hidden) void loadWeeklyWeather();
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
  const language = getCurrentLanguage();
  const fragment = document.createDocumentFragment();
  fragment.append(new Option(localizeText("現在地", language), "current"));

  catalog.forEach((office) => {
    const group = document.createElement("optgroup");
    const officeLabel = localizeText(office.officeName, language);
    group.label = officeLabel;
    office.regions.forEach((region) => {
      const key = `${office.officeCode}:${region.areaCode}:${region.forecastAreaCode}`;
      regionByKey.set(key, {
        ...region,
        officeCode: office.officeCode,
        officeName: office.officeName
      });
      const areaLabel = localizeText(region.areaName, language);
      const optionLabel = region.areaName === office.officeName
        ? areaLabel
        : `${officeLabel} · ${areaLabel}`;
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
      const language = getCurrentLanguage();
      const localizedAreaName = localizeText(region.areaName, language);
      renderState(
        body,
        language === "en" ? `Loading weekly forecast for ${localizedAreaName}` : `${region.areaName}の週間天気予報を取得中`,
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
  const threeHourlyByDate = groupThreeHourlyForecastsByDate(forecast.threeHourlyForecasts);
  const daysWithThreeHourlyForecasts = days
    .map((day) => ({
      day,
      forecasts: threeHourlyByDate.get(forecastDateKey(day.date)) ?? []
    }))
    .filter(({ forecasts }) => forecasts.length);
  const officeName = forecast.officeName || forecast.publishingOffice;
  const summaryLabel = officeName && officeName !== forecast.areaName
    ? officeName
    : "予報区域";
  const language = getCurrentLanguage();
  body.innerHTML = `
    <div class="weekly-weather-summary">
      <div class="weekly-weather-summary-heading">
        <span>${escapeHtml(localizeText(summaryLabel, language))}</span>
        <h3>${escapeHtml(localizeText(forecast.areaName, language))}</h3>
      </div>
      <p class="weekly-weather-issued">
        <small>${escapeHtml(localizeText("最新発表", language))}</small>
        <strong>${escapeHtml(forecast.reportTimeLabel)}</strong>
        <span>${escapeHtml(localizeText(forecast.publishingOffice, language))}</span>
      </p>
    </div>
    <div class="weekly-weather-days" role="list" aria-label="${escapeHtml(localizeText("週間天気予報", language))}">
      ${days.map((day, index) => renderDay(
        day,
        index,
        language,
        threeHourlyByDate.get(forecastDateKey(day.date)) ?? []
      )).join("")}
    </div>
    <div class="weekly-weather-wide-hourly-stage" data-weekly-weather-wide-hourly-stage hidden>
      ${daysWithThreeHourlyForecasts.map(({ day, forecasts }) => renderThreeHourlyPanel(
        day,
        forecasts,
        language,
        "wide"
      )).join("")}
    </div>
    <footer class="weekly-weather-source">
      <span>気象庁 防災情報XML「府県天気予報・府県週間天気予報」</span>
      <span>${escapeHtml(forecast.bulletinCode)}${forecast.stationName ? ` · ${escapeHtml(localizeText("気温", language))} ${escapeHtml(localizeText(forecast.stationName, language))}` : ""}</span>
    </footer>
  `;
}

function renderDay(day, index, language = getCurrentLanguage(), threeHourlyForecasts = []) {
  const date = new Date(day.date);
  const sourceWeatherLabel = day.weather || getJmaWeeklyWeatherLabel(day.weatherCode) || "天気未取得";
  const weatherLabel = localizeText(sourceWeatherLabel, language);
  const dateLabel = formatWeeklyWeatherDateLabel(day.date, language);
  const temperatureUnavailableLabel = localizeText("気温未発表", language);
  const temperatureUnavailableText = language === "en" ? "N/A" : temperatureUnavailableLabel;
  const highLabel = localizeText("最高", language);
  const lowLabel = localizeText("最低", language);
  const precipitationLabel = localizeText("降水確率", language);
  const precipitationText = language === "en" ? "Rain" : precipitationLabel;
  const temperature = day.maxTemperature === null && day.minTemperature === null
    ? `<span class="weekly-weather-temperature-empty" aria-label="${escapeHtml(temperatureUnavailableLabel)}">${escapeHtml(temperatureUnavailableText)}</span>`
    : `
      <span class="weekly-weather-temperature-item is-high">
        <small>${escapeHtml(highLabel)}</small>
        <b class="weekly-weather-high">${formatTemperature(day.maxTemperature)}</b>
      </span>
      <span class="weekly-weather-temperature-item is-low">
        <small>${escapeHtml(lowLabel)}</small>
        <b class="weekly-weather-low">${formatTemperature(day.minTemperature)}</b>
      </span>
    `;
  const precipitation = day.precipitationProbability === null ? "－" : `${day.precipitationProbability}%`;
  const reliability = day.reliability
    ? `<span class="weekly-weather-reliability" aria-label="予報の信頼度 ${escapeHtml(day.reliability)}">${escapeHtml(day.reliability)}</span>`
    : "";
  const relativeDayLabel = getWeeklyWeatherRelativeDayLabel(day.date, new Date(), language);
  const dayLabel = relativeDayLabel
    ? `<span class="weekly-weather-today">${relativeDayLabel}</span>`
    : "";
  const dateKey = forecastDateKey(day.date);
  const hourlyAttributes = threeHourlyForecasts.length
    ? ` data-weekly-weather-hourly-toggle="${escapeHtml(dateKey)}" tabindex="0" aria-controls="weekly-weather-hourly-${escapeHtml(dateKey)} weekly-weather-hourly-${escapeHtml(dateKey)}-wide" aria-expanded="false"`
    : "";

  return `
    <article class="weekly-weather-day${index === 0 ? " is-first" : ""}${threeHourlyForecasts.length ? " has-hourly" : ""}" role="listitem"${hourlyAttributes}>
      <div class="weekly-weather-day-summary">
        <header class="weekly-weather-day-heading">
          <div>${dayLabel}<time datetime="${escapeHtml(day.date)}">${escapeHtml(dateLabel)}</time></div>
          ${reliability}
        </header>
        <div class="weekly-weather-icon">
          ${renderWeeklyWeatherGlyph(day.weatherCode, sourceWeatherLabel)}
        </div>
        <strong class="weekly-weather-label">${escapeHtml(weatherLabel)}</strong>
        <div class="weekly-weather-temperature">${temperature}</div>
        <p class="weekly-weather-precipitation"><span aria-label="${escapeHtml(precipitationLabel)}">${escapeHtml(precipitationText)}</span><b>${escapeHtml(precipitation)}</b></p>
      </div>
      ${threeHourlyForecasts.length ? renderThreeHourlyPanel(day, threeHourlyForecasts, language) : ""}
    </article>
  `;
}

function groupThreeHourlyForecastsByDate(forecasts = []) {
  const grouped = new Map();
  forecasts.forEach((forecast) => {
    const dateKey = forecastDateKey(forecast.dateTime);
    if (!dateKey) return;
    const group = grouped.get(dateKey) ?? [];
    group.push(forecast);
    grouped.set(dateKey, group);
  });
  grouped.forEach((group) => group.sort((left, right) => left.dateTime.localeCompare(right.dateTime)));
  return grouped;
}

function renderThreeHourlyPanel(day, forecasts, language, layout = "inline") {
  const dateKey = forecastDateKey(day.date);
  const isWide = layout === "wide";
  return `
    <section
      id="weekly-weather-hourly-${escapeHtml(dateKey)}${isWide ? "-wide" : ""}"
      class="weekly-weather-hourly-panel${isWide ? " is-wide" : " is-inline"}"
      data-weekly-weather-hourly-panel="${escapeHtml(dateKey)}"
      data-weekly-weather-hourly-layout="${layout}"
      aria-label="${escapeHtml(localizeText("3時間ごとの予報", language))}"
      hidden
    >
      <header class="weekly-weather-hourly-heading">
        <strong>${escapeHtml(formatWeeklyWeatherDateLabel(day.date, language))}</strong>
        <span>${escapeHtml(localizeText("日別予報", language))}</span>
      </header>
      <div class="weekly-weather-hourly-list" role="list">
        ${forecasts.map((forecast) => renderThreeHourlyForecast(forecast, language)).join("")}
      </div>
    </section>
  `;
}

function renderThreeHourlyForecast(forecast, language) {
  const sourceWeatherLabel = forecast.weather || getJmaWeeklyWeatherLabel(forecast.weatherCode) || "天気未取得";
  const wind = formatThreeHourlyWind(forecast, language);
  const windArrow = getThreeHourlyWindArrow(forecast.windDirection);
  return `
    <article class="weekly-weather-hourly-item" role="listitem">
      <time datetime="${escapeHtml(forecast.dateTime)}">${escapeHtml(formatThreeHourlyTime(forecast.dateTime, language))}</time>
      <div class="weekly-weather-hourly-main">
        <div class="weekly-weather-hourly-icon">${renderWeeklyWeatherGlyph(forecast.weatherCode, sourceWeatherLabel)}</div>
        <p class="weekly-weather-hourly-temperature"><b>${escapeHtml(formatTemperature(forecast.temperature))}</b></p>
      </div>
      <strong class="weekly-weather-hourly-condition" title="${escapeHtml(localizeText(sourceWeatherLabel, language))}">${escapeHtml(localizeText(sourceWeatherLabel, language))}</strong>
      <div class="weekly-weather-hourly-wind-row">
        <span class="weekly-weather-hourly-wind-arrow" aria-hidden="true">${escapeHtml(windArrow)}</span>
        <p class="weekly-weather-hourly-wind"><b>${escapeHtml(wind)}</b></p>
      </div>
    </article>
  `;
}

function toggleThreeHourlyForecast(modal, toggle) {
  const dateKey = toggle.getAttribute("data-weekly-weather-hourly-toggle") ?? "";
  const selectedPanels = [...modal.querySelectorAll("[data-weekly-weather-hourly-panel]")]
    .filter((panel) => panel.getAttribute("data-weekly-weather-hourly-panel") === dateKey);
  if (!selectedPanels.length) return;
  const shouldOpen = toggle.getAttribute("aria-expanded") !== "true";
  const useWideLayout = window.matchMedia(
    "(min-width: 801px), (orientation: landscape) and (max-height: 600px)"
  ).matches;
  const selectedLayout = useWideLayout ? "wide" : "inline";
  const wideStage = modal.querySelector("[data-weekly-weather-wide-hourly-stage]");
  modal.querySelectorAll("[data-weekly-weather-hourly-toggle]").forEach((button) => {
    button.setAttribute("aria-expanded", "false");
    button.classList.remove("is-hourly-expanded");
    button.classList.remove("is-hourly-selected");
  });
  modal.querySelectorAll("[data-weekly-weather-hourly-panel]").forEach((panel) => {
    panel.hidden = true;
  });
  if (wideStage) wideStage.hidden = true;
  if (!shouldOpen) return;
  toggle.setAttribute("aria-expanded", "true");
  toggle.classList.add("is-hourly-selected");
  if (!useWideLayout) toggle.classList.add("is-hourly-expanded");
  const selectedPanel = selectedPanels.find(
    (panel) => panel.getAttribute("data-weekly-weather-hourly-layout") === selectedLayout
  );
  if (!selectedPanel) return;
  selectedPanel.hidden = false;
  if (useWideLayout && wideStage) wideStage.hidden = false;
}

function formatThreeHourlyTime(value, language) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  const hour = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    hour12: false,
    hourCycle: "h23",
    timeZone: "Asia/Tokyo"
  }).format(date);
  return language === "en" ? `${hour}:00` : `${Number(hour)}時`;
}

function formatThreeHourlyWind(forecast, language) {
  const direction = localizeWindDirection(forecast.windDirection, language);
  const range = String(forecast.windSpeedRange ?? "").trim().replace(/\s+/gu, "–");
  const speed = range ? `${range}m/s` : localizeText(forecast.windSpeedDescription, language);
  return [direction, speed].filter(Boolean).join(" ") || "－";
}

function getThreeHourlyWindArrow(value) {
  return {
    北: "↓",
    北東: "↙",
    東: "←",
    南東: "↖",
    南: "↑",
    南西: "↗",
    西: "→",
    北西: "↘"
  }[String(value ?? "").trim()] ?? "・";
}

function localizeWindDirection(value, language) {
  const direction = String(value ?? "").trim();
  if (language !== "en") return direction;
  return {
    北: "N",
    北東: "NE",
    東: "E",
    南東: "SE",
    南: "S",
    南西: "SW",
    西: "W",
    北西: "NW"
  }[direction] ?? localizeText(direction, language);
}

function forecastDateKey(value) {
  return String(value ?? "").slice(0, 10);
}

export function getWeeklyWeatherRelativeDayLabel(
  dayValue,
  referenceDate = new Date(),
  language = getCurrentLanguage()
) {
  const dayKey = String(dayValue ?? "").slice(0, 10);
  if (!dayKey) return "";
  const todayKey = formatJapanDateKey(referenceDate);
  if (dayKey === todayKey) return localizeText("今日", language);
  const tomorrow = new Date(referenceDate.getTime() + 24 * 60 * 60 * 1000);
  return dayKey === formatJapanDateKey(tomorrow) ? localizeText("明日", language) : "";
}

export function formatWeeklyWeatherDateLabel(dayValue, language = getCurrentLanguage()) {
  const date = new Date(dayValue);
  if (Number.isNaN(date.getTime())) return String(dayValue ?? "");
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "ja-JP", {
    month: "numeric",
    day: "numeric",
    weekday: "short",
    timeZone: "Asia/Tokyo"
  }).format(date);
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
  const language = getCurrentLanguage();
  body.innerHTML = `
    <div class="weekly-weather-state${loading ? " is-loading" : ""}">
      <span class="weekly-weather-state-icon" aria-hidden="true"></span>
      <strong>${escapeHtml(localizeText(title, language))}</strong>
      <p>${escapeHtml(localizeText(message, language))}</p>
      ${retry ? `<button type="button" data-weekly-weather-retry>${escapeHtml(localizeText("再読み込み", language))}</button>` : ""}
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
