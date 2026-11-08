import { APP_BASE_URL } from "../config.js";
import { renderWeeklyWeatherGlyph } from "./weeklyWeatherGlyph.js";
import { WEEKLY_WEATHER_ICON_CODES } from "./weeklyWeatherIconCodes.js";

// Three-hourly JMA forecasts often provide simple text without a weather code.
// Only map exact terms; leave more complex or unknown descriptions to the fallback.
const THREE_HOURLY_WEATHER_CODES = Object.freeze({
  "晴": "100", "晴れ": "100", "くもり": "200", "曇": "200", "曇り": "200",
  "雨": "300", "雪": "400", "霧": "209"
});

export function renderWeeklyWeatherIcon(weatherCode, weatherText = "") {
  const rawCode = String(weatherCode ?? "").trim();
  const code = rawCode || THREE_HOURLY_WEATHER_CODES[String(weatherText ?? "").trim()] || "";
  if (!WEEKLY_WEATHER_ICON_CODES.has(code)) return renderWeeklyWeatherGlyph(weatherCode, weatherText);
  return `<img class="weekly-weather-image" src="${APP_BASE_URL}data/weekly-weather-icons/${code}.png" alt="" aria-hidden="true" decoding="async">`;
}
