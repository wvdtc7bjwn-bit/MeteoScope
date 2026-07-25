import { getEarthquakeIntensityRank } from "./earthquakeIntensity.js";

export const SOCIAL_SHARE_FORMATS = Object.freeze({
  portrait: Object.freeze({ width: 1080, height: 1350, label: "縦長" }),
  square: Object.freeze({ width: 1080, height: 1080, label: "正方形" }),
  landscape: Object.freeze({ width: 1200, height: 675, label: "横長" })
});

const THEMES = {
  dark: {
    background: ["#071225", "#102b4e"],
    panel: "#102544",
    panelSoft: "#17345b",
    text: "#f4f8ff",
    muted: "#9eb4cf",
    border: "#31547d",
    accent: "#42c8ff"
  },
  light: {
    background: ["#eaf4fc", "#d8eaf8"],
    panel: "#ffffff",
    panelSoft: "#edf6fc",
    text: "#142b44",
    muted: "#56718b",
    border: "#bfd4e6",
    accent: "#087fc1"
  }
};

const FONT_FAMILY = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif';

export function buildSocialShareFilename(payload, format = "portrait") {
  const type = payload?.type === "earthquake" ? "earthquake" : "amedas";
  const safeFormat = Object.hasOwn(SOCIAL_SHARE_FORMATS, format) ? format : "portrait";
  const timestamp = new Date().toISOString().replace(/\.\d{3}Z$/, "Z").replace(/[:]/g, "-");
  return `meteoscope-${type}-${safeFormat}-${timestamp}.png`;
}

export function renderSocialShareCard(canvas, payload, options = {}) {
  if (!(canvas instanceof HTMLCanvasElement)) {
    throw new TypeError("PNGプレビュー用Canvasが見つかりません");
  }
  const formatKey = Object.hasOwn(SOCIAL_SHARE_FORMATS, options.format) ? options.format : "portrait";
  const format = SOCIAL_SHARE_FORMATS[formatKey];
  const theme = THEMES[options.theme] ?? THEMES.dark;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvasを初期化できません");

  canvas.width = format.width;
  canvas.height = format.height;
  context.clearRect(0, 0, format.width, format.height);
  if (payload?.type === "earthquake") drawEarthquakeBackground(context, format, theme);
  else drawBackground(context, format, theme);
  drawBrand(context, format, theme, options.appIcon);

  if (payload?.type === "earthquake") {
    drawEarthquakeCard(context, format, theme, payload, options.japanGeoJson);
  } else {
    drawAmedasCard(context, format, theme, payload ?? {});
  }
  drawFooter(context, format, theme);
}

function drawBackground(context, format, theme) {
  const gradient = context.createLinearGradient(0, 0, format.width, format.height);
  gradient.addColorStop(0, theme.background[0]);
  gradient.addColorStop(1, theme.background[1]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, format.width, format.height);

  context.save();
  context.globalAlpha = 0.08;
  context.strokeStyle = theme.accent;
  context.lineWidth = 2;
  for (let offset = -format.height; offset < format.width; offset += 90) {
    context.beginPath();
    context.moveTo(offset, 0);
    context.lineTo(offset + format.height, format.height);
    context.stroke();
  }
  context.restore();
}

function drawEarthquakeBackground(context, format, theme) {
  context.fillStyle = theme.background[0];
  context.fillRect(0, 0, format.width, format.height);

  const wash = context.createLinearGradient(0, 0, 0, format.height);
  wash.addColorStop(0, theme.background[1]);
  wash.addColorStop(0.38, theme.background[0]);
  wash.addColorStop(1, theme.background[0]);
  context.save();
  context.globalAlpha = 0.34;
  context.fillStyle = wash;
  context.fillRect(0, 0, format.width, format.height);
  context.restore();

  const padding = Math.round(format.width * 0.065);
  context.fillStyle = theme.accent;
  context.fillRect(padding, 116, 72, 4);
  context.fillStyle = theme.border;
  context.fillRect(padding + 72, 116, format.width - padding * 2 - 72, 1);
}

function drawBrand(context, format, theme, appIcon) {
  const padding = Math.round(format.width * 0.065);
  const iconSize = 42;
  const iconX = padding;
  const iconY = 72 - iconSize / 2;
  if (appIcon) {
    context.save();
    roundedRect(context, iconX, iconY, iconSize, iconSize, 10);
    context.clip();
    context.drawImage(appIcon, iconX, iconY, iconSize, iconSize);
    context.restore();
  } else {
    context.fillStyle = theme.accent;
    context.beginPath();
    context.arc(padding + 20, 72, 20, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = theme.background[0];
    context.lineWidth = 7;
    context.beginPath();
    context.arc(padding + 20, 72, 9, Math.PI * 0.15, Math.PI * 1.65);
    context.stroke();
  }

  context.fillStyle = theme.text;
  context.font = `700 36px ${FONT_FAMILY}`;
  context.textBaseline = "middle";
  context.fillText("MeteoScope", padding + iconSize + 16, 72);
  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = `600 24px ${FONT_FAMILY}`;
  context.fillText("気象・防災情報", format.width - padding, 72);
  context.textAlign = "left";
}

function drawAmedasCard(context, format, theme, payload) {
  const landscape = format.height < 800;
  const padding = Math.round(format.width * 0.065);
  const top = landscape ? 115 : 135;
  const panelHeight = format.height - top - (landscape ? 78 : 105);
  drawPanel(context, padding, top, format.width - padding * 2, panelHeight, theme);

  context.fillStyle = theme.text;
  context.font = `800 ${landscape ? 34 : 42}px ${FONT_FAMILY}`;
  context.fillText(`${payload.metricLabel ?? "アメダス"}ランキング`, padding + 32, top + 52);
  context.fillStyle = theme.muted;
  context.font = `600 ${landscape ? 17 : 21}px ${FONT_FAMILY}`;
  const meta = `${payload.orderLabel ?? ""}  ${payload.totalLocations ?? 0}地点  更新 ${payload.updatedAt ?? "--:--"}`.trim();
  context.fillText(meta, padding + 32, top + (landscape ? 82 : 88));

  const items = Array.isArray(payload.items) ? payload.items.slice(0, 100) : [];
  const columns = landscape ? 5 : 4;
  const rows = Math.max(1, Math.ceil(items.length / columns));
  const listX = padding + 24;
  const listTop = top + (landscape ? 98 : 108);
  const listWidth = format.width - padding * 2 - 48;
  const listHeight = top + panelHeight - 22 - listTop;
  const columnGap = landscape ? 10 : 12;
  const columnWidth = (listWidth - columnGap * (columns - 1)) / columns;
  const rowHeight = listHeight / rows;
  const rankWidth = landscape ? 29 : 34;
  const valueWidth = landscape ? 62 : 76;
  const fontSize = Math.max(11, Math.min(18, rowHeight * 0.46));

  items.forEach((item, index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const x = listX + column * (columnWidth + columnGap);
    const y = listTop + row * rowHeight;
    if (row % 2 === 0) {
      roundedRect(context, x, y + 1, columnWidth, Math.max(2, rowHeight - 2), 5);
      context.fillStyle = theme.panelSoft;
      context.fill();
    }

    context.fillStyle = item.color || theme.accent;
    roundedRect(context, x + 3, y + rowHeight * 0.24, 4, rowHeight * 0.52, 2);
    context.fill();
    context.textBaseline = "middle";
    context.font = `800 ${fontSize}px ${FONT_FAMILY}`;
    context.fillStyle = theme.muted;
    context.textAlign = "right";
    context.fillText(String(item.rank ?? index + 1), x + rankWidth, y + rowHeight / 2);

    context.fillStyle = theme.text;
    context.textAlign = "left";
    context.font = `700 ${fontSize}px ${FONT_FAMILY}`;
    drawFittedText(
      context,
      item.name ?? "観測点",
      x + rankWidth + 7,
      y + rowHeight / 2,
      columnWidth - rankWidth - valueWidth - 13
    );

    context.textAlign = "right";
    context.font = `800 ${fontSize}px ${FONT_FAMILY}`;
    context.fillText(item.value ?? "--", x + columnWidth - 5, y + rowHeight / 2);
  });
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
}

function drawEarthquakeCard(context, format, theme, payload, japanGeoJson) {
  const landscape = format.height < 800;
  const padding = Math.round(format.width * 0.065);
  const top = landscape ? 130 : 150;
  const panelHeight = format.height - top - (landscape ? 92 : 145);
  const panelX = padding;
  const panelWidth = format.width - padding * 2;
  const inset = landscape ? 30 : 38;
  drawEarthquakeBulletinPanel(context, panelX, top, panelWidth, panelHeight, theme);

  context.fillStyle = theme.accent;
  context.fillRect(panelX + inset, top + 34, 5, landscape ? 28 : 34);
  context.fillStyle = theme.text;
  context.font = `800 ${landscape ? 22 : 28}px ${FONT_FAMILY}`;
  context.fillText("地震情報", panelX + inset + 18, top + (landscape ? 57 : 62));
  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = `600 ${landscape ? 18 : 22}px ${FONT_FAMILY}`;
  context.fillText(payload.eventTime ?? "--", format.width - padding - 42, top + 58);
  context.textAlign = "left";

  const headerBottom = top + (landscape ? 78 : 88);
  context.strokeStyle = theme.border;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(panelX + inset, headerBottom);
  context.lineTo(panelX + panelWidth - inset, headerBottom);
  context.stroke();

  const mapX = panelX + inset;
  const mapY = headerBottom + (landscape ? 18 : 22);
  const mapWidth = landscape
    ? Math.round((panelWidth - inset * 2 - 26) * 0.56)
    : panelWidth - inset * 2;
  const mapHeight = landscape
    ? panelHeight - (mapY - top) - 24
    : (format.height > 1200 ? 440 : 285);
  drawEarthquakeMap(context, {
    x: mapX,
    y: mapY,
    width: mapWidth,
    height: mapHeight
  }, theme, japanGeoJson, payload.coordinates, payload.observations);

  const intensitySize = landscape ? 106 : (format.height > 1200 ? 148 : 120);
  const intensityX = landscape ? mapX + mapWidth + 26 : mapX;
  const intensityY = landscape ? mapY : mapY + mapHeight + 28;
  roundedRect(context, intensityX, intensityY, intensitySize, intensitySize, landscape ? 14 : 18);
  context.fillStyle = payload.intensityColor || theme.accent;
  context.fill();
  context.fillStyle = getReadableTextColor(payload.intensityColor || theme.accent);
  context.textAlign = "center";
  context.font = `700 ${landscape ? 14 : 18}px ${FONT_FAMILY}`;
  context.fillText("最大震度", intensityX + intensitySize / 2, intensityY + (landscape ? 27 : 34));
  context.font = `900 ${landscape ? 50 : 70}px ${FONT_FAMILY}`;
  context.textBaseline = "middle";
  context.fillText(payload.intensity ?? "--", intensityX + intensitySize / 2, intensityY + intensitySize * 0.64);

  const contentX = intensityX + intensitySize + (landscape ? 22 : 34);
  const contentWidth = panelX + panelWidth - inset - contentX;
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  context.fillStyle = theme.muted;
  context.font = `700 ${landscape ? 14 : 18}px ${FONT_FAMILY}`;
  context.fillText("震央", contentX, intensityY + (landscape ? 23 : 30));
  context.fillStyle = theme.text;
  context.font = `800 ${landscape ? 27 : 38}px ${FONT_FAMILY}`;
  drawFittedText(context, payload.hypocenter ?? "調査中", contentX, intensityY + (landscape ? 59 : 78), contentWidth);

  const metrics = [
    ["規模", payload.magnitude ?? "--"],
    ["深さ", payload.depth ?? "--"],
    ["津波", payload.tsunami ?? "不明"]
  ];
  const metricsY = landscape ? intensityY + intensitySize + 18 : intensityY + intensitySize + 30;
  const metricsX = landscape ? intensityX : mapX;
  const metricsAvailableWidth = landscape
    ? panelX + panelWidth - inset - metricsX
    : mapWidth;
  const metricWidth = landscape ? metricsAvailableWidth : metricsAvailableWidth / 3;
  context.strokeStyle = theme.border;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(metricsX, metricsY);
  context.lineTo(metricsX + metricsAvailableWidth, metricsY);
  context.stroke();
  metrics.forEach(([label, value], index) => {
    const x = landscape ? metricsX : metricsX + index * metricWidth;
    const y = landscape ? metricsY + index * 55 : metricsY;
    if (!landscape && index > 0) {
      context.beginPath();
      context.moveTo(x, metricsY + 18);
      context.lineTo(x, metricsY + 76);
      context.stroke();
    }
    context.fillStyle = theme.muted;
    context.font = `600 ${landscape ? 13 : 16}px ${FONT_FAMILY}`;
    context.fillText(label, x + (landscape ? 0 : 16), y + (landscape ? 22 : 30));
    context.fillStyle = theme.text;
    context.font = `800 ${landscape ? 20 : 25}px ${FONT_FAMILY}`;
    if (landscape) {
      context.textAlign = "right";
      drawFittedText(context, value, x + metricWidth, y + 27, metricWidth - 82);
      context.textAlign = "left";
    } else {
      drawFittedText(
        context,
        value,
        x + 16,
        y + 66,
        metricWidth - 32
      );
    }
  });
  if (!landscape) {
    const summaryY = metricsY + 100;
    const summaryBottom = top + panelHeight - 28;
    drawEarthquakeObservationSummary(
      context,
      mapX,
      summaryY,
      mapWidth,
      Math.max(0, summaryBottom - summaryY),
      theme,
      payload.observations
    );
  }
}

function drawEarthquakeBulletinPanel(context, x, y, width, height, theme) {
  context.save();
  context.shadowColor = "rgba(0, 18, 38, 0.14)";
  context.shadowBlur = 18;
  context.shadowOffsetY = 8;
  roundedRect(context, x, y, width, height, 22);
  context.fillStyle = theme.panel;
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = theme.border;
  context.lineWidth = 1;
  context.stroke();
  context.restore();
}

function drawEarthquakeMap(context, box, theme, geoJson, coordinates, observations = []) {
  context.save();
  roundedRect(context, box.x, box.y, box.width, box.height, 12);
  context.clip();
  context.fillStyle = theme.background[0];
  context.fillRect(box.x, box.y, box.width, box.height);

  const observationPoints = observations
    .map((item) => item?.coordinates)
    .filter(isCoordinate);
  const bounds = calculateEarthquakeMapBounds(observationPoints, coordinates, box);
  const project = ([longitude, latitude]) => [
    box.x + ((longitude - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * box.width,
    box.y + ((bounds.maxLat - latitude) / (bounds.maxLat - bounds.minLat)) * box.height
  ];
  const geometries = Array.isArray(geoJson?.features)
    ? geoJson.features.map((feature) => feature?.geometry).filter(Boolean)
    : [];

  context.fillStyle = theme.panelSoft;
  context.strokeStyle = theme.border;
  context.lineWidth = Math.max(1, box.width / 420);
  geometries.forEach((geometry) => {
    const polygons = geometry.type === "Polygon"
      ? [geometry.coordinates]
      : (geometry.type === "MultiPolygon" ? geometry.coordinates : []);
    polygons.forEach((polygon) => {
      context.beginPath();
      polygon.forEach((ring) => {
        ring.forEach((point, index) => {
          const [x, y] = project(point);
          if (index === 0) context.moveTo(x, y);
          else context.lineTo(x, y);
        });
        context.closePath();
      });
      context.fill("evenodd");
      context.stroke();
    });
  });

  const longitude = Number(coordinates?.[0]);
  const latitude = Number(coordinates?.[1]);
  context.fillStyle = theme.text;
  context.font = `700 ${Math.max(13, box.width * 0.024)}px ${FONT_FAMILY}`;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText("各地の震度", box.x + 14, box.y + 12);

  sortEarthquakeObservationsForMap(observations).forEach((observation) => {
    if (!isCoordinate(observation?.coordinates)) return;
    const [x, y] = project(observation.coordinates);
    const radius = Math.max(5, Math.min(11, Math.min(box.width, box.height) * 0.022));
    context.fillStyle = observation.intensityColor || theme.accent;
    context.strokeStyle = "#ffffff";
    context.lineWidth = Math.max(1.5, radius * 0.22);
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = getReadableTextColor(observation.intensityColor || theme.accent);
    context.font = `800 ${Math.max(8, radius * 1.05)}px ${FONT_FAMILY}`;
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(String(observation.intensity ?? "--").replace(/^震度/u, ""), x, y + 0.5);
  });

  if (Number.isFinite(longitude) && Number.isFinite(latitude)) {
    const [x, y] = project([longitude, latitude]);
    const radius = Math.max(11, Math.min(box.width, box.height) * 0.04);
    context.strokeStyle = "#ffffff";
    context.lineWidth = Math.max(6, radius * 0.38);
    context.beginPath();
    context.moveTo(x - radius, y - radius);
    context.lineTo(x + radius, y + radius);
    context.moveTo(x + radius, y - radius);
    context.lineTo(x - radius, y + radius);
    context.stroke();
    context.strokeStyle = "#f43f35";
    context.lineWidth = Math.max(3, radius * 0.2);
    context.beginPath();
    context.moveTo(x - radius, y - radius);
    context.lineTo(x + radius, y + radius);
    context.moveTo(x + radius, y - radius);
    context.lineTo(x - radius, y + radius);
    context.stroke();

  }
  context.restore();
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
}

function calculateEarthquakeMapBounds(observationPoints, epicenter, box) {
  const points = [...observationPoints];
  if (isCoordinate(epicenter)) points.push(epicenter);
  if (!points.length) {
    return { minLon: 128, maxLon: 148, minLat: 28, maxLat: 46 };
  }
  let minLon = Math.min(...points.map((point) => Number(point[0])));
  let maxLon = Math.max(...points.map((point) => Number(point[0])));
  let minLat = Math.min(...points.map((point) => Number(point[1])));
  let maxLat = Math.max(...points.map((point) => Number(point[1])));
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  let lonSpan = Math.max(2.2, maxLon - minLon);
  let latSpan = Math.max(2, maxLat - minLat);
  lonSpan *= 1.42;
  latSpan *= 1.42;
  const targetAspect = box.width / box.height;
  const geographicAspect = lonSpan / latSpan;
  if (geographicAspect < targetAspect) lonSpan = latSpan * targetAspect;
  else latSpan = lonSpan / targetAspect;
  minLon = centerLon - lonSpan / 2;
  maxLon = centerLon + lonSpan / 2;
  minLat = centerLat - latSpan / 2;
  maxLat = centerLat + latSpan / 2;
  return { minLon, maxLon, minLat, maxLat };
}

function drawEarthquakeObservationSummary(context, x, y, width, height, theme, observations = []) {
  if (height < 28 || !observations.length) return;
  const groups = new Map();
  observations.forEach((observation) => {
    const key = String(observation.intensity ?? "--");
    const group = groups.get(key) ?? [];
    group.push(observation.name ?? "観測地点");
    groups.set(key, group);
  });
  const rows = [...groups.entries()]
    .sort(([intensityA], [intensityB]) => (
      getSocialShareIntensityRank(intensityB) - getSocialShareIntensityRank(intensityA)
    ))
    .slice(0, 4);
  const rowHeight = Math.min(27, height / (rows.length + 1));
  context.fillStyle = theme.muted;
  context.font = `700 ${Math.max(14, rowHeight * 0.62)}px ${FONT_FAMILY}`;
  context.fillText("各地の震度", x, y + rowHeight * 0.7);
  rows.forEach(([intensity, names], index) => {
    const rowY = y + rowHeight * (index + 1.7);
    const shownNames = names.slice(0, 4);
    const remainder = names.length - shownNames.length;
    const label = `震度${String(intensity).replace(/^震度/u, "")}  ${shownNames.join("・")}${remainder > 0 ? ` ほか${remainder}地点` : ""}`;
    context.fillStyle = theme.text;
    context.font = `600 ${Math.max(13, rowHeight * 0.57)}px ${FONT_FAMILY}`;
    drawFittedText(context, label, x, rowY, width);
  });
}

export function sortEarthquakeObservationsForMap(observations = []) {
  return [...observations].sort((observationA, observationB) => (
    getSocialShareIntensityRank(observationA?.intensity)
      - getSocialShareIntensityRank(observationB?.intensity)
  ));
}

function getSocialShareIntensityRank(value) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/^震度/u, "")
    .replace("弱", "-")
    .replace("強", "+");
  return getEarthquakeIntensityRank(normalized);
}

function isCoordinate(value) {
  return Array.isArray(value)
    && value.length >= 2
    && Number.isFinite(Number(value[0]))
    && Number.isFinite(Number(value[1]));
}

function drawPanel(context, x, y, width, height, theme) {
  context.save();
  context.shadowColor = "rgba(0,0,0,0.2)";
  context.shadowBlur = 28;
  context.shadowOffsetY = 12;
  roundedRect(context, x, y, width, height, 36);
  context.fillStyle = theme.panel;
  context.fill();
  context.shadowColor = "transparent";
  context.strokeStyle = theme.border;
  context.lineWidth = 2;
  context.stroke();
  context.restore();
}

function drawFooter(context, format, theme) {
  const padding = Math.round(format.width * 0.065);
  context.fillStyle = theme.muted;
  context.font = `600 ${format.height < 800 ? 18 : 22}px ${FONT_FAMILY}`;
  context.fillText("出典：気象庁", padding, format.height - 48);
  context.textAlign = "right";
  context.fillText("meteoscope.pages.dev", format.width - padding, format.height - 48);
  context.textAlign = "left";
}

function roundedRect(context, x, y, width, height, radius) {
  const safeRadius = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.roundRect(x, y, width, height, safeRadius);
}

function drawFittedText(context, value, x, y, maxWidth) {
  const text = String(value ?? "");
  if (context.measureText(text).width <= maxWidth) {
    context.fillText(text, x, y);
    return;
  }
  let shortened = text;
  while (shortened.length > 1 && context.measureText(`${shortened}…`).width > maxWidth) {
    shortened = shortened.slice(0, -1);
  }
  context.fillText(`${shortened}…`, x, y);
}

function getReadableTextColor(color) {
  const match = String(color ?? "").match(/^#([\da-f]{6})$/i);
  if (!match) return "#ffffff";
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return (red * 299 + green * 587 + blue * 114) / 1000 > 155 ? "#10243b" : "#ffffff";
}
