import { getAmedasPrecipitationPeriod } from "../amedasPrecipitationPeriod.js";
import { getDistanceKm } from "../location/distance.js";

const LENS_FORMATS = Object.freeze({
  portrait: Object.freeze({ width: 1080, height: 1350, label: "縦長" }),
  square: Object.freeze({ width: 1080, height: 1080, label: "正方形" }),
  landscape: Object.freeze({ width: 1920, height: 1080, label: "横長" })
});

const METRICS = Object.freeze([
  { id: "temperature", label: "気温", unit: "°C", digits: 1 },
  { id: "precipitation", label: "降水量", unit: "mm", digits: 1 },
  { id: "wind", label: "風速", unit: "m/s", digits: 1 },
  { id: "humidity", label: "湿度", unit: "%", digits: 0 },
  { id: "pressure", label: "気圧", unit: "hPa", digits: 1 },
  { id: "snow", label: "積雪深", unit: "cm", digits: 0 }
]);

let initialized = false;
let getLensContext = () => null;
let activeContext = null;
let image = null;
let imageObjectUrl = "";
let activeFormat = "portrait";

export function setupMeteoScopeLensModal({ getContext } = {}) {
  if (typeof getContext === "function") getLensContext = getContext;
  if (initialized) return;
  initialized = true;

  document.querySelectorAll("[data-meteoscope-lens-close]").forEach((element) => {
    element.addEventListener("click", closeMeteoScopeLensModal);
  });
  document.getElementById("meteoscope-lens-capture")?.addEventListener("click", () => {
    document.getElementById("meteoscope-lens-camera-input")?.click();
  });
  document.getElementById("meteoscope-lens-library")?.addEventListener("click", () => {
    document.getElementById("meteoscope-lens-library-input")?.click();
  });
  document.querySelectorAll("#meteoscope-lens-camera-input, #meteoscope-lens-library-input").forEach((input) => {
    input.addEventListener("change", () => void selectPhoto(input));
  });
  document.getElementById("meteoscope-lens-metric")?.addEventListener("change", () => void renderPreview());
  document.getElementById("meteoscope-lens-format")?.addEventListener("change", (event) => {
    activeFormat = event.target.value in LENS_FORMATS ? event.target.value : "portrait";
    void renderPreview();
  });
  document.getElementById("meteoscope-lens-show-location")?.addEventListener("change", () => void renderPreview());
  document.getElementById("meteoscope-lens-download")?.addEventListener("click", downloadPng);
  document.getElementById("meteoscope-lens-share")?.addEventListener("click", sharePng);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMeteoScopeLensModal();
  });
}

export function openMeteoScopeLensModal() {
  const modal = document.getElementById("meteoscope-lens-modal");
  if (!modal) return;
  setupMeteoScopeLensModal();
  activeContext = normalizeContext(getLensContext());
  activeFormat = "portrait";
  const format = document.getElementById("meteoscope-lens-format");
  if (format) format.value = activeFormat;
  populateMetricOptions();
  applyEarlyAccessState();
  const locationToggle = document.getElementById("meteoscope-lens-show-location");
  if (locationToggle) locationToggle.checked = false;
  setStatus(activeContext.earlyAccessEnabled
    ? activeContext.location
      ? "写真を選んで投稿画像を作成します。"
      : "左側の現在地ボタンで位置情報を取得すると、最寄りの観測値を画像に重ねられます。"
    : "MeteoScope Lensはアーリーアクセス機能です。設定から認証すると利用できます。", activeContext.earlyAccessEnabled ? "" : "info");
  modal.hidden = false;
  document.body.classList.add("modal-open");
  updatePreviewState();
}

export function closeMeteoScopeLensModal() {
  const modal = document.getElementById("meteoscope-lens-modal");
  if (!modal?.hidden) modal.hidden = true;
  document.body.classList.remove("modal-open");
  activeContext = null;
  clearSelectedPhoto();
}

function normalizeContext(context) {
  const data = context?.data ?? {};
  const precipitationPeriod = context?.precipitationPeriod ?? "1h";
  const currentMetricId = METRICS.some((metric) => metric.id === context?.metricId)
    ? context.metricId
    : "temperature";
  const location = normalizeCoordinates(context?.currentLocation?.coordinates);
  return {
    data,
    precipitationPeriod,
    currentMetricId,
    location,
    placeName: [context?.currentLocation?.prefecture, context?.currentLocation?.areaName].filter(Boolean).join(" "),
    earlyAccessEnabled: context?.earlyAccessEnabled === true
  };
}

function applyEarlyAccessState() {
  const locked = !activeContext?.earlyAccessEnabled;
  const panel = document.querySelector(".meteoscope-lens-panel");
  const notice = document.getElementById("meteoscope-lens-early-access");
  panel?.classList.toggle("is-early-access-locked", locked);
  if (notice) notice.hidden = !locked;
  document.querySelectorAll("#meteoscope-lens-capture, #meteoscope-lens-library, #meteoscope-lens-metric, #meteoscope-lens-format, #meteoscope-lens-show-location, #meteoscope-lens-download, #meteoscope-lens-share").forEach((element) => {
    element.disabled = locked;
  });
}

function populateMetricOptions() {
  const select = document.getElementById("meteoscope-lens-metric");
  if (!(select instanceof HTMLSelectElement) || !activeContext) return;
  const available = METRICS.filter((metric) => findNearestStation(metric.id));
  const options = available.length ? available : METRICS;
  select.innerHTML = options.map((metric) => {
    const label = metric.id === "precipitation"
      ? `${getAmedasPrecipitationPeriod(activeContext.precipitationPeriod).label}降水量`
      : metric.label;
    return `<option value="${metric.id}">${label}</option>`;
  }).join("");
  select.value = options.some((metric) => metric.id === activeContext.currentMetricId)
    ? activeContext.currentMetricId
    : options[0]?.id ?? "temperature";
}

async function selectPhoto(input) {
  if (!activeContext?.earlyAccessEnabled) return;
  const file = input instanceof HTMLInputElement ? input.files?.[0] : null;
  if (!file) return;
  input.value = "";
  if (!file.type.startsWith("image/")) {
    setStatus("画像ファイルを選んでください。", "error");
    return;
  }
  if (file.size > 30 * 1024 * 1024) {
    setStatus("30MB以下の画像を選んでください。", "error");
    return;
  }
  clearSelectedPhoto();
  imageObjectUrl = URL.createObjectURL(file);
  try {
    image = await loadImage(imageObjectUrl);
    await renderPreview();
    setStatus("観測値を画像に合成しました。共有前に内容を確認してください。", "success");
  } catch (error) {
    console.warn("[MeteoScope] Lens image load failed", error);
    clearSelectedPhoto();
    setStatus("写真を読み込めませんでした。別の画像を選んでください。", "error");
  }
}

function clearSelectedPhoto() {
  image = null;
  if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
  imageObjectUrl = "";
  updatePreviewState();
}

function updatePreviewState() {
  const empty = document.getElementById("meteoscope-lens-empty");
  const download = document.getElementById("meteoscope-lens-download");
  const share = document.getElementById("meteoscope-lens-share");
  if (empty) empty.hidden = Boolean(image);
  if (download) download.disabled = !image || !activeContext?.earlyAccessEnabled;
  if (share) share.disabled = !image || !activeContext?.earlyAccessEnabled;
}

async function renderPreview() {
  const canvas = document.getElementById("meteoscope-lens-preview");
  if (!(canvas instanceof HTMLCanvasElement) || !image || !activeContext) {
    updatePreviewState();
    return;
  }
  const format = LENS_FORMATS[activeFormat];
  canvas.width = format.width;
  canvas.height = format.height;
  const context = canvas.getContext("2d");
  if (!context) return;
  drawImageCover(context, image, format.width, format.height);
  drawLensWatermark(context, format.width, format.height, buildObservation());
  updatePreviewState();
}

function buildObservation() {
  const select = document.getElementById("meteoscope-lens-metric");
  const metricId = select?.value ?? activeContext?.currentMetricId ?? "temperature";
  const metric = METRICS.find((item) => item.id === metricId) ?? METRICS[0];
  const station = findNearestStation(metric.id);
  const value = station?.value;
  const metricLabel = metric.id === "precipitation"
    ? `${getAmedasPrecipitationPeriod(activeContext?.precipitationPeriod).label}降水量`
    : metric.label;
  return {
    metricLabel,
    available: Number.isFinite(value),
    valueText: Number.isFinite(value) ? formatValue(value, metric.digits) : "--",
    unitText: metric.id === "temperature" ? "°" : metric.unit,
    stationLine: Number.isFinite(station?.distanceKm)
      ? `${station.name} AMeDAS · ${formatDistance(station.distanceKm)}`
      : "観測所を確認中",
    observationTime: formatObservationTime(activeContext?.data?.latestTime),
    placeName: document.getElementById("meteoscope-lens-show-location")?.checked ? activeContext?.placeName : ""
  };
}

function findNearestStation(metricId) {
  if (!activeContext) return null;
  const field = metricId === "precipitation"
    ? getAmedasPrecipitationPeriod(activeContext.precipitationPeriod).field
    : metricId;
  const points = (activeContext.data?.points ?? []).flatMap((point) => {
    const value = Number(point?.values?.[field]);
    const coordinates = normalizeCoordinates(point?.coordinates);
    return Number.isFinite(value) && coordinates ? [{ ...point, value, coordinates }] : [];
  });
  if (!points.length || !activeContext.location) return null;
  return points.reduce((nearest, point) => {
    const distanceKm = getDistanceKm(activeContext.location, point.coordinates);
    return !nearest || distanceKm < nearest.distanceKm ? { ...point, distanceKm } : nearest;
  }, null);
}

function drawImageCover(context, imageElement, width, height) {
  const scale = Math.max(width / imageElement.naturalWidth, height / imageElement.naturalHeight);
  const drawWidth = imageElement.naturalWidth * scale;
  const drawHeight = imageElement.naturalHeight * scale;
  context.drawImage(imageElement, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawLensWatermark(context, width, height, observation) {
  const pad = Math.round(width * 0.06);
  const isPortrait = height >= width;
  const overlayTop = Math.round(height * (isPortrait ? 0.58 : 0.56));
  const locationFontSize = Math.round(width * 0.034);
  const valueFontSize = Math.round(Math.min(width * (observation.available ? 0.17 : 0.12), height * (observation.available ? 0.18 : 0.13)));
  const labelFontSize = Math.round(width * 0.034);
  const stationFontSize = Math.round(width * 0.031);
  const footerFontSize = Math.round(width * 0.027);
  const fontFamily = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Yu Gothic", "Hiragino Sans", sans-serif';
  context.save();
  const gradient = context.createLinearGradient(0, overlayTop, 0, height);
  gradient.addColorStop(0, "rgba(2, 8, 16, 0)");
  gradient.addColorStop(0.44, "rgba(2, 8, 16, 0.06)");
  gradient.addColorStop(1, "rgba(2, 8, 16, 0.54)");
  context.fillStyle = gradient;
  context.fillRect(0, overlayTop, width, height - overlayTop);
  context.shadowColor = "rgba(0, 0, 0, 0.24)";
  context.shadowBlur = Math.max(8, Math.round(width * 0.011));
  context.shadowOffsetY = 1;
  let informationTop = overlayTop + Math.round(height * 0.075);
  if (observation.placeName) {
    context.fillStyle = "rgba(255, 255, 255, 0.9)";
    drawTextFitted(context, observation.placeName, pad, informationTop, width - pad * 2, `600 ${locationFontSize}px ${fontFamily}`);
    informationTop += Math.round(valueFontSize * 0.9);
  } else {
    informationTop += Math.round(valueFontSize * 0.7);
  }
  context.fillStyle = "#ffffff";
  const valueSize = setFittedCanvasFont(context, observation.valueText, width * 0.72, `600 ${valueFontSize}px ${fontFamily}`);
  context.fillText(observation.valueText, pad, informationTop);
  const valueWidth = context.measureText(observation.valueText).width;
  const unitSize = Math.max(Math.round(valueSize * 0.34), 18);
  context.font = `500 ${unitSize}px ${fontFamily}`;
  context.fillStyle = "rgba(255, 255, 255, 0.9)";
  context.fillText(observation.unitText, pad + valueWidth + Math.max(7, Math.round(width * 0.008)), informationTop - Math.round(valueSize * 0.42));
  context.fillStyle = "rgba(255, 255, 255, 0.82)";
  drawTextFitted(context, observation.metricLabel, pad, informationTop + Math.round(valueSize * 0.25), width - pad * 2, `600 ${labelFontSize}px ${fontFamily}`);
  context.fillStyle = "rgba(249, 252, 255, 0.78)";
  drawTextFitted(
    context,
    observation.available ? observation.stationLine : "現在地を取得すると最寄りの観測値を表示できます",
    pad,
    informationTop + Math.round(valueSize * 0.55),
    width - pad * 2,
    `500 ${stationFontSize}px ${fontFamily}`
  );
  context.shadowBlur = 0;
  context.strokeStyle = "rgba(255, 255, 255, 0.3)";
  context.lineWidth = Math.max(1, Math.round(width * 0.0012));
  context.beginPath();
  context.moveTo(pad, height - Math.round(height * 0.067));
  context.lineTo(width - pad, height - Math.round(height * 0.067));
  context.stroke();
  context.fillStyle = "rgba(255, 255, 255, 0.78)";
  drawTextFitted(context, "MeteoScope", pad, height - Math.round(height * 0.03), width * 0.38, `600 ${footerFontSize}px ${fontFamily}`);
  context.fillStyle = "rgba(255, 255, 255, 0.72)";
  drawTextFitted(context, `JMA · ${observation.observationTime}`, width - pad, height - Math.round(height * 0.03), width * 0.4, `500 ${footerFontSize}px ${fontFamily}`, "right");
  context.restore();
}

function drawTextFitted(context, text, x, y, maxWidth, font, align = "left") {
  setFittedCanvasFont(context, text, maxWidth, font);
  context.textAlign = align;
  context.fillText(String(text ?? ""), x, y);
  context.textAlign = "left";
}

function setFittedCanvasFont(context, text, maxWidth, font) {
  const match = /^(?:(\d+)\s+)?(\d+)px\s+(.+)$/u.exec(font);
  const weight = match?.[1] ? `${match[1]} ` : "";
  let size = Number(match?.[2] ?? 16);
  const family = match?.[3] ?? "system-ui, sans-serif";
  const content = String(text ?? "");
  while (size > 13) {
    context.font = `${weight}${size}px ${family}`;
    if (context.measureText(content).width <= maxWidth) break;
    size -= 1;
  }
  return size;
}

async function downloadPng() {
  const blob = await getPngBlob();
  if (!blob) return;
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = `meteoscope-lens-${new Date().toISOString().slice(0, 10)}.png`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  setStatus("PNGを保存しました。", "success");
}

async function sharePng() {
  const blob = await getPngBlob();
  if (!blob) return;
  const file = new File([blob], `meteoscope-lens-${new Date().toISOString().slice(0, 10)}.png`, { type: "image/png" });
  if (!navigator.canShare?.({ files: [file] })) {
    await downloadPng();
    setStatus("共有に対応していないため、PNGを保存しました。", "success");
    return;
  }
  try {
    await navigator.share({ title: "MeteoScope Lens", text: "MeteoScope Lensで作成", files: [file] });
    setStatus("共有画面を開きました。", "success");
  } catch (error) {
    if (error?.name !== "AbortError") setStatus("共有を開始できませんでした。", "error");
  }
}

function getPngBlob() {
  const canvas = document.getElementById("meteoscope-lens-preview");
  if (!(canvas instanceof HTMLCanvasElement) || !image) return Promise.resolve(null);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const nextImage = new Image();
    nextImage.decoding = "async";
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = reject;
    nextImage.src = url;
  });
}

function normalizeCoordinates(value) {
  if (!Array.isArray(value) || value.length < 2) return null;
  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;
}

function formatValue(value, digits) {
  return Number(value).toLocaleString("ja-JP", { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

function formatDistance(value) {
  return value < 10 ? `${value.toFixed(1)}km` : `${Math.round(value)}km`;
}

function formatObservationTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "時刻不明";
  return new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
}

function setStatus(message, tone) {
  const status = document.getElementById("meteoscope-lens-status");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}
