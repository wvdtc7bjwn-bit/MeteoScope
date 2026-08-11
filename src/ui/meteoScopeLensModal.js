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
let activeImageVerticalPosition = 0.5;
let activeImageHorizontalPosition = 0.5;
let activeImageScale = 1;
const imagePositionPointers = new Map();
let imagePositionGesture = null;

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
  document.getElementById("meteoscope-lens-metric")?.addEventListener("change", () => {
    syncCustomMeasurementControls();
    void renderPreview();
  });
  document.getElementById("meteoscope-lens-format")?.addEventListener("change", (event) => {
    activeFormat = event.target.value in LENS_FORMATS ? event.target.value : "portrait";
    void renderPreview();
  });
  setupImagePositionGesture();
  document.getElementById("meteoscope-lens-show-location")?.addEventListener("change", () => void renderPreview());
  document.getElementById("meteoscope-lens-text-color")?.addEventListener("input", () => void renderPreview());
  [
    "meteoscope-lens-watermark-position",
    "meteoscope-lens-font-family",
    "meteoscope-lens-font-weight",
    "meteoscope-lens-watermark-backdrop"
  ].forEach((id) => document.getElementById(id)?.addEventListener("change", () => void renderPreview()));
  document.getElementById("meteoscope-lens-font-scale")?.addEventListener("input", () => {
    syncWatermarkSettingsUi();
    void renderPreview();
  });
  document.getElementById("meteoscope-lens-use-custom-value")?.addEventListener("change", () => {
    syncCustomMeasurementControls();
    void renderPreview();
  });
  document.getElementById("meteoscope-lens-custom-value")?.addEventListener("input", () => void renderPreview());
  document.getElementById("meteoscope-lens-custom-place")?.addEventListener("input", () => void renderPreview());
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
  activeImageVerticalPosition = 0.5;
  activeImageHorizontalPosition = 0.5;
  activeImageScale = 1;
  syncWatermarkSettingsUi();
  const format = document.getElementById("meteoscope-lens-format");
  if (format) format.value = activeFormat;
  populateMetricOptions();
  syncCustomMeasurementControls();
  const locationToggle = document.getElementById("meteoscope-lens-show-location");
  if (locationToggle) locationToggle.checked = false;
  setStatus(activeContext.location
    ? "写真を選んで投稿画像を作成します。"
    : "左側の現在地ボタンで位置情報を取得すると、最寄りの観測値を画像に重ねられます。");
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
    placeName: [context?.currentLocation?.prefecture, context?.currentLocation?.areaName].filter(Boolean).join(" ")
  };
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
  activeImageHorizontalPosition = 0.5;
  activeImageScale = 1;
  imagePositionPointers.clear();
  imagePositionGesture = null;
  if (imageObjectUrl) URL.revokeObjectURL(imageObjectUrl);
  imageObjectUrl = "";
  updatePreviewState();
}

function updatePreviewState() {
  const empty = document.getElementById("meteoscope-lens-empty");
  const hint = document.getElementById("meteoscope-lens-image-position-hint");
  const canvas = document.getElementById("meteoscope-lens-preview");
  const download = document.getElementById("meteoscope-lens-download");
  const share = document.getElementById("meteoscope-lens-share");
  if (empty) empty.hidden = Boolean(image);
  if (hint) hint.hidden = !image;
  canvas?.classList.toggle("is-image-adjustable", Boolean(image));
  if (download) download.disabled = !image;
  if (share) share.disabled = !image;
}

function setupImagePositionGesture() {
  const canvas = document.getElementById("meteoscope-lens-preview");
  if (!(canvas instanceof HTMLCanvasElement)) return;
  canvas.addEventListener("pointerdown", (event) => {
    if (!image || event.button > 0) return;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.height) return;
    imagePositionPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    imagePositionGesture = createImagePositionGesture(bounds);
    canvas.setPointerCapture?.(event.pointerId);
    canvas.classList.add("is-adjusting-image");
    event.preventDefault();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!imagePositionPointers.has(event.pointerId) || !imagePositionGesture) return;
    imagePositionPointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (imagePositionGesture.type === "pinch" && imagePositionPointers.size >= 2) {
      const [first, second] = [...imagePositionPointers.values()];
      const distance = Math.hypot(second.x - first.x, second.y - first.y);
      activeImageScale = normalizeImageScale(imagePositionGesture.startScale * distance / imagePositionGesture.startDistance);
      const centerX = (first.x + second.x) / 2 - imagePositionGesture.left;
      const centerY = (first.y + second.y) / 2 - imagePositionGesture.top;
      const layout = getImageLayout(image, imagePositionGesture.width, imagePositionGesture.height, activeImageScale);
      setImagePositionFromFocus(layout, { x: centerX, y: centerY }, imagePositionGesture.focus);
    } else if (imagePositionGesture.type === "drag") {
      const layout = getImageLayout(image, imagePositionGesture.width, imagePositionGesture.height, activeImageScale);
      setImagePositionFromOffsets(
        layout,
        imagePositionGesture.startOffsetX + event.clientX - imagePositionGesture.startX,
        imagePositionGesture.startOffsetY + event.clientY - imagePositionGesture.startY
      );
    }
    void renderPreview();
    event.preventDefault();
  });
  const finishGesture = (event) => {
    if (!imagePositionPointers.has(event.pointerId)) return;
    imagePositionPointers.delete(event.pointerId);
    imagePositionGesture = imagePositionPointers.size ? createImagePositionGesture(canvas.getBoundingClientRect()) : null;
    if (!imagePositionPointers.size) canvas.classList.remove("is-adjusting-image");
    if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  };
  canvas.addEventListener("pointerup", finishGesture);
  canvas.addEventListener("pointercancel", finishGesture);
  canvas.addEventListener("wheel", (event) => {
    if (!image) return;
    activeImageScale = normalizeImageScale(activeImageScale * (event.deltaY < 0 ? 1.08 : 0.92));
    void renderPreview();
    event.preventDefault();
  }, { passive: false });
}

function createImagePositionGesture(bounds) {
  const layout = getImageLayout(image, bounds.width, bounds.height, activeImageScale);
  if (imagePositionPointers.size >= 2) {
    const [first, second] = [...imagePositionPointers.values()];
    const centerX = (first.x + second.x) / 2 - bounds.left;
    const centerY = (first.y + second.y) / 2 - bounds.top;
    return {
      type: "pinch",
      startDistance: Math.max(1, Math.hypot(second.x - first.x, second.y - first.y)),
      startScale: activeImageScale,
      left: bounds.left,
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
      focus: getImageFocus(layout, centerX, centerY)
    };
  }
  const pointer = imagePositionPointers.values().next().value;
  return {
    type: "drag",
    startX: pointer?.x ?? 0,
    startY: pointer?.y ?? 0,
    startOffsetX: layout.offsetX,
    startOffsetY: layout.offsetY,
    width: bounds.width,
    height: bounds.height
  };
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
  drawImageCover(context, image, format.width, format.height, activeImageHorizontalPosition, activeImageVerticalPosition, activeImageScale);
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
  const customValue = getCustomMeasurementValue();
  const customPlace = getCustomMeasurementPlace();
  const useCustomValue = Number.isFinite(customValue);
  const showLocation = document.getElementById("meteoscope-lens-show-location")?.checked;
  const available = Number.isFinite(customValue) || Number.isFinite(value);
  const stationName = Number.isFinite(station?.distanceKm) ? station.name : "";
  return {
    metricLabel: useCustomValue ? `${metricLabel} · 実測値` : metricLabel,
    available,
    valueText: available ? formatValue(useCustomValue ? customValue : value, metric.digits) : "--",
    unitText: metric.id === "temperature" ? "°C" : metric.unit,
    placeName: useCustomValue
      ? customPlace
      : showLocation
      ? activeContext?.placeName ?? ""
      : stationName,
    stationLine: useCustomValue
      ? ""
      : Number.isFinite(station?.distanceKm)
      ? `${showLocation ? stationName : "AMeDAS"} · ${formatDistance(station.distanceKm)}`
      : "観測所を確認中",
    observationTime: formatObservationTime(activeContext?.data?.latestTime)
  };
}

function findNearestStation(metricId) {
  if (!activeContext) return null;
  const field = metricId === "precipitation"
    ? getAmedasPrecipitationPeriod(activeContext.precipitationPeriod).field
    : metricId;
  const points = (activeContext.data?.points ?? []).flatMap((point) => {
    const rawValue = point?.values?.[field];
    if (rawValue === null || rawValue === undefined || rawValue === "") return [];
    const value = Number(rawValue);
    const coordinates = normalizeCoordinates(point?.coordinates);
    return Number.isFinite(value) && coordinates ? [{ ...point, value, coordinates }] : [];
  });
  if (!points.length || !activeContext.location) return null;
  return points.reduce((nearest, point) => {
    const distanceKm = getDistanceKm(activeContext.location, point.coordinates);
    return !nearest || distanceKm < nearest.distanceKm ? { ...point, distanceKm } : nearest;
  }, null);
}

function drawImageCover(context, imageElement, width, height, horizontalPosition = 0.5, verticalPosition = 0.5, imageScale = 1) {
  const layout = getImageLayout(imageElement, width, height, imageScale, horizontalPosition, verticalPosition);
  context.fillStyle = "#08121f";
  context.fillRect(0, 0, width, height);
  context.drawImage(
    imageElement,
    layout.offsetX,
    layout.offsetY,
    layout.drawWidth,
    layout.drawHeight
  );
}

function getImageLayout(imageElement, width, height, imageScale = 1, horizontalPosition = activeImageHorizontalPosition, verticalPosition = activeImageVerticalPosition) {
  const scale = Math.min(width / imageElement.naturalWidth, height / imageElement.naturalHeight) * normalizeImageScale(imageScale);
  const drawWidth = imageElement.naturalWidth * scale;
  const drawHeight = imageElement.naturalHeight * scale;
  const horizontalOverflow = Math.max(0, drawWidth - width);
  const verticalOverflow = Math.max(0, drawHeight - height);
  return {
    width,
    height,
    drawWidth,
    drawHeight,
    horizontalOverflow,
    verticalOverflow,
    offsetX: horizontalOverflow ? -horizontalOverflow * normalizeImageHorizontalPosition(horizontalPosition) : (width - drawWidth) / 2,
    offsetY: verticalOverflow ? -verticalOverflow * normalizeImageVerticalPosition(verticalPosition) : (height - drawHeight) / 2
  };
}

function getImageFocus(layout, x, y) {
  return {
    x: Math.min(1, Math.max(0, (x - layout.offsetX) / layout.drawWidth)),
    y: Math.min(1, Math.max(0, (y - layout.offsetY) / layout.drawHeight))
  };
}

function setImagePositionFromFocus(layout, focusPoint, imageFocus) {
  setImagePositionFromOffsets(
    layout,
    focusPoint.x - imageFocus.x * layout.drawWidth,
    focusPoint.y - imageFocus.y * layout.drawHeight
  );
}

function setImagePositionFromOffsets(layout, offsetX, offsetY) {
  activeImageHorizontalPosition = layout.horizontalOverflow ? normalizeImageHorizontalPosition(-offsetX / layout.horizontalOverflow) : 0.5;
  activeImageVerticalPosition = layout.verticalOverflow ? normalizeImageVerticalPosition(-offsetY / layout.verticalOverflow) : 0.5;
}

function drawLensWatermark(context, width, height, observation) {
  const settings = getWatermarkSettings();
  const pad = Math.round(width * 0.06);
  const footerInset = Math.max(16, Math.round(width * 0.035));
  const isTop = settings.position.startsWith("top");
  const isRight = settings.position.endsWith("right");
  const align = isRight ? "right" : "left";
  const textX = isRight ? width - pad : pad;
  const scale = settings.fontScale;
  const locationFontSize = Math.round(width * 0.056 * scale);
  const valueFontSize = Math.round(Math.min(width * (observation.available ? 0.17 : 0.12) * scale, height * (observation.available ? 0.18 : 0.13) * scale));
  const labelFontSize = Math.round(width * 0.034 * scale);
  const stationFontSize = Math.round(width * 0.031 * scale);
  const footerFontSize = Math.round(width * 0.027 * scale);
  const hasStationLine = Boolean(observation.stationLine);
  const footerY = isTop ? footerInset : height - footerInset;
  const ruleY = isTop
    ? footerY + Math.max(Math.round(footerFontSize * 1.65), Math.round(height * 0.026))
    : footerY - Math.max(Math.round(footerFontSize * 1.65), Math.round(height * 0.026));
  const primaryLineGap = Math.max(Math.round(valueFontSize * 0.36), Math.round(labelFontSize * 1.65));
  // The place name sits above a much larger value. Reserve the value's full
  // cap height here so the two glyph runs cannot visually overlap.
  const locationLineGap = Math.max(Math.round(valueFontSize * 0.96), Math.round(locationFontSize * 1.5));
  const stationLineGap = Math.max(Math.round(stationFontSize * 1.65), Math.round(labelFontSize * 1.45));
  const informationBottom = isTop
    ? ruleY + Math.max(Math.round(height * 0.045), Math.round(footerFontSize * 1.7))
    : ruleY - Math.max(Math.round(height * 0.045), Math.round(footerFontSize * 1.7));
  let locationY;
  let valueY;
  let labelY;
  let stationY;
  let informationTop;
  if (isTop) {
    locationY = observation.placeName ? informationBottom : null;
    valueY = (locationY ?? informationBottom) + (locationY === null ? Math.round(valueFontSize * 0.7) : locationLineGap);
    labelY = valueY + primaryLineGap;
    stationY = hasStationLine || !observation.available ? labelY + stationLineGap : null;
    informationTop = ruleY;
  } else {
    stationY = hasStationLine || !observation.available ? informationBottom : null;
    labelY = informationBottom - (stationY === null ? 0 : stationLineGap);
    valueY = labelY - primaryLineGap;
    locationY = observation.placeName ? valueY - locationLineGap : null;
    informationTop = Math.max(0, (locationY ?? valueY) - Math.max(valueFontSize, locationFontSize));
  }
  const overlayTop = isTop ? 0 : Math.max(0, informationTop - Math.round(height * 0.04));
  const fontFamily = settings.fontFamily;
  const textColor = settings.textColor;
  context.save();
  drawWatermarkBackdrop(context, width, height, overlayTop, isTop, settings.backdrop);
  context.shadowColor = "rgba(0, 0, 0, 0.24)";
  context.shadowBlur = Math.max(8, Math.round(width * 0.011));
  context.shadowOffsetY = 1;
  if (observation.placeName) {
    context.fillStyle = colorWithAlpha(textColor, 0.9);
    drawTextFitted(context, observation.placeName, textX, locationY, width - pad * 2, `${settings.fontWeight} ${locationFontSize}px ${fontFamily}`, align);
  }
  context.fillStyle = textColor;
  const valueSize = setFittedCanvasFont(context, observation.valueText, width * 0.66, `${settings.fontWeight} ${valueFontSize}px ${fontFamily}`);
  context.textAlign = align;
  context.fillText(observation.valueText, textX, valueY);
  const valueWidth = context.measureText(observation.valueText).width;
  const unitSize = Math.max(Math.round(valueSize * 0.34), 18);
  context.font = `500 ${unitSize}px ${fontFamily}`;
  context.fillStyle = colorWithAlpha(textColor, 0.9);
  const unitOffset = Math.max(3, Math.round(width * 0.003));
  context.fillText(observation.unitText, isRight ? textX - valueWidth - unitOffset : textX + valueWidth + unitOffset, valueY - Math.round(valueSize * 0.42));
  context.textAlign = "left";
  context.fillStyle = colorWithAlpha(textColor, 0.82);
  drawTextFitted(context, observation.metricLabel, textX, labelY, width - pad * 2, `${settings.fontWeight} ${labelFontSize}px ${fontFamily}`, align);
  if (stationY !== null) {
    context.fillStyle = colorWithAlpha(textColor, 0.78);
    drawTextFitted(context, observation.available ? observation.stationLine : "現在地を取得すると最寄りの観測値を表示できます", textX, stationY, width - pad * 2, `500 ${stationFontSize}px ${fontFamily}`, align);
  }
  context.shadowBlur = 0;
  context.strokeStyle = colorWithAlpha(textColor, 0.3);
  context.lineWidth = Math.max(1, Math.round(width * 0.0012));
  context.beginPath();
  context.moveTo(pad, ruleY);
  context.lineTo(width - pad, ruleY);
  context.stroke();
  context.fillStyle = colorWithAlpha(textColor, 0.78);
  drawTextFitted(context, "MeteoScope", isRight ? width - pad : pad, footerY, width * 0.38, `${settings.fontWeight} ${footerFontSize}px ${fontFamily}`, isRight ? "right" : "left");
  context.fillStyle = colorWithAlpha(textColor, 0.72);
  drawTextFitted(context, `JMA · ${observation.observationTime}`, isRight ? pad : width - pad, footerY, width * 0.4, `500 ${footerFontSize}px ${fontFamily}`, isRight ? "left" : "right");
  context.restore();
}

function drawWatermarkBackdrop(context, width, height, overlayTop, isTop, backdrop) {
  if (backdrop === "none") return;
  const backdropHeight = isTop ? Math.round(height * 0.38) : height - overlayTop;
  if (backdrop === "matte") {
    context.fillStyle = "rgba(2, 8, 16, 0.42)";
    context.fillRect(0, overlayTop, width, backdropHeight);
    return;
  }
  const gradient = context.createLinearGradient(0, overlayTop, 0, overlayTop + backdropHeight);
  if (isTop) {
    gradient.addColorStop(0, "rgba(2, 8, 16, 0.54)");
    gradient.addColorStop(0.6, "rgba(2, 8, 16, 0.08)");
    gradient.addColorStop(1, "rgba(2, 8, 16, 0)");
  } else {
    gradient.addColorStop(0, "rgba(2, 8, 16, 0)");
    gradient.addColorStop(0.44, "rgba(2, 8, 16, 0.06)");
    gradient.addColorStop(1, "rgba(2, 8, 16, 0.54)");
  }
  context.fillStyle = gradient;
  context.fillRect(0, overlayTop, width, backdropHeight);
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

function normalizeImageVerticalPosition(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric > 1 ? numeric / 100 : numeric)) : 0.5;
}

function normalizeImageHorizontalPosition(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(1, Math.max(0, numeric > 1 ? numeric / 100 : numeric)) : 0.5;
}

function getWatermarkSettings() {
  const fontFamilies = {
    sans: '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Helvetica Neue", "Yu Gothic", "Hiragino Sans", sans-serif',
    rounded: 'ui-rounded, "Hiragino Maru Gothic ProN", "Yu Gothic", sans-serif',
    serif: 'Iowan Old Style, "Yu Mincho", "Hiragino Mincho ProN", serif'
  };
  const fontScale = Number(document.getElementById("meteoscope-lens-font-scale")?.value);
  const position = getWatermarkChoice("meteoscope-lens-watermark-position", ["bottom-left", "bottom-right", "top-left", "top-right"], "bottom-left");
  const family = getWatermarkChoice("meteoscope-lens-font-family", Object.keys(fontFamilies), "sans");
  const weight = getWatermarkChoice("meteoscope-lens-font-weight", ["regular", "bold"], "regular");
  return {
    position,
    fontFamily: fontFamilies[family],
    fontWeight: weight === "bold" ? 700 : 600,
    backdrop: getWatermarkChoice("meteoscope-lens-watermark-backdrop", ["gradient", "matte", "none"], "gradient"),
    fontScale: Number.isFinite(fontScale) ? Math.min(1.4, Math.max(0.8, fontScale / 100)) : 1,
    textColor: getLensTextColor()
  };
}

function getWatermarkChoice(id, options, fallback) {
  const value = document.getElementById(id)?.value;
  return options.includes(value) ? value : fallback;
}

function syncWatermarkSettingsUi() {
  const scale = document.getElementById("meteoscope-lens-font-scale")?.value;
  const output = document.getElementById("meteoscope-lens-font-scale-output");
  if (output) output.textContent = `${Number(scale) || 100}%`;
}

function normalizeImageScale(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.min(3, Math.max(1, numeric)) : 1;
}

function syncCustomMeasurementControls() {
  const toggle = document.getElementById("meteoscope-lens-use-custom-value");
  const input = document.getElementById("meteoscope-lens-custom-value");
  const place = document.getElementById("meteoscope-lens-custom-place");
  const unit = document.getElementById("meteoscope-lens-custom-unit");
  const metricSelect = document.getElementById("meteoscope-lens-metric");
  const metric = METRICS.find((item) => item.id === metricSelect?.value) ?? METRICS[0];
  if (unit) unit.textContent = metric.unit;
  if (input) input.disabled = !toggle?.checked;
  if (place) place.disabled = !toggle?.checked;
}

function getCustomMeasurementValue() {
  const enabled = document.getElementById("meteoscope-lens-use-custom-value")?.checked;
  const input = document.getElementById("meteoscope-lens-custom-value");
  const rawValue = input instanceof HTMLInputElement ? input.value.trim() : "";
  if (!enabled || !rawValue) return null;
  const value = Number(rawValue);
  return Number.isFinite(value) ? value : null;
}

function getCustomMeasurementPlace() {
  const enabled = document.getElementById("meteoscope-lens-use-custom-value")?.checked;
  const input = document.getElementById("meteoscope-lens-custom-place");
  return enabled && input instanceof HTMLInputElement ? input.value.trim().slice(0, 40) : "";
}

function getLensTextColor() {
  const color = document.getElementById("meteoscope-lens-text-color")?.value;
  return /^#[0-9a-f]{6}$/iu.test(color ?? "") ? color : "#ffffff";
}

function colorWithAlpha(hex, alpha) {
  const normalized = String(hex).replace("#", "");
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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
