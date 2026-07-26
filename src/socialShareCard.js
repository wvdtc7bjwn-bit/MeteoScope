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
    accent: "#42c8ff",
    typhoonCenter: "#ffffff"
  },
  light: {
    background: ["#eaf4fc", "#d8eaf8"],
    panel: "#ffffff",
    panelSoft: "#edf6fc",
    text: "#142b44",
    muted: "#56718b",
    border: "#bfd4e6",
    accent: "#087fc1",
    typhoonCenter: "#000000"
  }
};

const FONT_FAMILY = '"Noto Sans JP", "Hiragino Sans", "Yu Gothic UI", sans-serif';

export function buildSocialShareFilename(payload, format = "portrait") {
  const type = getSocialShareType(payload);
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
  const type = getSocialShareType(payload);
  if (type === "earthquake" || type === "typhoon" || type === "warning") drawEarthquakeBackground(context, format, theme);
  else drawBackground(context, format, theme);
  drawBrand(context, format, theme, options.appIcon);

  if (type === "earthquake") {
    drawEarthquakeCard(context, format, theme, payload, options.japanGeoJson);
  } else if (type === "typhoon") {
    drawTyphoonCard(context, format, theme, payload, {
      japanGeoJson: options.japanGeoJson,
      worldLandGeoJson: options.worldLandGeoJson,
      worldCountriesGeoJson: options.worldCountriesGeoJson
    });
  } else if (type === "warning") {
    drawWarningCard(context, format, theme, payload ?? {}, options.warningMunicipalities);
  } else {
    drawAmedasCard(context, format, theme, payload ?? {});
  }
  drawFooter(context, format, theme);
}

function getSocialShareType(payload) {
  if (payload?.type === "earthquake") return "earthquake";
  if (payload?.type === "typhoon") return "typhoon";
  if (payload?.type === "warning") return "warning";
  return "amedas";
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

const WARNING_SHARE_LEVELS = Object.freeze({
  emergency: Object.freeze({ label: "特別警報", color: "#171717", text: "#ffffff", rank: 4 }),
  danger: Object.freeze({ label: "危険警報", color: "#a600a6", text: "#ffffff", rank: 3 }),
  high: Object.freeze({ label: "危険警報", color: "#a600a6", text: "#ffffff", rank: 3 }),
  warning: Object.freeze({ label: "警報", color: "#e8342f", text: "#ffffff", rank: 2 }),
  middle: Object.freeze({ label: "警報", color: "#e8342f", text: "#ffffff", rank: 2 }),
  advisory: Object.freeze({ label: "注意報", color: "#ffd400", text: "#172a3e", rank: 1 }),
  none: Object.freeze({ label: "発表なし", color: "#75889d", text: "#ffffff", rank: 0 })
});

function drawWarningCard(context, format, theme, payload, municipalities = []) {
  const landscape = format.height < 800;
  const padding = Math.round(format.width * 0.065);
  const top = landscape ? 130 : 150;
  const panelHeight = format.height - top - (landscape ? 92 : 145);
  const panelX = padding;
  const panelWidth = format.width - padding * 2;
  const inset = landscape ? 30 : 38;
  const warnings = [...(payload.warnings ?? [])].sort(
    (left, right) => getWarningShareLevel(right.level).rank - getWarningShareLevel(left.level).rank
  );
  const primary = getWarningShareLevel(warnings[0]?.level);

  drawEarthquakeBulletinPanel(context, panelX, top, panelWidth, panelHeight, theme);
  context.fillStyle = theme.accent;
  context.fillRect(panelX + inset, top + 32, 5, landscape ? 26 : 32);
  context.fillStyle = theme.text;
  context.font = `800 ${landscape ? 22 : 28}px ${FONT_FAMILY}`;
  context.fillText("現在地付近の警報・注意報", panelX + inset + 18, top + (landscape ? 55 : 59));
  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = `600 ${landscape ? 16 : 19}px ${FONT_FAMILY}`;
  context.fillText(formatWarningShareTime(payload.updatedAt), panelX + panelWidth - inset, top + 56);
  context.textAlign = "left";

  const headerBottom = top + (landscape ? 76 : 84);
  context.strokeStyle = theme.border;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(panelX + inset, headerBottom);
  context.lineTo(panelX + panelWidth - inset, headerBottom);
  context.stroke();

  const mapX = panelX + inset;
  const mapY = headerBottom + (landscape ? 14 : 18);
  const mapWidth = landscape
    ? Math.round((panelWidth - inset * 2) * 0.5)
    : panelWidth - inset * 2;
  const mapHeight = landscape
    ? panelHeight - (mapY - top) - 22
    : Math.min(420, Math.round(panelHeight * 0.43));
  drawWarningLocalMap(context, {
    x: mapX,
    y: mapY,
    width: mapWidth,
    height: mapHeight
  }, theme, payload, municipalities);

  const contentX = landscape ? mapX + mapWidth + 28 : mapX;
  const contentTop = landscape ? mapY : mapY + mapHeight + 24;
  const contentWidth = landscape
    ? panelX + panelWidth - inset - contentX
    : mapWidth;

  context.fillStyle = theme.text;
  context.font = `800 ${landscape ? 31 : 40}px ${FONT_FAMILY}`;
  drawFittedText(
    context,
    [payload.prefecture, payload.areaName].filter(Boolean).join(" ") || "地域を確認できません",
    contentX,
    contentTop + (landscape ? 35 : 44),
    contentWidth
  );

  const titleRuleY = contentTop + (landscape ? 48 : 60);
  context.strokeStyle = warnings.length ? primary.color : theme.border;
  context.lineWidth = landscape ? 3 : 4;
  context.beginPath();
  context.moveTo(contentX, titleRuleY);
  context.lineTo(contentX + contentWidth, titleRuleY);
  context.stroke();

  if (!warnings.length) {
    context.fillStyle = theme.text;
    context.font = `700 ${landscape ? 19 : 24}px ${FONT_FAMILY}`;
    context.fillText(
      "発表中の警報・注意報はありません",
      contentX,
      titleRuleY + (landscape ? 40 : 52)
    );
    return;
  }

  context.fillStyle = theme.muted;
  context.font = `700 ${landscape ? 15 : 18}px ${FONT_FAMILY}`;
  context.fillText(`${warnings.length}件発表中`, contentX, titleRuleY + (landscape ? 27 : 34));

  const listTop = titleRuleY + (landscape ? 42 : 52);
  const listBottom = top + panelHeight - (landscape ? 24 : 34);
  const availableHeight = Math.max(0, listBottom - listTop);
  const maxRows = landscape ? 5 : (format.height > 1200 ? 7 : 5);
  const visibleWarnings = warnings.slice(0, maxRows);
  const rowGap = 0;
  const rowHeight = Math.min(
    landscape ? 54 : 70,
    (availableHeight - rowGap * Math.max(0, visibleWarnings.length - 1)) / visibleWarnings.length
  );

  visibleWarnings.forEach((warning, index) => {
    const level = getWarningShareLevel(warning.level);
    const rowY = listTop + index * (rowHeight + rowGap);
    if (index > 0) {
      context.strokeStyle = theme.border;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(contentX, rowY);
      context.lineTo(contentX + contentWidth, rowY);
      context.stroke();
    }
    context.fillStyle = level.color;
    context.fillRect(contentX, rowY + rowHeight * 0.22, landscape ? 6 : 8, rowHeight * 0.56);

    context.fillStyle = theme.text;
    context.font = `800 ${landscape ? 19 : 24}px ${FONT_FAMILY}`;
    context.textBaseline = "middle";
    drawFittedText(
      context,
      warning.label ?? "警報・注意報",
      contentX + (landscape ? 20 : 26),
      rowY + rowHeight / 2,
      contentWidth - (landscape ? 120 : 150)
    );

    context.fillStyle = level.color;
    context.font = `800 ${landscape ? 15 : 18}px ${FONT_FAMILY}`;
    context.textAlign = "right";
    context.fillText(level.label, contentX + contentWidth, rowY + rowHeight / 2);
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
  });

  if (warnings.length > visibleWarnings.length) {
    context.fillStyle = theme.muted;
    context.font = `700 ${landscape ? 14 : 18}px ${FONT_FAMILY}`;
    context.textAlign = "right";
    context.fillText(
      `ほか ${warnings.length - visibleWarnings.length}件`,
      contentX + contentWidth,
      listBottom
    );
    context.textAlign = "left";
  }
}

function drawWarningLocalMap(context, box, theme, payload, municipalities) {
  context.save();
  roundedRect(context, box.x, box.y, box.width, box.height, 10);
  context.clip();
  context.fillStyle = theme.background[0];
  context.fillRect(box.x, box.y, box.width, box.height);

  const coordinates = isCoordinate(payload.coordinates)
    ? payload.coordinates.map(Number)
    : null;
  const currentArea = (municipalities ?? []).find(
    (municipality) => String(municipality.code) === String(payload.areaCode)
  );
  const center = coordinates
    ?? (isCoordinate(currentArea?.center) ? currentArea.center.map(Number) : [139.7, 35.7]);
  const bounds = calculateWarningMapBounds(center, box);
  const project = ([longitude, latitude]) => [
    box.x + ((Number(longitude) - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * box.width,
    box.y + ((bounds.maxLat - Number(latitude)) / (bounds.maxLat - bounds.minLat)) * box.height
  ];
  const visibleMunicipalities = (municipalities ?? []).filter(
    (municipality) => warningMunicipalityIntersectsBounds(municipality.bounds, bounds)
  );
  const warningsByAreaCode = new Map(
    (payload.areaWarnings ?? []).map((area) => [String(area.areaCode), area.warnings ?? []])
  );

  visibleMunicipalities.forEach((municipality) => {
    const areaWarnings = warningsByAreaCode.get(String(municipality.code)) ?? [];
    const areaLevel = getHighestWarningShareLevel(areaWarnings);
    const hasWarning = areaLevel.rank > 0;
    drawWarningMunicipalityGeometry(context, municipality.geometry, project, {
      fillStyle: hasWarning ? areaLevel.color : theme.panelSoft,
      fillAlpha: hasWarning ? 0.72 : 0.96,
      strokeStyle: hasWarning ? areaLevel.color : theme.border,
      lineWidth: hasWarning ? 1.8 : 1
    });
  });

  context.strokeStyle = theme.border;
  context.lineWidth = 1;
  roundedRect(context, box.x + 0.5, box.y + 0.5, box.width - 1, box.height - 1, 10);
  context.stroke();

  if (coordinates) {
    const [x, y] = project(coordinates);
    context.fillStyle = theme.text;
    context.beginPath();
    context.arc(x, y, 7, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = theme.background[0];
    context.lineWidth = 2.5;
    context.stroke();
  }

  drawWarningMapLegend(context, box, theme);
  context.restore();
  context.textBaseline = "alphabetic";
}

function getHighestWarningShareLevel(warnings = []) {
  return warnings.reduce((highest, warning) => {
    const level = getWarningShareLevel(warning?.level);
    return level.rank > highest.rank ? level : highest;
  }, WARNING_SHARE_LEVELS.none);
}

function drawWarningMapLegend(context, box, theme) {
  const items = [
    WARNING_SHARE_LEVELS.danger,
    WARNING_SHARE_LEVELS.warning,
    WARNING_SHARE_LEVELS.advisory
  ];
  const fontSize = Math.max(11, Math.min(15, box.width * 0.018));
  const itemWidth = Math.max(80, box.width * 0.16);
  const width = itemWidth * items.length + 20;
  const height = fontSize + 20;
  const x = box.x + box.width - width - 10;
  const y = box.y + box.height - height - 10;
  roundedRect(context, x, y, width, height, 6);
  context.save();
  context.globalAlpha = 0.9;
  context.fillStyle = theme.panel;
  context.fill();
  context.restore();
  context.font = `700 ${fontSize}px ${FONT_FAMILY}`;
  context.textBaseline = "middle";
  items.forEach((item, index) => {
    const itemX = x + 10 + index * itemWidth;
    context.fillStyle = item.color;
    context.fillRect(itemX, y + 9, 18, height - 18);
    context.fillStyle = theme.text;
    context.fillText(item.label, itemX + 25, y + height / 2);
  });
}

function calculateWarningMapBounds([longitude, latitude], box) {
  const latSpan = box.height < 300 ? 0.38 : 0.42;
  const latitudeScale = Math.max(0.45, Math.cos(Number(latitude) * Math.PI / 180));
  const lonSpan = (latSpan * (box.width / box.height)) / latitudeScale;
  return {
    minLon: Number(longitude) - lonSpan / 2,
    maxLon: Number(longitude) + lonSpan / 2,
    minLat: Number(latitude) - latSpan / 2,
    maxLat: Number(latitude) + latSpan / 2
  };
}

function warningMunicipalityIntersectsBounds(candidate, bounds) {
  return candidate
    && candidate.maxLng >= bounds.minLon
    && candidate.minLng <= bounds.maxLon
    && candidate.maxLat >= bounds.minLat
    && candidate.minLat <= bounds.maxLat;
}

function drawWarningMunicipalityGeometry(context, geometry, project, options) {
  const polygons = geometry?.type === "Polygon"
    ? [geometry.coordinates]
    : (geometry?.type === "MultiPolygon" ? geometry.coordinates : []);
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
    context.save();
    context.globalAlpha = options.fillAlpha;
    context.fillStyle = options.fillStyle;
    context.fill("evenodd");
    context.restore();
    context.strokeStyle = options.strokeStyle;
    context.lineWidth = options.lineWidth;
    context.stroke();
  });
}

function getWarningShareLevel(level) {
  return WARNING_SHARE_LEVELS[level] ?? WARNING_SHARE_LEVELS.none;
}

function formatWarningShareTime(value) {
  const text = String(value ?? "").trim();
  if (!text) return "更新時刻 未取得";
  const isoMatch = text.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})[T ](\d{1,2}):(\d{2})/u);
  if (isoMatch) {
    return `更新 ${isoMatch[2].padStart(2, "0")}/${isoMatch[3].padStart(2, "0")} ${isoMatch[4].padStart(2, "0")}:${isoMatch[5]}`;
  }
  const match = text.match(/(?:\d{4}\/)?(\d{1,2}\/\d{1,2})\s+(\d{1,2}:\d{2})/u);
  return match ? `更新 ${match[1]} ${match[2]}` : `更新 ${text}`;
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

function drawTyphoonCard(context, format, theme, payload, mapData) {
  const landscape = format.height < 800;
  const padding = Math.round(format.width * 0.065);
  const top = landscape ? 130 : 150;
  const panelHeight = format.height - top - (landscape ? 92 : 145);
  const panelX = padding;
  const panelWidth = format.width - padding * 2;
  const inset = landscape ? 30 : 38;
  drawEarthquakeBulletinPanel(context, panelX, top, panelWidth, panelHeight, theme);

  context.fillStyle = theme.accent;
  context.fillRect(panelX + inset, top + 30, 5, landscape ? 27 : 32);
  context.fillStyle = theme.text;
  context.font = `800 ${landscape ? 21 : 27}px ${FONT_FAMILY}`;
  context.fillText("台風情報", panelX + inset + 18, top + (landscape ? 52 : 57));
  context.textAlign = "right";
  context.fillStyle = theme.muted;
  context.font = `600 ${landscape ? 16 : 20}px ${FONT_FAMILY}`;
  drawFittedText(
    context,
    payload.updatedAt ?? "--",
    panelX + panelWidth - inset,
    top + (landscape ? 52 : 56),
    landscape ? 360 : 430
  );
  context.textAlign = "left";

  const headerBottom = top + (landscape ? 72 : 82);
  context.strokeStyle = theme.border;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(panelX + inset, headerBottom);
  context.lineTo(panelX + panelWidth - inset, headerBottom);
  context.stroke();

  const mapX = panelX + inset;
  const mapY = headerBottom + (landscape ? 18 : 22);
  const mapWidth = landscape
    ? Math.round((panelWidth - inset * 2 - 30) * 0.6)
    : panelWidth - inset * 2;
  const mapHeight = landscape
    ? panelHeight - (mapY - top) - 24
    : (format.height > 1200 ? 650 : 410);
  drawTyphoonMap(context, {
    x: mapX,
    y: mapY,
    width: mapWidth,
    height: mapHeight
  }, theme, mapData, payload);

  const contentX = landscape ? mapX + mapWidth + 30 : mapX;
  const contentY = landscape ? mapY : mapY + mapHeight + 26;
  const contentWidth = landscape
    ? panelX + panelWidth - inset - contentX
    : mapWidth;
  const status = String(payload.transitionStatus ?? "").trim();
  const classifications = [payload.size, payload.strength]
    .map((value) => String(value ?? "").trim())
    .filter((value) => value && value !== "-");
  const subline = status || classifications.join("・") || "解析情報";
  drawTyphoonHeadline(
    context,
    contentX,
    contentY,
    contentWidth,
    payload.name ?? "台風",
    subline,
    theme,
    landscape
  );

  const metricTop = contentY + (landscape ? 104 : 112);
  const metrics = [
    ["中心気圧", payload.pressure ?? "-"],
    ["最大風速", payload.maxWind ?? "-"],
    ["最大瞬間風速", payload.maxGust ?? "-"],
    ["移動", payload.movement ?? "-"]
  ];
  drawTyphoonMetricGrid(context, contentX, metricTop, contentWidth, metrics, theme, landscape);
}

function drawTyphoonHeadline(context, x, y, width, name, status, theme, landscape) {
  context.fillStyle = theme.accent;
  context.font = `800 ${landscape ? 13 : 16}px ${FONT_FAMILY}`;
  context.fillText("気象庁発表", x, y + (landscape ? 16 : 18));

  context.fillStyle = theme.text;
  context.font = `800 ${landscape ? 30 : 39}px ${FONT_FAMILY}`;
  drawFittedText(context, name, x, y + (landscape ? 54 : 61), width);

  context.fillStyle = theme.muted;
  context.font = `600 ${landscape ? 15 : 19}px ${FONT_FAMILY}`;
  drawFittedText(context, status, x, y + (landscape ? 82 : 92), width);
}

function drawTyphoonMetricGrid(context, x, y, width, metrics, theme, landscape) {
  const columnCount = landscape ? 2 : 4;
  const rowCount = landscape ? 2 : 1;
  const height = landscape ? 134 : 104;
  const columnWidth = width / columnCount;
  const rowHeight = height / rowCount;

  roundedRect(context, x, y, width, height, 14);
  context.fillStyle = theme.panelSoft;
  context.fill();
  context.strokeStyle = theme.border;
  context.lineWidth = 1;
  context.stroke();

  context.beginPath();
  for (let column = 1; column < columnCount; column += 1) {
    const lineX = x + columnWidth * column;
    context.moveTo(lineX, y + 14);
    context.lineTo(lineX, y + height - 14);
  }
  if (landscape) {
    context.moveTo(x + 14, y + rowHeight);
    context.lineTo(x + width - 14, y + rowHeight);
  }
  context.stroke();

  metrics.forEach(([label, value], index) => {
    const column = index % columnCount;
    const row = Math.floor(index / columnCount);
    const boxX = x + column * columnWidth;
    const boxY = y + row * rowHeight;
    context.fillStyle = theme.muted;
    context.font = `700 ${landscape ? 12 : 15}px ${FONT_FAMILY}`;
    context.fillText(label, boxX + 15, boxY + (landscape ? 22 : 30));
    context.fillStyle = theme.text;
    context.font = `800 ${landscape ? 18 : 23}px ${FONT_FAMILY}`;
    drawFittedText(
      context,
      value,
      boxX + 15,
      boxY + (landscape ? 50 : 69),
      columnWidth - 30
    );
  });
}

function drawTyphoonMap(context, box, theme, mapData, payload) {
  context.save();
  roundedRect(context, box.x, box.y, box.width, box.height, 12);
  context.clip();
  context.fillStyle = theme.background[0];
  context.fillRect(box.x, box.y, box.width, box.height);

  const track = Array.isArray(payload.track) ? payload.track.filter(isCoordinate) : [];
  const forecastTrack = Array.isArray(payload.forecastTrack)
    ? payload.forecastTrack.filter(isCoordinate)
    : [];
  const forecastCenters = Array.isArray(payload.forecastCircles)
    ? payload.forecastCircles.map((item) => item?.center).filter(isCoordinate)
    : [];
  const center = isCoordinate(payload.center) ? payload.center : null;
  const forecastLine = buildTyphoonForecastLine(center, forecastTrack, forecastCenters);
  const strongWindCenter = isCoordinate(payload.strongWindCenter)
    ? payload.strongWindCenter
    : center;
  const stormCenter = isCoordinate(payload.stormCenter)
    ? payload.stormCenter
    : center;
  const extentPoints = [
    ...track,
    ...forecastLine,
    ...forecastCenters,
    ...(center ? [center] : [])
  ];
  appendTyphoonRadiusExtentPoints(extentPoints, strongWindCenter, payload.strongWindRadius);
  appendTyphoonRadiusExtentPoints(extentPoints, stormCenter, payload.stormRadius);
  (payload.forecastCircles ?? []).forEach((forecast) => {
    appendTyphoonRadiusExtentPoints(extentPoints, forecast?.center, forecast?.radius);
  });
  const bounds = calculateTyphoonMapBounds(extentPoints, box);
  const project = ([longitude, latitude]) => [
    box.x + ((Number(longitude) - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * box.width,
    box.y + ((bounds.maxLat - Number(latitude)) / (bounds.maxLat - bounds.minLat)) * box.height
  ];

  drawTyphoonGeoJson(context, mapData?.worldLandGeoJson, project, bounds, {
    fillStyle: theme.panelSoft,
    strokeStyle: theme.border,
    lineWidth: Math.max(0.8, box.width / 620),
    fill: true
  });
  drawTyphoonGeoJson(context, mapData?.worldCountriesGeoJson, project, bounds, {
    strokeStyle: theme.muted,
    lineWidth: Math.max(0.8, box.width / 700)
  });
  drawTyphoonGeoJson(context, mapData?.japanGeoJson, project, bounds, {
    strokeStyle: theme.text,
    lineWidth: Math.max(1, box.width / 520)
  });

  drawTyphoonRadiusArea(context, strongWindCenter, payload.strongWindRadius, project, {
    fillStyle: "rgba(250, 204, 21, 0.18)",
    strokeStyle: "#facc15",
    lineWidth: Math.max(2, box.width / 280)
  });
  drawTyphoonRadiusArea(context, stormCenter, payload.stormRadius, project, {
    fillStyle: "rgba(239, 68, 68, 0.22)",
    strokeStyle: "#ef4444",
    lineWidth: Math.max(2, box.width / 260)
  });
  (payload.forecastCircles ?? []).forEach((forecast) => {
    drawTyphoonRadiusArea(context, forecast?.center, forecast?.radius, project, {
      fillStyle: "rgba(0, 0, 0, 0)",
      strokeStyle: theme.text,
      lineWidth: Math.max(1.5, box.width / 350),
      dash: [Math.max(5, box.width / 90), Math.max(4, box.width / 115)]
    });
  });
  drawTyphoonForecastEnvelope(
    context,
    center,
    payload.forecastCircles,
    project,
    box,
    theme.text
  );

  drawTyphoonTrack(context, track, project, theme.muted, [], Math.max(2, box.width / 250));
  drawTyphoonTrack(
    context,
    forecastLine,
    project,
    theme.text,
    [Math.max(6, box.width / 65), Math.max(5, box.width / 85)],
    Math.max(2, box.width / 220)
  );

  (payload.forecastCircles ?? []).forEach((forecast, index) => {
    if (!isCoordinate(forecast?.center)) return;
    const [pointX, pointY] = project(forecast.center);
    const radius = Math.max(2.5, Math.min(4.5, Math.min(box.width, box.height) * 0.009));
    context.fillStyle = theme.text;
    context.beginPath();
    context.arc(pointX, pointY, radius, 0, Math.PI * 2);
    context.fill();
    if (!forecast.label || (index > 0 && index < payload.forecastCircles.length - 1)) return;
    context.fillStyle = theme.text;
    context.font = `700 ${Math.max(12, box.width * 0.022)}px ${FONT_FAMILY}`;
    context.textAlign = "center";
    context.textBaseline = "bottom";
    context.fillText(String(forecast.label), pointX, pointY - radius - 5);
  });

  if (center) {
    const [pointX, pointY] = project(center);
    const markerSize = Math.max(6, Math.min(10, Math.min(box.width, box.height) * 0.024));
    context.lineCap = "round";
    context.beginPath();
    context.moveTo(pointX - markerSize, pointY - markerSize);
    context.lineTo(pointX + markerSize, pointY + markerSize);
    context.moveTo(pointX + markerSize, pointY - markerSize);
    context.lineTo(pointX - markerSize, pointY + markerSize);
    context.strokeStyle = "rgba(8, 24, 43, 0.82)";
    context.lineWidth = Math.max(4, markerSize * 0.56);
    context.stroke();
    context.strokeStyle = theme.typhoonCenter;
    context.lineWidth = Math.max(2, markerSize * 0.28);
    context.stroke();
  }

  context.fillStyle = theme.text;
  context.font = `700 ${Math.max(13, box.width * 0.024)}px ${FONT_FAMILY}`;
  context.textAlign = "left";
  context.textBaseline = "top";
  context.fillText("進路・風域", box.x + 14, box.y + 12);
  drawTyphoonMapLegend(context, box, theme, {
    hasStrongWindArea: Number(payload.strongWindRadius) > 0,
    hasStormArea: Number(payload.stormRadius) > 0,
    hasForecastCircles: (payload.forecastCircles ?? []).some((forecast) => Number(forecast?.radius) > 0)
  });
  context.restore();
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
}

function buildTyphoonForecastLine(center, forecastTrack, forecastCenters) {
  const points = (forecastTrack.length >= 2 ? forecastTrack : forecastCenters)
    .filter(isCoordinate)
    .map((point) => [Number(point[0]), Number(point[1])]);
  if (center && !sameTyphoonCoordinate(center, points[0])) {
    points.unshift([Number(center[0]), Number(center[1])]);
  }
  return points.filter((point, index) => (
    index === 0 || !sameTyphoonCoordinate(point, points[index - 1])
  ));
}

function sameTyphoonCoordinate(first, second) {
  if (!isCoordinate(first) || !isCoordinate(second)) return false;
  return Math.abs(Number(first[0]) - Number(second[0])) < 0.0001
    && Math.abs(Number(first[1]) - Number(second[1])) < 0.0001;
}

function drawTyphoonForecastEnvelope(
  context,
  center,
  forecastCircles,
  project,
  box,
  color
) {
  const circles = (forecastCircles ?? [])
    .filter((forecast) => isCoordinate(forecast?.center) && Number(forecast?.radius) > 0)
    .map((forecast) => ({
      center: forecast.center,
      radius: Number(forecast.radius)
    }));
  if (!circles.length) return;
  const nodes = center && !sameTyphoonCoordinate(center, circles[0]?.center)
    ? [{ center, radius: 0 }, ...circles]
    : circles;
  if (nodes.length < 2) return;

  context.save();
  context.strokeStyle = color;
  context.lineWidth = Math.max(1.5, box.width / 330);
  context.lineJoin = "round";
  context.lineCap = "round";
  context.setLineDash([]);
  for (let index = 1; index < nodes.length; index += 1) {
    const previous = nodes[index - 1];
    const current = nodes[index];
    const previousCircle = getTyphoonProjectedCircle(previous.center, previous.radius, project);
    const currentCircle = getTyphoonProjectedCircle(current.center, current.radius, project);
    const tangents = calculateTyphoonCircleTangents(previousCircle, currentCircle);
    if (!tangents.length) continue;
    context.beginPath();
    tangents.forEach(([start, end]) => {
      context.moveTo(start.x, start.y);
      context.lineTo(end.x, end.y);
    });
    context.stroke();
  }
  context.restore();
}

export function calculateTyphoonCircleTangents(circleA, circleB) {
  const deltaX = circleB.x - circleA.x;
  const deltaY = circleB.y - circleA.y;
  const distanceSquared = deltaX * deltaX + deltaY * deltaY;
  const radiusDifference = circleA.radius - circleB.radius;
  const tangentSquared = distanceSquared - radiusDifference * radiusDifference;
  if (distanceSquared <= 0 || tangentSquared <= 0) return [];

  const tangentLength = Math.sqrt(tangentSquared);
  return [-1, 1].map((side) => {
    const normalX = (
      deltaX * radiusDifference - side * deltaY * tangentLength
    ) / distanceSquared;
    const normalY = (
      deltaY * radiusDifference + side * deltaX * tangentLength
    ) / distanceSquared;
    return [
      {
        x: circleA.x + normalX * circleA.radius,
        y: circleA.y + normalY * circleA.radius
      },
      {
        x: circleB.x + normalX * circleB.radius,
        y: circleB.y + normalY * circleB.radius
      }
    ];
  });
}

function drawTyphoonGeoJson(context, geoJson, project, bounds, options = {}) {
  if (!geoJson?.features?.length) return;
  context.save();
  context.fillStyle = options.fillStyle ?? "transparent";
  context.strokeStyle = options.strokeStyle ?? "transparent";
  context.lineWidth = options.lineWidth ?? 1;
  context.lineJoin = "round";
  context.lineCap = "round";
  (geoJson.features ?? []).forEach((feature) => {
    const geometry = feature?.geometry;
    const polygons = geometry?.type === "Polygon"
      ? [geometry.coordinates]
      : (geometry?.type === "MultiPolygon" ? geometry.coordinates : []);
    polygons.forEach((polygon) => {
      if (!typhoonPolygonIntersectsBounds(polygon, bounds)) return;
      context.beginPath();
      polygon.forEach((ring) => {
        ring.forEach((point, index) => {
          if (!isCoordinate(point)) return;
          const [pointX, pointY] = project(point);
          if (index === 0) context.moveTo(pointX, pointY);
          else context.lineTo(pointX, pointY);
        });
        context.closePath();
      });
      if (options.fill) context.fill("evenodd");
      context.stroke();
    });
  });
  context.restore();
}

function typhoonPolygonIntersectsBounds(polygon, bounds) {
  let minLon = Number.POSITIVE_INFINITY;
  let maxLon = Number.NEGATIVE_INFINITY;
  let minLat = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  (polygon ?? []).forEach((ring) => {
    (ring ?? []).forEach((point) => {
      if (!isCoordinate(point)) return;
      minLon = Math.min(minLon, Number(point[0]));
      maxLon = Math.max(maxLon, Number(point[0]));
      minLat = Math.min(minLat, Number(point[1]));
      maxLat = Math.max(maxLat, Number(point[1]));
    });
  });
  if (!Number.isFinite(minLon)) return false;
  return maxLon >= bounds.minLon
    && minLon <= bounds.maxLon
    && maxLat >= bounds.minLat
    && minLat <= bounds.maxLat;
}

function drawTyphoonMapLegend(context, box, theme, visibility) {
  const items = [
    visibility.hasStrongWindArea ? { label: "強風域", color: "#facc15", dash: [] } : null,
    visibility.hasStormArea ? { label: "暴風域", color: "#ef4444", dash: [] } : null,
    visibility.hasForecastCircles ? { label: "予報円", color: theme.text, dash: [5, 4] } : null
  ].filter(Boolean);
  if (!items.length) return;
  const fontSize = Math.max(11, Math.min(16, box.width * 0.02));
  const itemWidth = Math.max(68, box.width * 0.13);
  const width = itemWidth * items.length + 20;
  const height = fontSize + 22;
  const x = box.x + box.width - width - 12;
  const y = box.y + box.height - height - 10;
  roundedRect(context, x, y, width, height, 8);
  context.fillStyle = theme.panel;
  context.globalAlpha = 0.88;
  context.fill();
  context.globalAlpha = 1;
  context.font = `700 ${fontSize}px ${FONT_FAMILY}`;
  context.textAlign = "left";
  context.textBaseline = "middle";
  items.forEach((item, index) => {
    const itemX = x + 10 + index * itemWidth;
    const centerY = y + height / 2;
    context.save();
    context.strokeStyle = item.color;
    context.lineWidth = 3;
    context.setLineDash(item.dash);
    context.beginPath();
    context.moveTo(itemX, centerY);
    context.lineTo(itemX + 20, centerY);
    context.stroke();
    context.restore();
    context.fillStyle = theme.text;
    context.fillText(item.label, itemX + 27, centerY);
  });
}

function drawTyphoonRadiusArea(context, center, radiusKm, project, options = {}) {
  const radius = Number(radiusKm);
  if (!isCoordinate(center) || !Number.isFinite(radius) || radius <= 0) return;
  const projectedCircle = getTyphoonProjectedCircle(center, radius, project);
  if (!(projectedCircle.radius > 0)) return;
  context.save();
  context.fillStyle = options.fillStyle ?? "transparent";
  context.strokeStyle = options.strokeStyle ?? "#ffffff";
  context.lineWidth = options.lineWidth ?? 2;
  context.setLineDash(options.dash ?? []);
  context.beginPath();
  context.arc(
    projectedCircle.x,
    projectedCircle.y,
    projectedCircle.radius,
    0,
    Math.PI * 2
  );
  context.fill();
  context.stroke();
  context.restore();
}

function getTyphoonProjectedCircle(center, radiusKm, project) {
  const [centerX, centerY] = project(center);
  if (!(Number(radiusKm) > 0)) return { x: centerX, y: centerY, radius: 0 };
  const eastEdge = project(destinationPointForTyphoonCard(center, Number(radiusKm), 90));
  return {
    x: centerX,
    y: centerY,
    radius: Math.hypot(eastEdge[0] - centerX, eastEdge[1] - centerY)
  };
}

function appendTyphoonRadiusExtentPoints(points, center, radiusKm) {
  const radius = Number(radiusKm);
  if (!isCoordinate(center) || !Number.isFinite(radius) || radius <= 0) return;
  [0, 90, 180, 270].forEach((bearing) => {
    points.push(destinationPointForTyphoonCard(center, radius, bearing));
  });
}

function destinationPointForTyphoonCard([longitude, latitude], distanceKm, bearingDegrees) {
  const earthRadiusKm = 6371.0088;
  const angularDistance = distanceKm / earthRadiusKm;
  const bearing = bearingDegrees * Math.PI / 180;
  const latitudeRadians = latitude * Math.PI / 180;
  const longitudeRadians = longitude * Math.PI / 180;
  const destinationLatitude = Math.asin(
    Math.sin(latitudeRadians) * Math.cos(angularDistance)
    + Math.cos(latitudeRadians) * Math.sin(angularDistance) * Math.cos(bearing)
  );
  const destinationLongitude = longitudeRadians + Math.atan2(
    Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitudeRadians),
    Math.cos(angularDistance) - Math.sin(latitudeRadians) * Math.sin(destinationLatitude)
  );
  return [
    ((destinationLongitude * 180 / Math.PI + 540) % 360) - 180,
    destinationLatitude * 180 / Math.PI
  ];
}

function drawTyphoonTrack(context, points, project, color, dash, width) {
  if (points.length < 2) return;
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.lineJoin = "round";
  context.lineCap = "round";
  context.setLineDash(dash);
  context.beginPath();
  points.forEach((point, index) => {
    const [pointX, pointY] = project(point);
    if (index === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  });
  context.stroke();
  context.restore();
}

function calculateTyphoonMapBounds(points, box) {
  const validPoints = points.filter(isCoordinate);
  if (!validPoints.length) {
    return { minLon: 118, maxLon: 152, minLat: 18, maxLat: 48 };
  }
  let minLon = Math.min(...validPoints.map((point) => Number(point[0])));
  let maxLon = Math.max(...validPoints.map((point) => Number(point[0])));
  let minLat = Math.min(...validPoints.map((point) => Number(point[1])));
  let maxLat = Math.max(...validPoints.map((point) => Number(point[1])));
  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  let lonSpan = Math.max(8, maxLon - minLon) * 1.34;
  let latSpan = Math.max(7, maxLat - minLat) * 1.34;
  const targetAspect = box.width / box.height;
  if (lonSpan / latSpan < targetAspect) lonSpan = latSpan * targetAspect;
  else latSpan = lonSpan / targetAspect;
  minLon = centerLon - lonSpan / 2;
  maxLon = centerLon + lonSpan / 2;
  minLat = centerLat - latSpan / 2;
  maxLat = centerLat + latSpan / 2;
  return { minLon, maxLon, minLat, maxLat };
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
