import {
  UPPER_AIR_STATIONS,
  analyzeUpperAirProfile,
  buildMoistAdiabat,
  buildUpperAirProfile,
  formatJmaObservationTime,
  mergeUpperAirWinds,
  parseUpperAirTemperatureHumidityHtml,
  parseUpperAirWindHtml,
  summarizeUpperAirProfile,
  temperatureAlongDryAdiabat,
  temperatureForSaturationMixingRatio
} from "../jma/upperAir.js";
import maplibregl from "maplibre-gl";
import { getEarlyAccessToken } from "./earlyAccess.js";
import { buildModalLoadingState } from "./modalLoadingState.js";

const SVG_NS = "http://www.w3.org/2000/svg";
const UPPER_AIR_NOTES_KEY = "meteoscope-upper-air-analysis-notes-v1";
let initialized = false;
let options = {};
let requestId = 0;
let selectedStationId = "47646";
let selectedMode = "observation";
let selectedModelCoordinates = { latitude: 35.75, longitude: 139.75 };
let modelOutput = null;
let modelMap = null;
let modelMarker = null;

function createElement(name, attributes = {}) {
  const element = document.createElementNS(SVG_NS, name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
  return element;
}

function pressureToY(pressure, { top, height }) {
  return top + (Math.log(pressure) - Math.log(100)) / (Math.log(1000) - Math.log(100)) * height;
}

function temperatureToX(temperature, { left, width }) {
  return left + ((temperature + 90) / 140) * width;
}

function appendPath(svg, points, attributes) {
  if (points.length < 2) return;
  const path = createElement("path", {
    d: points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" "),
    fill: "none",
    ...attributes
  });
  svg.append(path);
}

export function buildEmagramSvg(profile) {
  const width = 740;
  const height = 530;
  const plot = { left: 62, top: 22, width: 640, height: 452 };
  const svg = createElement("svg", {
    class: "upper-air-emagram",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "気温を赤、露点温度を青緑で示した高層気象観測のエマグラム"
  });

  svg.append(createElement("rect", { x: plot.left, y: plot.top, width: plot.width, height: plot.height, class: "upper-air-emagram-frame" }));
  [1000, 925, 850, 700, 500, 400, 300, 200, 100].forEach((pressure) => {
    const y = pressureToY(pressure, plot);
    svg.append(createElement("line", { x1: plot.left, y1: y, x2: plot.left + plot.width, y2: y, class: "upper-air-emagram-isobar" }));
    const label = createElement("text", { x: plot.left - 10, y: y + 4, class: "upper-air-emagram-axis-label", "text-anchor": "end" });
    label.textContent = pressure;
    svg.append(label);
  });
  for (let temperature = -80; temperature <= 40; temperature += 10) {
    const x = temperatureToX(temperature, plot);
    svg.append(createElement("line", { x1: x, y1: plot.top, x2: x, y2: plot.top + plot.height, class: "upper-air-emagram-isotherm" }));
    const label = createElement("text", { x, y: plot.top + plot.height + 21, class: "upper-air-emagram-axis-label", "text-anchor": "middle" });
    label.textContent = temperature;
    svg.append(label);
  }
  const definitions = createElement("defs");
  const clipPath = createElement("clipPath", { id: "upper-air-emagram-plot" });
  clipPath.append(createElement("rect", { x: plot.left, y: plot.top, width: plot.width, height: plot.height }));
  definitions.append(clipPath);
  svg.append(definitions);
  const curves = createElement("g", { "clip-path": "url(#upper-air-emagram-plot)" });
  svg.append(curves);
  for (let potentialTemperature = 0; potentialTemperature <= 60; potentialTemperature += 10) {
    const points = [];
    for (let pressure = 1000; pressure >= 100; pressure -= 1) {
      const temperature = temperatureAlongDryAdiabat(potentialTemperature, pressure);
      points.push({ x: temperatureToX(temperature, plot), y: pressureToY(pressure, plot) });
    }
    appendPath(curves, points, { class: "upper-air-emagram-dry-adiabat" });
  }
  [0.4, 1, 2, 4, 7, 10, 16, 24].forEach((mixingRatio) => {
    const points = [];
    for (let pressure = 1000; pressure >= 100; pressure -= 1) {
      const temperature = temperatureForSaturationMixingRatio(mixingRatio, pressure);
      if (Number.isFinite(temperature)) points.push({ x: temperatureToX(temperature, plot), y: pressureToY(pressure, plot) });
    }
    appendPath(curves, points, { class: "upper-air-emagram-mixing-ratio" });
  });
  [-30, -20, -10, 0, 10, 20, 30, 40].forEach((temperature) => {
    const points = buildMoistAdiabat(temperature, { step: 1 }).map((row) => ({
      x: temperatureToX(row.temperature, plot),
      y: pressureToY(row.pressure, plot)
    }));
    appendPath(curves, points, { class: "upper-air-emagram-moist-adiabat" });
  });
  const temperaturePoints = profile.map((row) => ({ x: temperatureToX(row.temperature, plot), y: pressureToY(row.pressure, plot) }));
  const dewPointPoints = profile.filter((row) => Number.isFinite(row.dewPoint)).map((row) => ({ x: temperatureToX(row.dewPoint, plot), y: pressureToY(row.pressure, plot) }));
  appendPath(curves, temperaturePoints, { class: "upper-air-emagram-temperature" });
  appendPath(curves, dewPointPoints, { class: "upper-air-emagram-dewpoint" });
  profile.forEach((row) => {
    const point = createElement("circle", {
      cx: temperatureToX(row.temperature, plot),
      cy: pressureToY(row.pressure, plot),
      r: 7,
      class: "upper-air-emagram-point",
      "data-profile-pressure": row.pressure,
      role: "button",
      tabindex: 0,
      "aria-label": `${Math.round(row.pressure)}ヘクトパスカルの気温・露点`
    });
    curves.append(point);
  });
  const xLabel = createElement("text", { x: plot.left + plot.width / 2, y: height - 8, class: "upper-air-emagram-axis-title", "text-anchor": "middle" });
  xLabel.textContent = "気温（℃）";
  svg.append(xLabel);
  const yLabel = createElement("text", { x: 16, y: plot.top + plot.height / 2, class: "upper-air-emagram-axis-title", transform: `rotate(-90 16 ${plot.top + plot.height / 2})`, "text-anchor": "middle" });
  yLabel.textContent = "気圧（hPa）";
  svg.append(yLabel);
  return svg;
}

function makeStat(label, value, unit = "") {
  const stat = document.createElement("div");
  stat.className = "upper-air-stat";
  const statLabel = document.createElement("span");
  statLabel.textContent = label;
  const statValue = document.createElement("strong");
  statValue.textContent = value ?? "—";
  if (unit) {
    const statUnit = document.createElement("small");
    statUnit.textContent = unit;
    statValue.append(" ", statUnit);
  }
  stat.append(statLabel, statValue);
  return stat;
}

function formatTemperature(value) {
  return Number.isFinite(value) ? value.toFixed(1) : null;
}

function formatHeight(value) {
  return Number.isFinite(value) ? `${Math.round(value).toLocaleString("ja-JP")} m` : "--";
}

function formatWindDirection(value) {
  if (!Number.isFinite(value)) return "—";
  return ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東", "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"][Math.round(value / 22.5) % 16];
}

function getStoredAnalysisNotes() {
  try {
    const parsed = JSON.parse(localStorage.getItem(UPPER_AIR_NOTES_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((note) => note && typeof note.id === "string") : [];
  } catch {
    return [];
  }
}

function createProfileIdentity({ source, station, date, hour, coordinates, cycle }) {
  if (source === "observation") return `${source}:${station}:${date}:${hour}`;
  return `${source}:${coordinates.latitude.toFixed(2)}:${coordinates.longitude.toFixed(2)}:${cycle?.date ?? ""}:${cycle?.hour ?? ""}`;
}

function buildHodographSvg(profile) {
  const width = 360;
  const height = 300;
  const plot = { left: 42, top: 20, width: 278, height: 238 };
  const center = { x: plot.left + plot.width / 2, y: plot.top + plot.height / 2 };
  const windRows = profile.filter((row) => Number.isFinite(row.uWind) && Number.isFinite(row.vWind));
  const maxComponent = Math.max(10, ...windRows.flatMap((row) => [Math.abs(row.uWind), Math.abs(row.vWind)]));
  const range = Math.ceil(maxComponent / 10) * 10;
  const scale = Math.min(plot.width, plot.height) / (2 * range);
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("class", "upper-air-hodograph");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "風の東西・南北成分を高度別に示すホドグラフ。点を選ぶとエマグラムの気圧面と連動します。");
  const createSvg = (name, attributes) => {
    const element = document.createElementNS(SVG_NS, name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  };
  svg.append(createSvg("rect", { x: plot.left, y: plot.top, width: plot.width, height: plot.height, class: "upper-air-hodograph-frame" }));
  for (let speed = 5; speed <= range; speed += 5) {
    const radius = speed * scale;
    svg.append(createSvg("circle", { cx: center.x, cy: center.y, r: radius, class: "upper-air-hodograph-ring" }));
    if (speed % 10 === 0 || speed === range) {
      const label = createSvg("text", { x: center.x + 3, y: center.y - radius + 12, class: "upper-air-hodograph-label" });
      label.textContent = `${speed}`;
      svg.append(label);
    }
  }
  svg.append(createSvg("line", { x1: plot.left, y1: center.y, x2: plot.left + plot.width, y2: center.y, class: "upper-air-hodograph-axis" }));
  svg.append(createSvg("line", { x1: center.x, y1: plot.top, x2: center.x, y2: plot.top + plot.height, class: "upper-air-hodograph-axis" }));
  const points = windRows.map((row) => ({
    row,
    x: center.x + row.uWind * scale,
    y: center.y - row.vWind * scale
  }));
  if (points.length > 1) {
    const path = createSvg("path", {
      d: points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" "),
      class: "upper-air-hodograph-track"
    });
    svg.append(path);
  }
  points.forEach(({ row, x, y }) => {
    const point = createSvg("circle", {
      cx: x,
      cy: y,
      r: 5,
      class: "upper-air-hodograph-point",
      "data-profile-pressure": row.pressure,
      role: "button",
      tabindex: 0,
      "aria-label": `${Math.round(row.pressure)}ヘクトパスカル、高度${Math.round(row.height)}メートルの風`
    });
    svg.append(point);
  });
  const labels = [
    ["−U 西向き", plot.left, height - 12, "start"],
    ["U 東向き", plot.left + plot.width, height - 12, "end"],
    ["V 北向き", center.x, 13, "middle"]
  ];
  labels.forEach(([text, x, y, anchor]) => {
    const label = createSvg("text", { x, y, "text-anchor": anchor, class: "upper-air-hodograph-axis-title" });
    label.textContent = text;
    svg.append(label);
  });
  if (!points.length) {
    const empty = createSvg("text", { x: center.x, y: center.y, "text-anchor": "middle", class: "upper-air-hodograph-empty" });
    empty.textContent = "風データなし";
    svg.append(empty);
  }
  return svg;
}

function buildAnalysisWorkspace(profile, identity, { windAvailable, sourceName }) {
  const workspace = document.createElement("section");
  workspace.className = "upper-air-analysis-workspace";
  workspace.setAttribute("aria-label", "同期高層解析ワークスペース");
  const heading = document.createElement("div");
  heading.className = "upper-air-workspace-heading";
  const title = document.createElement("h3");
  title.textContent = "同期解析";
  const help = document.createElement("p");
  help.textContent = windAvailable
    ? `${sourceName}の同一プロファイルから表示。気圧面を選ぶとエマグラムと風 hodograph の選択が連動します。`
    : `${sourceName}の気温・湿度を表示中です。風データがないため hodograph は利用できません。`;
  heading.append(title, help);
  const grid = document.createElement("div");
  grid.className = "upper-air-workspace-grid";
  const emagramPanel = document.createElement("section");
  emagramPanel.className = "upper-air-workspace-panel";
  const emagramTitle = document.createElement("h4");
  emagramTitle.textContent = "気温・露点（エマグラム）";
  const emagramWrap = document.createElement("div");
  emagramWrap.className = "upper-air-chart-wrap upper-air-workspace-emagram";
  emagramWrap.append(buildEmagramSvg(profile));
  emagramPanel.append(emagramTitle, emagramWrap);
  const windPanel = document.createElement("section");
  windPanel.className = "upper-air-workspace-panel";
  const windTitle = document.createElement("h4");
  windTitle.textContent = "風の鉛直変化（hodograph）";
  const windWrap = document.createElement("div");
  windWrap.className = "upper-air-hodograph-wrap";
  windWrap.append(buildHodographSvg(profile));
  windPanel.append(windTitle, windWrap);
  grid.append(emagramPanel, windPanel);

  const cursor = document.createElement("p");
  cursor.className = "upper-air-workspace-cursor";
  cursor.setAttribute("aria-live", "polite");
  cursor.setAttribute("aria-label", "選択中の気圧面の観測値");
  const notes = document.createElement("section");
  notes.className = "upper-air-annotation-panel";
  const notesHeading = document.createElement("div");
  notesHeading.className = "upper-air-annotation-heading";
  const notesTitle = document.createElement("h4");
  notesTitle.textContent = "解析メモ";
  const noteHelp = document.createElement("p");
  noteHelp.textContent = "選択中の気圧面に紐づけてこの端末に保存します。";
  notesHeading.append(notesTitle, noteHelp);
  const textarea = document.createElement("textarea");
  textarea.className = "upper-air-annotation-input";
  textarea.maxLength = 500;
  textarea.rows = 3;
  textarea.placeholder = "例：850 hPaの湿潤層と南西風の強まりに注目";
  const actions = document.createElement("div");
  actions.className = "upper-air-annotation-actions";
  const save = document.createElement("button");
  save.type = "button";
  save.textContent = "選択層に注釈を保存";
  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.textContent = "メモを書き出す";
  const status = document.createElement("span");
  status.className = "upper-air-annotation-status";
  actions.append(save, exportButton, status);
  const list = document.createElement("div");
  list.className = "upper-air-annotation-list";
  notes.append(notesHeading, textarea, actions, list);
  workspace.append(heading, grid, cursor, notes);

  let selectedRow = profile[0] ?? null;
  const syncSelection = (pressure) => {
    const row = profile.find((entry) => entry.pressure === pressure);
    if (!row) return;
    selectedRow = row;
    workspace.querySelectorAll("[data-profile-pressure]").forEach((point) => {
      const selected = Number(point.getAttribute("data-profile-pressure")) === pressure;
      point.classList.toggle("is-selected", selected);
      point.setAttribute("aria-pressed", String(selected));
    });
    const readings = [
      ["気圧", `${Math.round(row.pressure)} hPa`],
      ["高度", formatHeight(row.height)],
      ["気温", `${formatTemperature(row.temperature)}℃`],
      ["露点", `${formatTemperature(row.dewPoint) ?? "—"}℃`],
      ["風", Number.isFinite(row.windSpeed) ? `${formatWindDirection(row.windDirection)} ${row.windSpeed.toFixed(1)} m/s` : "—"]
    ];
    cursor.replaceChildren(...readings.map(([label, value]) => {
      const item = document.createElement("span");
      item.className = "upper-air-workspace-reading";
      const term = document.createElement("span");
      term.textContent = label;
      const reading = document.createElement("strong");
      reading.textContent = value;
      item.append(term, reading);
      return item;
    }));
  };
  workspace.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const point = event.target.closest("[data-profile-pressure]");
    if (point) syncSelection(Number(point.getAttribute("data-profile-pressure")));
  });
  workspace.addEventListener("keydown", (event) => {
    if (!(event.target instanceof Element) || !event.target.matches("[data-profile-pressure]") || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    syncSelection(Number(event.target.getAttribute("data-profile-pressure")));
  });
  if (selectedRow) syncSelection(selectedRow.pressure);

  const renderNotes = () => {
    const savedNotes = getStoredAnalysisNotes().filter((note) => note.identity === identity);
    list.replaceChildren();
    if (!savedNotes.length) {
      const empty = document.createElement("p");
      empty.className = "upper-air-annotation-empty";
      empty.textContent = "この観測の保存メモはありません。";
      list.append(empty);
      exportButton.disabled = true;
      return;
    }
    exportButton.disabled = false;
    savedNotes.slice().reverse().forEach((note) => {
      const item = document.createElement("article");
      item.className = "upper-air-annotation-item";
      const meta = document.createElement("small");
      meta.textContent = `${note.pressure} hPa ・ ${note.height} m ・ ${note.savedAt}`;
      const text = document.createElement("p");
      text.textContent = note.text;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.textContent = "削除";
      remove.setAttribute("aria-label", `${note.pressure} hPaの注釈を削除`);
      remove.addEventListener("click", () => {
        const current = getStoredAnalysisNotes();
        try {
          localStorage.setItem(UPPER_AIR_NOTES_KEY, JSON.stringify(current.filter((entry) => entry.id !== note.id)));
          status.textContent = "注釈を削除しました";
          renderNotes();
        } catch {
          status.textContent = "保存データを更新できませんでした";
        }
      });
      item.append(meta, text, remove);
      list.append(item);
    });
  };

  save.addEventListener("click", () => {
    const text = textarea.value.trim();
    if (!text || !selectedRow) {
      status.textContent = "注釈と気圧面を選択してください";
      return;
    }
    const current = getStoredAnalysisNotes();
    const note = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      identity,
      pressure: Math.round(selectedRow.pressure),
      height: Math.round(selectedRow.height),
      temperature: Number.isFinite(selectedRow.temperature) ? Number(selectedRow.temperature.toFixed(1)) : null,
      dewPoint: Number.isFinite(selectedRow.dewPoint) ? Number(selectedRow.dewPoint.toFixed(1)) : null,
      windSpeed: Number.isFinite(selectedRow.windSpeed) ? Number(selectedRow.windSpeed.toFixed(1)) : null,
      text,
      savedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(UPPER_AIR_NOTES_KEY, JSON.stringify([...current, note].slice(-200)));
      textarea.value = "";
      status.textContent = "この端末に保存しました";
      renderNotes();
    } catch {
      status.textContent = "端末の保存領域が利用できません";
    }
  });
  exportButton.addEventListener("click", () => {
    const savedNotes = getStoredAnalysisNotes().filter((note) => note.identity === identity);
    if (!savedNotes.length) return;
    const blob = new Blob([JSON.stringify({ identity, exportedAt: new Date().toISOString(), notes: savedNotes }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "meteoscope-upper-air-notes.json";
    link.click();
    URL.revokeObjectURL(url);
  });
  renderNotes();
  return workspace;
}

function createInsight(title, value, description) {
  const item = document.createElement("article");
  item.className = "upper-air-insight";
  const heading = document.createElement("div");
  const label = document.createElement("span");
  label.textContent = title;
  const reading = document.createElement("strong");
  reading.textContent = value;
  heading.append(label, reading);
  const detail = document.createElement("p");
  detail.textContent = description;
  item.append(heading, detail);
  return item;
}

function buildObservationInsights(analysis, { isModel = false } = {}) {
  const section = document.createElement("section");
  section.className = "upper-air-insights";
  section.setAttribute("aria-label", "このエマグラムから読み取れること");
  const heading = document.createElement("div");
  heading.className = "upper-air-insights-heading";
  const title = document.createElement("h3");
  title.textContent = isModel ? "このモデルから読み取れること" : "この観測から読み取れること";
  const caption = document.createElement("p");
  caption.textContent = isModel
    ? "GFSの格子点予報に基づく目安です。地点の実況・警報の判断には使用しません。"
    : "観測時点の鉛直分布に基づく目安です。予報や警報の判断には使用しません。";
  heading.append(title, caption);
  const grid = document.createElement("div");
  grid.className = "upper-air-insight-grid";

  const surfaceHumidity = Number.isFinite(analysis.surface.humidity)
    ? `相対湿度 ${Math.round(analysis.surface.humidity)}%`
    : "湿度は欠測";
  const surfaceSpread = Number.isFinite(analysis.surfaceDewPointDepression)
    ? `露点差 ${analysis.surfaceDewPointDepression.toFixed(1)}℃`
    : "露点温度は欠測";
  grid.append(createInsight(
    "地上付近の湿り",
    surfaceHumidity,
    `地上気温 ${formatTemperature(analysis.surface.temperature)}℃、${surfaceSpread}です。露点差が小さいほど、地上付近の空気は湿っています。`
  ));

  const cloudBase = Number.isFinite(analysis.estimatedCloudBase)
    ? `約 ${formatHeight(analysis.estimatedCloudBase)}`
    : "算出できません";
  grid.append(createInsight(
    "雲底の目安（LCL）",
    cloudBase,
    Number.isFinite(analysis.estimatedCloudBase)
      ? "地上気温と露点温度から求めた簡易的な持ち上げ凝結高度です。雲の実際の底の高さとは一致しない場合があります。"
      : "地上の露点温度が不足しているため、目安を算出できません。"
  ));

  const lapseRate = Number.isFinite(analysis.lapseRate)
    ? `${analysis.lapseRate.toFixed(1)} ℃/km`
    : "算出できません";
  const lapseDescription = !Number.isFinite(analysis.lapseRate)
    ? "地上または500 hPaの観測値が不足しているため、平均気温減率を算出できません。"
    : analysis.lapseRate >= 6.5
      ? "地上から500 hPaまで、気温は高さとともに比較的急に下がっています。対流の発達しやすさをみるための基礎指標です。"
      : analysis.lapseRate <= 4
        ? "地上から500 hPaまでの気温の下がり方は緩やかです。鉛直方向の混合は起こりにくい傾向を示します。"
        : "地上から500 hPaまでの平均的な気温の下がり方です。周辺の湿りや風とあわせて確認します。";
  grid.append(createInsight("地上〜500 hPaの気温減率", lapseRate, lapseDescription));

  const upperMoisture = Number.isFinite(analysis.dewPointDepression850)
    ? `露点差 ${analysis.dewPointDepression850.toFixed(1)}℃`
    : "算出できません";
  grid.append(createInsight(
    "850 hPa付近の湿り",
    upperMoisture,
    Number.isFinite(analysis.dewPointDepression850)
      ? `約 ${formatHeight(analysis.at850?.height)} の湿りの目安です。露点差が小さいほど、この高度で飽和に近い状態を示します。`
      : "850 hPa付近の露点温度が不足しているため、湿りを数値化できません。"
  ));

  const freezing = Number.isFinite(analysis.freezingHeight)
    ? formatHeight(analysis.freezingHeight)
    : "算出できません";
  grid.append(createInsight(
    "0℃高度",
    freezing,
    Number.isFinite(analysis.freezingHeight)
      ? "気温が0℃を横切る高度です。降水の相変化を考える際の参考値で、地上の降水種は下層の気温分布にも左右されます。"
      : "観測範囲内に0℃を横切る層がないか、観測値が不足しています。"
  ));

  const inversion = analysis.inversion;
  grid.append(createInsight(
    "下層の逆転層",
    inversion ? `約 ${formatHeight(inversion.baseHeight)}〜${formatHeight(inversion.topHeight)}` : "明瞭な逆転層なし",
    inversion
      ? `この層では高度とともに気温が ${inversion.temperatureChange.toFixed(1)}℃ 上がっています。霧・低い雲・煙霧などをみる際の一材料になります。`
      : "今回の観測の隣り合う層では、0.5℃以上の明瞭な昇温層を検出していません。"
  ));

  const indexValue = (value) => Number.isFinite(value) ? `${value.toFixed(1)}℃` : "算出できません";
  grid.append(createInsight(
    "K指数",
    indexValue(analysis.kIndex),
    Number.isFinite(analysis.kIndex)
      ? "850・700・500 hPaの気温と850・700 hPaの露点温度から算出した対流性降水の目安です。単独で雷雨の有無を判断する指数ではありません。"
      : "850・700・500 hPaの気温または下層の露点温度が不足しています。"
  ));
  grid.append(createInsight(
    "Total Totals",
    indexValue(analysis.totalTotalsIndex),
    "850 hPaの気温・露点温度と500 hPaの気温による経験指数です。地域・季節の背景場と合わせて読みます。"
  ));
  grid.append(createInsight(
    "Showalter / Lifted Index",
    `${indexValue(analysis.showalterIndex)} / ${indexValue(analysis.liftedIndex)}`,
    "850 hPaまたは地上から持ち上げた簡易 parcel と500 hPa環境気温の差です。正確なCAPE/CIN解析の代替ではありません。"
  ));
  const windMaximum = Number.isFinite(analysis.strongestWindSpeed)
    ? `${analysis.strongestWindSpeed.toFixed(1)} m/s ・ ${formatHeight(analysis.strongestWindHeight)}`
    : "風データなし";
  const shearValue = (value) => Number.isFinite(value) ? `${value.toFixed(1)} m/s` : "算出できません";
  grid.append(createInsight(
    "最大風速（プロファイル内）",
    windMaximum,
    "高層プロファイルに含まれる最大の風速です。ジェット気流の診断には周辺の高度・気圧面分布も確認してください。"
  ));
  grid.append(createInsight(
    "鉛直風 shear（0–1 / 0–6 km）",
    `${shearValue(analysis.windShear0to1km)} / ${shearValue(analysis.windShear0to6km)}`,
    "地上付近から指定深度までの風ベクトル差です。高度間に大きな欠測がある場合は計算しません。"
  ));
  grid.append(createInsight(
    "地上 parcel CAPE / CIN",
    `${Number.isFinite(analysis.cape) ? Math.round(analysis.cape) : "—"} / ${Number.isFinite(analysis.cin) ? Math.round(analysis.cin) : "—"} J/kg`,
    "観測プロファイルと簡易な地上 parcel を使った参考積算です。湿度欠測・観測間隔・混合層の扱いに制約があり、予報や警報の判断には使えません。"
  ));

  const coverage = Number.isFinite(analysis.topPressure) && Number.isFinite(analysis.topHeight)
    ? `${analysis.observedLevelCount}層・${Math.round(analysis.topPressure)} hPaまで`
    : `${analysis.observedLevelCount}層`;
  grid.append(createInsight(
    "観測範囲",
    coverage,
    Number.isFinite(analysis.topHeight)
      ? `地上付近から約 ${formatHeight(analysis.topHeight)} までの観測をエマグラムに表示しています。欠測層は線で補間していません。`
      : "利用できる観測層をエマグラムに表示しています。"
  ));

  section.append(heading, grid);
  return section;
}

function formatCoordinates({ latitude, longitude }) {
  const displayLongitude = longitude > 180 ? longitude - 360 : longitude;
  return `${latitude.toFixed(2)}°N / ${displayLongitude.toFixed(2)}°E`;
}

function buildModeSwitch(body) {
  const switcher = document.createElement("div");
  switcher.className = "upper-air-mode-switch";
  switcher.setAttribute("role", "tablist");
  const modes = [
    ["observation", "高層観測"],
    ["model", "GFS地点モデル"]
  ];
  modes.forEach(([mode, label]) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.classList.toggle("is-active", selectedMode === mode);
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(selectedMode === mode));
    button.addEventListener("click", () => {
      if (selectedMode === mode) return;
      selectedMode = mode;
      if (mode === "model") void loadModelProfile();
      else void loadObservation();
    });
    switcher.append(button);
  });
  const content = document.createElement("div");
  content.className = "upper-air-mode-content";
  body.replaceChildren(switcher, content);
  return content;
}

const MODEL_MAP_BOUNDS = [[122, 23], [150, 48]];

function snapToGfsGrid({ lat, lng }) {
  return {
    latitude: Math.round(Math.max(23, Math.min(48, lat)) * 4) / 4,
    longitude: Math.round(Math.max(122, Math.min(150, lng)) * 4) / 4
  };
}

function disposeModelMap() {
  modelMarker?.remove();
  modelMarker = null;
  modelMap?.remove();
  modelMap = null;
}

function updateModelCoordinateLabel() {
  document.querySelector(".upper-air-model-coordinate")?.replaceChildren(`選択地点 ${formatCoordinates(selectedModelCoordinates)}`);
}

function buildModelMap() {
  const section = document.createElement("section");
  section.className = "upper-air-model-map";
  section.setAttribute("aria-label", "GFS地点選択用の日本周辺地図");
  const hint = document.createElement("p");
  hint.textContent = "タップで地点を選択します。ドラッグ・ピンチ・ダブルタップで、メイン地図と同じように操作できます。最寄りのGFS 0.25°格子を使用します。";
  const canvas = document.createElement("div");
  canvas.className = "upper-air-model-map-canvas";
  canvas.setAttribute("aria-label", "日本周辺の地点選択地図");
  section.append(hint, canvas);
  requestAnimationFrame(() => initializeModelMap(canvas));
  return section;
}

function initializeModelMap(canvas) {
  if (!canvas.isConnected) return;
  disposeModelMap();
  modelMap = new maplibregl.Map({
    container: canvas,
    style: {
      version: 8,
      sources: {
        japan: { type: "geojson", data: "/data/japan-prefectures-map.geojson" }
      },
      layers: [
        { id: "background", type: "background", paint: { "background-color": "#102944" } },
        { id: "japan-fill", type: "fill", source: "japan", paint: { "fill-color": "#5d7994", "fill-opacity": 0.94 } },
        { id: "japan-outline", type: "line", source: "japan", paint: { "line-color": "#d8eaf7", "line-width": 1.1 } }
      ]
    },
    bounds: MODEL_MAP_BOUNDS,
    fitBoundsOptions: { padding: 22 },
    maxBounds: [[115, 18], [157, 53]],
    minZoom: 3,
    maxZoom: 10,
    dragRotate: true,
    pitchWithRotate: false,
    touchPitch: false,
    attributionControl: false,
    localIdeographFontFamily: '"Noto Sans JP", sans-serif'
  });
  modelMap.touchZoomRotate.enableRotation();
  modelMap.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
  modelMap.on("load", () => {
    modelMap?.fitBounds(MODEL_MAP_BOUNDS, { padding: 22, duration: 0 });
    modelMarker = new maplibregl.Marker({ color: "#52d2f6" })
      .setLngLat([selectedModelCoordinates.longitude, selectedModelCoordinates.latitude])
      .addTo(modelMap);
  });
  modelMap.on("click", (event) => {
    selectedModelCoordinates = snapToGfsGrid(event.lngLat);
    modelMarker?.setLngLat([selectedModelCoordinates.longitude, selectedModelCoordinates.latitude]);
    updateModelCoordinateLabel();
    void loadModelProfile({ preserveMap: true });
  });
}

function buildModelPicker(content) {
  const coordinate = document.createElement("p");
  coordinate.className = "upper-air-model-coordinate";
  coordinate.textContent = `選択地点 ${formatCoordinates(selectedModelCoordinates)}`;
  content.append(coordinate, buildModelMap());
}

function renderObservation(output, observation) {
  const rows = mergeUpperAirWinds(
    parseUpperAirTemperatureHumidityHtml(observation.html),
    parseUpperAirWindHtml(observation.windHtml)
  );
  const profile = buildUpperAirProfile(rows);
  if (profile.length < 8) {
    renderError(output, "気温・湿度の観測データを十分に取得できませんでした。別の地点または次回の観測をお試しください。");
    return;
  }
  const station = UPPER_AIR_STATIONS.find((entry) => entry.id === observation.station);
  const summary = summarizeUpperAirProfile(profile);
  const analysis = analyzeUpperAirProfile(profile);
  const heading = document.createElement("div");
  heading.className = "upper-air-observation-heading";
  const title = document.createElement("div");
  const stationName = document.createElement("strong");
  stationName.textContent = station?.name ?? "観測地点";
  const time = document.createElement("time");
  time.textContent = formatJmaObservationTime(observation.date, observation.hour);
  title.append(stationName, time);
  const source = document.createElement("a");
  source.href = observation.sourceUrl;
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.textContent = "気象庁の元データ ↗";
  heading.append(title, source);

  const legend = document.createElement("div");
  legend.className = "upper-air-chart-legend";
  legend.innerHTML = '<span class="upper-air-chart-legend-temperature">気温</span><span class="upper-air-chart-legend-dewpoint">露点温度</span><span class="upper-air-chart-legend-dry">乾燥断熱線</span><span class="upper-air-chart-legend-moist">湿潤断熱線</span><span class="upper-air-chart-legend-mixing">飽和混合比線</span><span class="upper-air-chart-legend-wind">風の層選択</span>';
  const workspace = buildAnalysisWorkspace(profile, createProfileIdentity({
    source: "observation",
    station: observation.station,
    date: observation.date,
    hour: observation.hour
  }), { windAvailable: profile.some((row) => Number.isFinite(row.windSpeed)), sourceName: "気象庁の高層観測" });

  const stats = document.createElement("section");
  stats.className = "upper-air-stats";
  stats.setAttribute("aria-label", "代表的な観測値");
  stats.append(
    makeStat("地上気温", formatTemperature(summary?.surface.temperature), "℃"),
    makeStat("850 hPa", formatTemperature(summary?.at850?.temperature), "℃"),
    makeStat("500 hPa", formatTemperature(summary?.at500?.temperature), "℃"),
    makeStat("0℃高度", Number.isFinite(summary?.freezingHeight) ? Math.round(summary.freezingHeight).toLocaleString("ja-JP") : null, "m")
  );

  const note = document.createElement("p");
  note.className = "upper-air-note";
  note.textContent = "気温・相対湿度から露点温度を算出し、気象庁の風観測を気圧で対応づけています。風の観測層が異なる場合はベクトルを対数気圧で補間します。背景の断熱線・飽和混合比線は計算値です。各診断は解析補助で、危険度の判定や予報ではありません。";
  output.replaceChildren(heading, legend, workspace, stats, buildObservationInsights(analysis), note);
}

function renderModelProfile(output, model) {
  const profile = buildUpperAirProfile(model.rows);
  if (profile.length < 8) {
    renderModelError(output, "選択地点のGFS気圧面データを十分に取得できませんでした。別の地点または時間をおいて再度お試しください。");
    return;
  }
  const summary = summarizeUpperAirProfile(profile);
  const analysis = analyzeUpperAirProfile(profile);
  const heading = document.createElement("div");
  heading.className = "upper-air-observation-heading";
  const title = document.createElement("div");
  const place = document.createElement("strong");
  place.textContent = `地点モデル ${formatCoordinates(model.coordinates)}`;
  const time = document.createElement("time");
  const cycleDate = /^\d{8}$/u.test(model.cycle?.date ?? "")
    ? `${model.cycle.date.slice(0, 4)}年${Number(model.cycle.date.slice(4, 6))}月${Number(model.cycle.date.slice(6, 8))}日`
    : "初期時刻を確認中";
  time.textContent = /^\d{2}$/u.test(model.cycle?.hour ?? "")
    ? `${cycleDate} ${model.cycle.hour}時初期値・解析時刻（UTC）`
    : cycleDate;
  title.append(place, time);
  const source = document.createElement("a");
  source.href = model.sourceUrl;
  source.target = "_blank";
  source.rel = "noopener noreferrer";
  source.textContent = "NOAA GFSの元データ ↗";
  heading.append(title, source);

  const legend = document.createElement("div");
  legend.className = "upper-air-chart-legend";
  legend.innerHTML = '<span class="upper-air-chart-legend-temperature">気温</span><span class="upper-air-chart-legend-dewpoint">露点温度</span><span class="upper-air-chart-legend-dry">乾燥断熱線</span><span class="upper-air-chart-legend-moist">湿潤断熱線</span><span class="upper-air-chart-legend-mixing">飽和混合比線</span><span class="upper-air-chart-legend-wind">風の層選択</span>';
  const workspace = buildAnalysisWorkspace(profile, createProfileIdentity({
    source: "gfs",
    coordinates: model.coordinates,
    cycle: model.cycle
  }), { windAvailable: profile.some((row) => Number.isFinite(row.windSpeed)), sourceName: "NOAA GFS地点モデル" });

  const stats = document.createElement("section");
  stats.className = "upper-air-stats";
  stats.setAttribute("aria-label", "代表的なGFS予報値");
  stats.append(
    makeStat("地上付近", formatTemperature(summary?.surface.temperature), "℃"),
    makeStat("850 hPa", formatTemperature(summary?.at850?.temperature), "℃"),
    makeStat("500 hPa", formatTemperature(summary?.at500?.temperature), "℃"),
    makeStat("0℃高度", Number.isFinite(summary?.freezingHeight) ? Math.round(summary.freezingHeight).toLocaleString("ja-JP") : null, "m")
  );
  const note = document.createElement("p");
  note.className = "upper-air-note";
  note.textContent = "NOAA GFS 0.25°の最寄り格子点における解析時刻の数値モデルです。気温・相対湿度から露点温度を算出して表示しています。地点の実測値ではありません。";
  output.replaceChildren(heading, legend, workspace, stats, buildObservationInsights(analysis, { isModel: true }), note);
}

function renderError(output, message) {
  const state = document.createElement("div");
  state.className = "upper-air-state";
  const title = document.createElement("strong");
  title.textContent = "高層観測を表示できません";
  const detail = document.createElement("p");
  detail.textContent = message;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "再読み込み";
  retry.addEventListener("click", () => void loadObservation());
  state.append(title, detail, retry);
  output.replaceChildren(state);
}

function renderModelError(output, message) {
  const state = document.createElement("div");
  state.className = "upper-air-state";
  const title = document.createElement("strong");
  title.textContent = "地点モデルを表示できません";
  const detail = document.createElement("p");
  detail.textContent = message;
  const retry = document.createElement("button");
  retry.type = "button";
  retry.textContent = "再読み込み";
  retry.addEventListener("click", () => void loadModelProfile());
  state.append(title, detail, retry);
  output.replaceChildren(state);
}

function renderLocked(body) {
  disposeModelMap();
  modelOutput = null;
  const state = document.createElement("div");
  state.className = "upper-air-state upper-air-state-locked";
  const title = document.createElement("strong");
  title.textContent = "アーリーアクセス機能です";
  const detail = document.createElement("p");
  detail.textContent = "エマグラムは試験提供中です。設定でアーリーアクセスを有効にすると、気象庁の高層観測データを表示できます。";
  const settings = document.createElement("button");
  settings.type = "button";
  settings.textContent = "設定を開く";
  settings.addEventListener("click", () => {
    closeUpperAirModal();
    options.onOpenSettings?.();
  });
  state.append(title, detail, settings);
  body.replaceChildren(state);
}

function renderControls(body) {
  const content = buildModeSwitch(body);
  const controls = document.createElement("div");
  controls.className = "upper-air-controls";
  const label = document.createElement("label");
  label.htmlFor = "upper-air-station-select";
  label.textContent = "観測地点";
  const select = document.createElement("select");
  select.id = "upper-air-station-select";
  UPPER_AIR_STATIONS.forEach((station) => {
    const option = document.createElement("option");
    option.value = station.id;
    option.textContent = station.name;
    option.selected = station.id === selectedStationId;
    select.append(option);
  });
  select.addEventListener("change", () => {
    selectedStationId = select.value;
    void loadObservation();
  });
  const refresh = document.createElement("button");
  refresh.type = "button";
  refresh.className = "upper-air-refresh";
  refresh.setAttribute("aria-label", "高層観測を再読み込み");
  refresh.title = "再読み込み";
  refresh.innerHTML = '<svg class="disaster-dashboard-refresh-icon" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.34-5.66L20 8" /><path d="M20 3v5h-5" /></svg>';
  refresh.addEventListener("click", () => void loadObservation());
  controls.append(label, select, refresh);
  const output = document.createElement("div");
  output.className = "upper-air-results";
  content.append(controls, output);
  return output;
}

function renderModelControls(body) {
  disposeModelMap();
  const content = buildModeSwitch(body);
  buildModelPicker(content);
  const output = document.createElement("div");
  output.className = "upper-air-results";
  content.append(output);
  modelOutput = output;
  return output;
}

async function loadObservation() {
  const body = document.getElementById("upper-air-body");
  if (!body) return;
  if (!options.isEarlyAccessEnabled?.()) {
    renderLocked(body);
    return;
  }
  disposeModelMap();
  modelOutput = null;
  const output = renderControls(body);
  const loading = buildModalLoadingState({
    title: "高層観測を読み込んでいます",
    detail: "気象庁の観測データを確認中です"
  });
  output.innerHTML = loading;
  const currentRequest = ++requestId;
  try {
    const token = getEarlyAccessToken();
    const response = await fetch(`/api/upper-air?station=${encodeURIComponent(selectedStationId)}`, {
      headers: { Accept: "application/json", "X-MeteoScope-Early-Access": token }
    });
    if (!response.ok) throw new Error(`upper-air request failed: ${response.status}`);
    const observation = await response.json();
    if (currentRequest !== requestId) return;
    renderObservation(output, observation);
  } catch (error) {
    console.warn("[MeteoScope] upper-air observation unavailable", error);
    if (currentRequest === requestId) renderError(output, "気象庁の高層観測データに接続できませんでした。時間をおいて再度お試しください。");
  }
}

async function loadModelProfile({ preserveMap = false } = {}) {
  const body = document.getElementById("upper-air-body");
  if (!body) return;
  if (!options.isEarlyAccessEnabled?.()) {
    renderLocked(body);
    return;
  }
  const output = preserveMap && modelOutput?.isConnected ? modelOutput : renderModelControls(body);
  const loading = buildModalLoadingState({
    title: "GFS地点モデルを読み込んでいます",
    detail: "NOAAの気圧面データを確認中です"
  });
  const state = document.createElement("div");
  state.className = "upper-air-model-loading";
  state.innerHTML = loading;
  output.replaceChildren(state);
  const currentRequest = ++requestId;
  try {
    const token = getEarlyAccessToken();
    const response = await fetch(`/api/gfs-profile?lat=${encodeURIComponent(selectedModelCoordinates.latitude)}&lon=${encodeURIComponent(selectedModelCoordinates.longitude)}`, {
      headers: { Accept: "application/json", "X-MeteoScope-Early-Access": token }
    });
    if (!response.ok) throw new Error(`GFS profile request failed: ${response.status}`);
    const model = await response.json();
    if (currentRequest !== requestId) return;
    renderModelProfile(output, model);
  } catch (error) {
    console.warn("[MeteoScope] GFS point profile unavailable", error);
    if (currentRequest === requestId) renderModelError(output, "NOAA GFSの地点モデルデータに接続できませんでした。時間をおいて再度お試しください。");
  }
}

export function openUpperAirModal() {
  const modal = document.getElementById("upper-air-modal");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("upper-air-button")?.setAttribute("aria-expanded", "true");
  if (selectedMode === "model") void loadModelProfile();
  else void loadObservation();
}

export function closeUpperAirModal() {
  const modal = document.getElementById("upper-air-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  disposeModelMap();
  modelOutput = null;
  document.getElementById("upper-air-button")?.setAttribute("aria-expanded", "false");
  if (!document.querySelector(".warning-modal:not([hidden])")) document.body.classList.remove("modal-open");
}

export function setupUpperAirModal(nextOptions = {}) {
  options = nextOptions;
  if (initialized) return;
  initialized = true;
  const button = document.getElementById("upper-air-button");
  const modal = document.getElementById("upper-air-modal");
  if (!button || !modal) return;
  button.addEventListener("click", openUpperAirModal);
  modal.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-upper-air-close]")) closeUpperAirModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeUpperAirModal();
  });
  document.addEventListener("meteoscope:early-access-change", () => {
    const active = Boolean(options.isEarlyAccessEnabled?.());
    button.classList.toggle("is-early-access-locked", !active);
    button.setAttribute("aria-label", active ? "高層気象観測のエマグラムを開く" : "高層気象観測のエマグラムを開く（アーリーアクセス）");
    button.title = active ? "高層気象（エマグラム）" : "高層気象（アーリーアクセス）";
    if (!modal.hidden) {
      if (selectedMode === "model") void loadModelProfile();
      else void loadObservation();
    }
  });
  document.dispatchEvent(new CustomEvent("meteoscope:early-access-change"));
}
