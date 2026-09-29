import {
  fetchWeeklyForecastsForOfficeRegions,
  fetchWeeklyForecastRegionCatalog
} from "../jma/weeklyForecastXml.js";
import { getJmaWeeklyWeatherLabel } from "./weeklyWeatherGlyph.js";

let wakeLock = null;
let modeOpen = false;
let forecastLoaded = false;
let clockDisplayModeSetup = false;

const FORECAST_REGION_PREFIX_BY_OFFICE = Object.freeze({
  "札幌管区気象台": "北海道",
  "旭川地方気象台": "北海道",
  "釧路地方気象台": "北海道",
  "函館地方気象台": "北海道",
  "室蘭地方気象台": "北海道",
  "稚内地方気象台": "北海道",
  "網走地方気象台": "北海道",
  "東京管区気象台": "東京都",
  "大阪管区気象台": "大阪府"
});
const PREFECTURE_OFFICE_NAMES = new Set([
  "青森", "岩手", "宮城", "秋田", "山形", "福島", "茨城", "栃木", "群馬", "埼玉", "千葉", "神奈川",
  "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜", "静岡", "愛知", "三重", "滋賀", "兵庫", "奈良", "和歌山",
  "鳥取", "島根", "岡山", "広島", "山口", "徳島", "香川", "愛媛", "高知", "福岡", "佐賀", "長崎", "熊本", "大分",
  "宮崎", "鹿児島", "沖縄"
]);
const JAPAN_FORECAST_AREA_ORDER = Object.freeze([
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県", "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県",
  "東京都", "東京", "神奈川県", "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県", "三重県",
  "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県", "鳥取県", "島根県", "岡山県", "広島県", "山口県", "徳島県",
  "香川県", "愛媛県", "高知県", "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県"
]);
const HOKKAIDO_AREA_PATTERN = /(?:宗谷|上川|留萌|網走|北見|紋別|釧路|根室|十勝|胆振|日高|石狩|空知|後志|渡島|檜山)/u;
const OKINAWA_AREA_PATTERN = /(?:沖縄|大東|宮古|八重山)/u;

export function setupClockDisplayMode() {
  if (clockDisplayModeSetup) return;
  clockDisplayModeSetup = true;
  const closeButton = document.getElementById("clock-display-close");
  closeButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    void closeClockDisplayMode();
  });

  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("#clock")) {
      void openClockDisplayMode();
      return;
    }
    if (event.target.closest("[data-clock-display-close]")) void closeClockDisplayMode();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && modeOpen) void closeClockDisplayMode();
  });
  window.addEventListener("orientationchange", () => void syncClockDisplayMode());
  window.addEventListener("resize", () => void syncClockDisplayMode());
  document.addEventListener("visibilitychange", () => void syncClockDisplayMode());
}

async function openClockDisplayMode() {
  const mode = document.getElementById("clock-display-mode");
  if (!mode) return;
  modeOpen = true;
  mode.hidden = false;
  document.body.classList.add("clock-display-mode-open");
  await syncClockDisplayMode();
  document.getElementById("clock-display-close")?.focus();
}

async function closeClockDisplayMode() {
  modeOpen = false;
  const mode = document.getElementById("clock-display-mode");
  if (mode) mode.hidden = true;
  document.body.classList.remove("clock-display-mode-open");
  await releaseWakeLock();
  document.getElementById("clock")?.focus();
}

async function syncClockDisplayMode() {
  if (!modeOpen) return;
  const landscape = window.innerWidth > window.innerHeight;
  const visible = document.visibilityState === "visible";
  const status = document.getElementById("clock-display-status");
  const board = document.getElementById("clock-display-board");
  if (!landscape) {
    board?.setAttribute("aria-hidden", "true");
    if (status) status.textContent = "端末を横向きにすると表示を開始します";
    await releaseWakeLock();
    return;
  }
  board?.removeAttribute("aria-hidden");
  if (!forecastLoaded) {
    board?.classList.add("is-loading");
    if (status) status.textContent = "全国の予報を読み込んでいます";
  }
  if (visible) await requestWakeLock();
  if (!forecastLoaded) void loadNationwideForecast();
}

async function requestWakeLock() {
  if (wakeLock || !navigator.wakeLock?.request || document.visibilityState !== "visible") return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch {
    // A power-saving mode or browser policy may decline the optional lock.
  }
}

async function releaseWakeLock() {
  const activeLock = wakeLock;
  wakeLock = null;
  if (activeLock) await activeLock.release().catch(() => {});
}

async function loadNationwideForecast() {
  const status = document.getElementById("clock-display-status");
  const line = document.getElementById("clock-display-marquee-line");
  try {
    const catalog = await fetchWeeklyForecastRegionCatalog();
    const offices = buildNationwideForecastRegions(catalog);
    const regionCount = offices.reduce((count, office) => count + office.regions.length, 0);
    if (!regionCount) throw new Error("forecast regions unavailable");
    if (status) status.textContent = `全国${regionCount}地域の予報を読み込んでいます`;
    const results = await settleForecastOffices(offices);
    const items = buildNationwideTickerEntries(results);
    if (!items.length) throw new Error("forecast unavailable");
    updateTickerLine(line, items);
    forecastLoaded = true;
    document.getElementById("clock-display-board")?.classList.remove("is-loading");
    if (status) status.textContent = `気象庁発表の全国${items.length}地域予報`;
  } catch {
    document.getElementById("clock-display-board")?.classList.add("is-loading");
    if (status) status.textContent = "全国予報を読み込めません。時刻表示は継続します。";
  }
}

function updateTickerLine(line, items) {
  if (!line || !items.length) return;
  const text = `${items.join("　　◆　　")}　　◆　　`;
  line.textContent = text;
  line.dataset.duplicate = text;
  line.style.setProperty("--clock-display-marquee-duration", `${Math.max(64, items.length * 10)}s`);
}

export function buildNationwideForecastRegions(catalog = []) {
  return catalog
    .filter((office) => office?.officeCode && Array.isArray(office.regions) && office.regions.length)
    .map((office) => ({
      officeCode: office.officeCode,
      officeName: office.officeName,
      regions: office.regions.map((region) => ({ ...region }))
    }));
}

async function settleForecastOffices(offices) {
  const results = Array(offices.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < offices.length) {
      const index = nextIndex;
      nextIndex += 1;
      const office = offices[index];
      try {
        const forecasts = await fetchWeeklyForecastsForOfficeRegions(office);
        results[index] = forecasts.map(({ region, forecast }) => ({
          status: "fulfilled",
          value: {
            displayName: formatForecastRegionName(region.areaName, office.officeName),
            forecast
          }
        }));
      } catch (reason) {
        results[index] = [{ status: "rejected", reason }];
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(2, offices.length) }, worker));
  return results.flat();
}

export function buildNationwideTickerEntries(results = []) {
  return results.flatMap((result) => {
    if (result?.status !== "fulfilled") return [];
    const forecast = result.value?.forecast ?? result.value;
    const day = forecast?.days?.[0];
    if (!day) return [];
    const weather = normalizeTickerWeather(day.weather || getJmaWeeklyWeatherLabel(day.weatherCode) || "予報取得中");
    const high = day.maxTemperature !== null && day.maxTemperature !== undefined && Number.isFinite(Number(day.maxTemperature))
      ? ` ${Math.round(Number(day.maxTemperature))}℃`
      : "";
    return [`${result.value?.displayName || forecast.officeName || forecast.areaName}　${weather}${high}`];
  }).sort(compareTickerEntries);
}

export function normalizeTickerWeather(weather) {
  return String(weather ?? "").replaceAll("後", "のち");
}

export function formatForecastRegionName(areaName, officeName = "") {
  const area = String(areaName ?? "").trim();
  if (!area) return "地域予報";
  if (/(?:北海道|都|道|府|県)/u.test(area)) return area;
  const office = String(officeName ?? "").trim();
  const combinedName = `${office}${area}`;
  if (HOKKAIDO_AREA_PATTERN.test(combinedName)) return `北海道${area}`;
  if (OKINAWA_AREA_PATTERN.test(combinedName)) return `沖縄県${area}`;
  const explicitPrefix = FORECAST_REGION_PREFIX_BY_OFFICE[office];
  if (explicitPrefix) {
    const baseName = explicitPrefix.replace(/[都道府県]$/u, "");
    return area.startsWith(baseName) ? area : `${explicitPrefix}${area}`;
  }
  const baseName = office.replace(/(?:管区|地方)?気象台$/u, "");
  if (baseName && area.startsWith(baseName)) return area;
  const prefix = PREFECTURE_OFFICE_NAMES.has(baseName) ? `${baseName}県` : baseName;
  return prefix ? `${prefix}${area}` : area;
}

function compareTickerEntries(left, right) {
  const leftIndex = findForecastAreaIndex(left);
  const rightIndex = findForecastAreaIndex(right);
  return leftIndex - rightIndex || String(left).localeCompare(String(right), "ja");
}

function findForecastAreaIndex(value) {
  const index = JAPAN_FORECAST_AREA_ORDER.findIndex((area) => String(value).startsWith(area));
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}
