export { JMA_WARNING_OFFICE_CODES } from "./jma/warningOfficeCodes.js";
export {
  EARTHQUAKE_INTENSITY_LEVELS,
  getEarthquakeIntensityColor,
  getEarthquakeIntensityLabel,
  getEarthquakeIntensityLevel,
  getEarthquakeIntensityRank,
  getEarthquakeIntensityTextClass
} from "./earthquakeIntensity.js";

export const APP_NAME = "MeteoScope";
export const APP_BASE_URL = import.meta.env?.BASE_URL ?? "/";
export const AUTO_REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const AUTO_REFRESH_RESUME_THROTTLE_MS = 60 * 1000;
export const EARTHQUAKE_REFRESH_INTERVAL_MS = 60 * 1000;
export const STATIC_DATA_CACHE_TTL_MS = 60 * 60 * 1000;
const EARTHQUAKE_API_BASE = String(
  import.meta.env?.VITE_EARTHQUAKE_API_BASE ||
  "/api/earthquakes"
).replace(/\/+$/, "");

function publicAsset(path) {
  return `${APP_BASE_URL}${path.replace(/^\/+/, "")}`;
}

export const MAP_DATA_ENDPOINTS = {
  jshisMajorFaultTiles: "https://www.j-shis.bosai.go.jp/map/xyz/major_fault/Y2022/MAX/{z}/{x}/{y}.mvt?lang=ja"
};

export const DMDATA_ENDPOINTS = {
  earthquakeHistory: `${EARTHQUAKE_API_BASE}/history`,
  earthquakeLatest: `${EARTHQUAKE_API_BASE}/latest`,
  earthquakeStations(eventId) {
    return `${EARTHQUAKE_API_BASE}/history/${encodeURIComponent(String(eventId ?? ""))}/stations`;
  }
};

export const DEFAULT_VIEW = {
  center: [37.6, 137.8],
  zoom: 5,
  minZoom: 3,
  maxZoom: 10
};

export const JMA_ENDPOINTS = {
  // NOTE: These are intentionally centralized so Codex can replace or extend them
  // after confirming current JMA data URLs and CORS behavior.
  radarTimeList: "https://www.jma.go.jp/bosai/jmatile/data/nowc/targetTimes_N1.json",
  radarTileBase: "https://www.jma.go.jp/bosai/jmatile/data/nowc",
  amedasTimeList: "https://www.jma.go.jp/bosai/amedas/data/latest_time.txt",
  warningsBase: "https://www.jma.go.jp/bosai/warning/data/r8",
  warningTimelineBase: "https://www.jma.go.jp/bosai/warning_timeline/data",
  probabilityMap: "https://www.jma.go.jp/bosai/probability/data/probability/r8/map.json",
  noWaveTide: "https://www.jma.go.jp/bosai/warning/const/no_wave_tide.json",
  kikikuruTimeList: "https://www.jma.go.jp/bosai/jmatile/data/risk/targetTimes.json",
  kikikuruTileBase: "https://www.jma.go.jp/bosai/jmatile/data/risk",
  weatherXmlFeed: "https://www.data.jma.go.jp/developer/xml/feed/regular.xml",
  weatherXmlLongFeed: "https://www.data.jma.go.jp/developer/xml/feed/regular_l.xml",
  riverFloodXmlFeed: "https://www.data.jma.go.jp/developer/xml/feed/extra.xml",
  riverFloodXmlLongFeed: "https://www.data.jma.go.jp/developer/xml/feed/extra_l.xml",
  riverFloodGeometry: "https://services.arcgis.com/wlVTGRSYTzAbjjiC/ArcGIS/rest/services/flood_risk_all/FeatureServer/0/query",
  areaConst: "https://www.jma.go.jp/bosai/common/const/area.json",
  warningMunicipalities: publicAsset("data/jma-weather-warning-municipalities.geojson"),
  prefectures: publicAsset("data/japan-prefectures.geojson"),
  earthquakeAreas: publicAsset("data/earthquake-areas.geojson"),
  tsunamiForecastAreas: publicAsset("data/jma-tsunami-forecast-areas.geojson"),
  earthquakeStations: publicAsset("data/jma-intensity-stations.json"),
  amedasStationTable: "https://www.jma.go.jp/bosai/amedas/const/amedastable.json",
  amedasMapBase: "https://www.jma.go.jp/bosai/amedas/data/map",
  amedasPointBase: "https://www.jma.go.jp/bosai/amedas/data/point",
  amedasDailyMaxTemperature: "https://www.data.jma.go.jp/stats/data/mdrr/tem_rct/alltable/mxtemsadext00_rct.csv",
  amedasDailyMinTemperature: "https://www.data.jma.go.jp/stats/data/mdrr/tem_rct/alltable/mntemsadext00_rct.csv",
  amedasDailyMaxWind: "https://www.data.jma.go.jp/stats/data/mdrr/wind_rct/alltable/mxwsp00_rct.csv",
  amedasDailyMaxGust: "https://www.data.jma.go.jp/stats/data/mdrr/wind_rct/alltable/gust00_rct.csv",
  amedasDailySurface: "https://www.data.jma.go.jp/stats/data/mdrr/synopday/data1s.html",
  typhoon: "https://www.jma.go.jp/bosai/typhoon/data/targetTc.json"
};

export const TABS = [
  {
    id: "radar",
    label: "雨雲レーダー",
    title: "",
    cardLabel: "降水強度",
    primary: "Radar",
    description: "気象庁の降水ナウキャストを地図上に重ねています。"
  },
  {
    id: "amedas",
    label: "アメダス",
    title: "",
    cardLabel: "気温",
    primary: "AMeDAS",
    description: "気温・降水量・風速・湿度・気圧・積雪量をアメダス観測地点マーカーで表示します。"
  },
  {
    id: "warnings",
    label: "警報・注意報",
    title: "",
    cardLabel: "警戒レベル",
    primary: "Warnings",
    description: "注意報・警報・危険警報・特別警報を市区町村ポリゴンに色分け表示します。"
  },
  {
    id: "typhoon",
    label: "台風情報",
    title: "台風情報",
    cardLabel: "台風",
    primary: "Typhoon",
    description: "台風の現在位置、進路、予報円、暴風警戒域を表示します。"
  },
  {
    id: "earthquake",
    label: "地震情報",
    title: "",
    cardLabel: "震源",
    primary: "Quake",
    description: "DM-D.S.S経由で取得した気象庁発表の地震・津波情報を表示します。"
  }
];

export const AMEDAS_METRICS = [
  { id: "temperature", label: "気温", primary: "Temp", unit: "℃", color: "#48c46b" },
  { id: "precipitation", label: "降水量", primary: "Rain", unit: "mm", color: "#56b7f2" },
  { id: "wind", label: "風速", primary: "Wind", unit: "m/s", color: "#f4d35e" },
  { id: "humidity", label: "湿度", primary: "Humidity", unit: "%", color: "#41b6c4" },
  { id: "pressure", label: "気圧", primary: "Pressure", unit: "hPa", color: "#7e57c2" },
  { id: "snow", label: "積雪量", primary: "Snow", unit: "cm", color: "#d8e6f7" }
];

export const AMEDAS_PRECIPITATION_LEVELS = [
  { min: 80, label: "80以上（猛烈な雨）", color: "#d4148e" },
  { min: 50, label: "50〜80（非常に激しい）", color: "#ff2b12" },
  { min: 30, label: "30〜50（激しい雨）", color: "#ff9900" },
  { min: 20, label: "20〜30（強い雨）", color: "#fff000" },
  { min: 10, label: "10〜20（やや強い）", color: "#0b22ff" },
  { min: 1, label: "1〜10", color: "#17a9f5" },
  { min: 0.1, label: "0.1〜1", color: "#a8d8ff" }
];

export const AMEDAS_TEMPERATURE_LEVELS = [
  { min: 40, label: "40以上（酷暑日）", color: "#d4148e" },
  { min: 35, label: "35〜40（猛暑日）", color: "#ff2b12" },
  { min: 30, label: "30〜35（真夏日）", color: "#ff4a12" },
  { min: 25, label: "25〜30（夏日）", color: "#ff9900" },
  { min: 20, label: "20〜25", color: "#fff000" },
  { min: 15, label: "15〜20", color: "#a8ff00" },
  { min: 10, label: "10〜15", color: "#00e86b" },
  { min: 5, label: "5〜10", color: "#16e7dc" },
  { min: 0, label: "0〜5", color: "#17a9f5" },
  { min: -5, label: "-5〜0", color: "#0b22ff" },
  { min: -Infinity, label: "-5未満", color: "#2510b8" }
];

export const AMEDAS_WIND_LEVELS = [
  { min: 30, label: "30m/s以上（猛烈な風）", color: "#d4148e" },
  { min: 25, label: "25〜30", color: "#ff2b12" },
  { min: 20, label: "20〜25（非常に強い）", color: "#ff9900" },
  { min: 15, label: "15〜20（強い風）", color: "#fff000" },
  { min: 10, label: "10〜15（やや強い）", color: "#00ff00" },
  { min: 5, label: "5〜10", color: "#16e7dc" },
  { min: 0, label: "5m/s未満", color: "#17a9f5" }
];

export const AMEDAS_SNOW_LEVELS = [
  { min: 200, label: "200cm以上", color: "#c9287a" },
  { min: 150, label: "150〜200cm", color: "#c7582e" },
  { min: 100, label: "100〜150cm", color: "#c58c36" },
  { min: 50, label: "50〜100cm", color: "#c2c957" },
  { min: 20, label: "20〜50cm", color: "#1834d6" },
  { min: 5, label: "5〜20cm", color: "#426fc8" },
  { min: 1, label: "1〜5cm", color: "#b7d5ea" }
];

export const AMEDAS_HUMIDITY_LEVELS = [
  { min: 90, label: "90%以上", color: "#253494" },
  { min: 80, label: "80〜90%", color: "#2c7fb8" },
  { min: 70, label: "70〜80%", color: "#41b6c4" },
  { min: 60, label: "60〜70%", color: "#7fcdbb" },
  { min: 50, label: "50〜60%", color: "#c7e9b4" },
  { min: 40, label: "40〜50%", color: "#ffff8c" },
  { min: 30, label: "30〜40%", color: "#fdae61" },
  { min: -Infinity, label: "30%未満", color: "#d73027" }
];

export const AMEDAS_PRESSURE_LEVELS = [
  { min: 1040, label: "1040hPa以上", color: "#5e35b1" },
  { min: 1030, label: "1030〜1040hPa", color: "#3949ab" },
  { min: 1020, label: "1020〜1030hPa", color: "#1e88e5" },
  { min: 1010, label: "1010〜1020hPa", color: "#26a69a" },
  { min: 1000, label: "1000〜1010hPa", color: "#9ccc65" },
  { min: 990, label: "990〜1000hPa", color: "#fdd835" },
  { min: 980, label: "980〜990hPa", color: "#fb8c00" },
  { min: -Infinity, label: "980hPa未満", color: "#e53935" }
];

export const AMEDAS_LEVELS_BY_METRIC = {
  temperature: AMEDAS_TEMPERATURE_LEVELS,
  precipitation: AMEDAS_PRECIPITATION_LEVELS,
  wind: AMEDAS_WIND_LEVELS,
  humidity: AMEDAS_HUMIDITY_LEVELS,
  pressure: AMEDAS_PRESSURE_LEVELS,
  snow: AMEDAS_SNOW_LEVELS
};

export function getAmedasObservationColor(metricId, value) {
  const levels = AMEDAS_LEVELS_BY_METRIC[metricId];
  if (!levels) return "#d8e6f7";
  if (metricId === "precipitation") {
    return levels.find((level) => value >= level.min)?.color ?? "#a8d8ff";
  }
  return interpolateAmedasLevelColor(levels, value);
}

function interpolateAmedasLevelColor(levels, value) {
  const stops = [...levels]
    .filter((level) => Number.isFinite(level.min))
    .sort((left, right) => left.min - right.min);

  if (!stops.length || !Number.isFinite(value)) return "#d8e6f7";
  if (value <= stops[0].min) return levels.at(-1).color;
  if (value >= stops.at(-1).min) return stops.at(-1).color;

  const upper = stops.find((level) => value <= level.min) ?? stops.at(-1);
  const lower = stops[Math.max(0, stops.indexOf(upper) - 1)];
  const ratio = (value - lower.min) / (upper.min - lower.min);
  return mixAmedasHexColor(lower.color, upper.color, ratio);
}

function mixAmedasHexColor(start, end, ratio) {
  const toRgb = (hex) => {
    const value = hex.replace("#", "");
    return [
      Number.parseInt(value.slice(0, 2), 16),
      Number.parseInt(value.slice(2, 4), 16),
      Number.parseInt(value.slice(4, 6), 16)
    ];
  };
  const startRgb = toRgb(start);
  const endRgb = toRgb(end);
  const amount = Math.max(0, Math.min(1, ratio));
  const mixed = startRgb.map((channel, index) => Math.round(channel + (endRgb[index] - channel) * amount));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

export const KIKIKURU_ELEMENTS = [
  { id: "land", label: "土砂キキクル", opacity: 0.86 },
  { id: "inund", label: "浸水キキクル", opacity: 0.78 }
];

export const KIKIKURU_LAYER_OPTIONS = [
  { id: "land", label: "土砂キキクル" },
  { id: "inund", label: "浸水キキクル" }
];

export const KIKIKURU_LEVELS = [
  { label: "災害切迫", color: "#111111" },
  { label: "危険", color: "#a000ff" },
  { label: "警戒", color: "#ff2b12" },
  { label: "注意", color: "#fff000" },
  { label: "今後の情報等に留意", color: "#ffffff" }
];
