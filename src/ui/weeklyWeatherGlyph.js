// 気象庁「天気予報」ページの Forecast.Const.TELOPS に掲載されている
// WeatherCode 全118種。XMLのWeather本文が空でもコードだけで描画できるようにする。
export const JMA_WEEKLY_WEATHER_LABELS = Object.freeze({
  100: "晴",
  101: "晴時々曇",
  102: "晴一時雨",
  103: "晴時々雨",
  104: "晴一時雪",
  105: "晴時々雪",
  106: "晴一時雨か雪",
  107: "晴時々雨か雪",
  108: "晴一時雨か雷雨",
  110: "晴後時々曇",
  111: "晴後曇",
  112: "晴後一時雨",
  113: "晴後時々雨",
  114: "晴後雨",
  115: "晴後一時雪",
  116: "晴後時々雪",
  117: "晴後雪",
  118: "晴後雨か雪",
  119: "晴後雨か雷雨",
  120: "晴朝夕一時雨",
  121: "晴朝の内一時雨",
  122: "晴夕方一時雨",
  123: "晴山沿い雷雨",
  124: "晴山沿い雪",
  125: "晴午後は雷雨",
  126: "晴昼頃から雨",
  127: "晴夕方から雨",
  128: "晴夜は雨",
  130: "朝の内霧後晴",
  131: "晴明け方霧",
  132: "晴朝夕曇",
  140: "晴時々雨で雷を伴う",
  160: "晴一時雪か雨",
  170: "晴時々雪か雨",
  181: "晴後雪か雨",
  200: "曇",
  201: "曇時々晴",
  202: "曇一時雨",
  203: "曇時々雨",
  204: "曇一時雪",
  205: "曇時々雪",
  206: "曇一時雨か雪",
  207: "曇時々雨か雪",
  208: "曇一時雨か雷雨",
  209: "霧",
  210: "曇後時々晴",
  211: "曇後晴",
  212: "曇後一時雨",
  213: "曇後時々雨",
  214: "曇後雨",
  215: "曇後一時雪",
  216: "曇後時々雪",
  217: "曇後雪",
  218: "曇後雨か雪",
  219: "曇後雨か雷雨",
  220: "曇朝夕一時雨",
  221: "曇朝の内一時雨",
  222: "曇夕方一時雨",
  223: "曇日中時々晴",
  224: "曇昼頃から雨",
  225: "曇夕方から雨",
  226: "曇夜は雨",
  228: "曇昼頃から雪",
  229: "曇夕方から雪",
  230: "曇夜は雪",
  231: "曇海上海岸は霧か霧雨",
  240: "曇時々雨で雷を伴う",
  250: "曇時々雪で雷を伴う",
  260: "曇一時雪か雨",
  270: "曇時々雪か雨",
  281: "曇後雪か雨",
  300: "雨",
  301: "雨時々晴",
  302: "雨時々止む",
  303: "雨時々雪",
  304: "雨か雪",
  306: "大雨",
  308: "雨で暴風を伴う",
  309: "雨一時雪",
  311: "雨後晴",
  313: "雨後曇",
  314: "雨後時々雪",
  315: "雨後雪",
  316: "雨か雪後晴",
  317: "雨か雪後曇",
  320: "朝の内雨後晴",
  321: "朝の内雨後曇",
  322: "雨朝晩一時雪",
  323: "雨昼頃から晴",
  324: "雨夕方から晴",
  325: "雨夜は晴",
  326: "雨夕方から雪",
  327: "雨夜は雪",
  328: "雨一時強く降る",
  329: "雨一時みぞれ",
  340: "雪か雨",
  350: "雨で雷を伴う",
  361: "雪か雨後晴",
  371: "雪か雨後曇",
  400: "雪",
  401: "雪時々晴",
  402: "雪時々止む",
  403: "雪時々雨",
  405: "大雪",
  406: "風雪強い",
  407: "暴風雪",
  409: "雪一時雨",
  411: "雪後晴",
  413: "雪後曇",
  414: "雪後雨",
  420: "朝の内雪後晴",
  421: "朝の内雪後曇",
  422: "雪昼頃から雨",
  423: "雪夕方から雨",
  425: "雪一時強く降る",
  426: "雪後みぞれ",
  427: "雪一時みぞれ",
  450: "雪で雷を伴う"
});

const OFFICIAL_WEATHER_CODES = new Set(Object.keys(JMA_WEEKLY_WEATHER_LABELS));

export function isSupportedJmaWeeklyWeatherCode(weatherCode) {
  return OFFICIAL_WEATHER_CODES.has(normalizeWeatherCode(weatherCode));
}

export function getJmaWeeklyWeatherLabel(weatherCode) {
  return JMA_WEEKLY_WEATHER_LABELS[normalizeWeatherCode(weatherCode)] || "";
}

export function classifyWeeklyWeatherGlyph(weatherCode, weatherText = "") {
  const normalizedCode = normalizeWeatherCode(weatherCode);
  const code = Number.parseInt(normalizedCode, 10);
  const officialLabel = JMA_WEEKLY_WEATHER_LABELS[normalizedCode] || "";
  const suppliedText = String(weatherText ?? "").replace(/\s+/gu, "");
  const text = suppliedText || officialLabel;
  const features = new Set();
  const hasSleetText = /(?:みぞれ|霙)/u.test(text);

  if (/晴/u.test(text)) features.add("sun");
  if (/(?:曇|くもり)/u.test(text)) features.add("cloud");
  if (/雨/u.test(text)) features.add("rain");
  if (/雪/u.test(text)) features.add("snow");
  if (hasSleetText) features.add("sleet");
  if (/雷/u.test(text)) features.add("thunder");
  if (/霧/u.test(text)) features.add("fog");

  let stormType = "";
  if (/(?:暴風雪|風雪|吹雪)/u.test(text)) {
    stormType = "snow";
    features.add("snow");
  } else if (/(?:暴風雨|雨で暴風|嵐|大荒れ)/u.test(text)) {
    stormType = "rain";
    features.add("rain");
  } else if (/(?:暴風|強風)/u.test(text)) {
    stormType = features.has("sleet") ? "sleet" : features.has("snow") ? "snow" : "rain";
    features.add(stormType);
  }

  if (!features.size && Number.isFinite(code)) {
    if (code >= 400 && code < 500) features.add("snow");
    else if (code >= 300 && code < 400) features.add("rain");
    else if (code >= 200 && code < 300) features.add("cloud");
    else if (code >= 100 && code < 200) features.add("sun");
  }
  if (!features.size) features.add("cloud");
  const primaryFeature = findPrimaryWeatherFeature(text, features);

  return {
    features: [...features],
    stormType,
    primaryFeature,
    weatherCode: normalizedCode,
    officialLabel,
    isOfficialCode: Boolean(officialLabel),
    kind: stormType
      ? `storm-${stormType}`
      : [...features].sort().join("-")
  };
}

export function renderWeeklyWeatherGlyph(weatherCode, weatherText = "") {
  const glyph = classifyWeeklyWeatherGlyph(weatherCode, weatherText);
  const features = new Set(glyph.features);
  const code = /^\d{3}$/u.test(String(weatherCode ?? "")) ? String(weatherCode) : "";
  const hasHeavyRain = code === "306" || code === "328";
  const hasHeavySnow = code === "405" || code === "425";
  const relationshipText = String(weatherText || glyph.officialLabel || "").replace(/\s+/gu, "");
  const relationshipMode = /(?:のち|後)/u.test(relationshipText)
    ? "then"
    : /(?:時々|一時)/u.test(relationshipText)
      ? "intermittent"
      : "";
  const relationshipFeatures = ["sun", "cloud", "rain", "snow"]
    .filter((feature) => features.has(feature));
  const relationshipPrimary = relationshipFeatures.includes(glyph.primaryFeature)
    ? glyph.primaryFeature
    : relationshipFeatures[0];
  const relationshipSecondary = relationshipFeatures
    .find((feature) => feature !== relationshipPrimary);
  const layers = [];

  if (glyph.stormType) {
    layers.push(renderStorm(glyph.stormType, features.has("thunder")));
  } else if (
    relationshipMode
    && relationshipFeatures.length === 2
    && relationshipPrimary
    && relationshipSecondary
    && !features.has("fog")
    && !features.has("sleet")
  ) {
    layers.push(renderWeatherRelationship(
      relationshipPrimary,
      relationshipSecondary,
      relationshipMode
    ));
    if (features.has("thunder")) layers.push(renderThunder());
  } else if (features.has("fog") && !features.has("rain") && !features.has("snow")) {
    if (features.has("sun")) layers.push(renderSun(32, 22, 9));
    layers.push(renderFog());
  } else {
    const hasPrecipitation = features.has("rain")
      || features.has("snow")
      || features.has("sleet");
    const hasCloudBase = features.has("cloud") || features.has("thunder");
    const sunIsPrimary = glyph.primaryFeature === "sun";
    const sunLayer = features.has("sun")
      ? renderSun(
        hasCloudBase && sunIsPrimary ? 37 : hasCloudBase ? 31 : 48,
        hasCloudBase && sunIsPrimary ? 28 : hasCloudBase ? 22 : 31,
        hasCloudBase && sunIsPrimary ? 14 : hasCloudBase ? 9 : 13,
        hasCloudBase && sunIsPrimary
      )
      : "";
    const cloudLayer = hasCloudBase
      ? renderCloud(
        sunIsPrimary ? "secondary" : "primary",
        features.has("sun") && !sunIsPrimary,
        hasPrecipitation
      )
      : "";

    // The first weather element is the dominant condition. Draw it last so
    // 晴時々曇 and 曇時々晴 remain distinguishable by both size and depth.
    if (sunIsPrimary) {
      if (cloudLayer) layers.push(cloudLayer);
      if (sunLayer) layers.push(sunLayer);
    } else {
      if (sunLayer) layers.push(sunLayer);
      if (cloudLayer) layers.push(cloudLayer);
    }
    if (features.has("sleet")) {
      if (hasHeavyRain || hasHeavySnow) layers.push(renderPrecipitationLines());
      layers.push(renderSleet());
    } else if (features.has("rain") && features.has("snow")) {
      if (hasHeavyRain || hasHeavySnow) layers.push(renderPrecipitationLines());
      layers.push(renderMixedRainAndSnow(glyph.primaryFeature));
    } else {
      if (features.has("rain")) {
        if (hasHeavyRain) layers.push(renderPrecipitationLines());
        layers.push(renderUmbrella(features.size > 1));
      }
      if (features.has("snow")) {
        if (hasHeavySnow) layers.push(renderPrecipitationLines());
        layers.push(renderSnow(features.size > 1));
      }
    }
    if (features.has("thunder")) layers.push(renderThunder());
    if (features.has("fog")) layers.push(renderFog(51));
  }

  return `
    <svg class="weekly-weather-glyph" viewBox="0 0 96 68" aria-hidden="true" focusable="false"
      data-weather-code="${code}" data-weather-kind="${glyph.kind}"
      data-weather-primary="${glyph.primaryFeature}" data-weather-relation="${relationshipMode}">
      ${layers.join("")}
    </svg>
  `;
}

function normalizeWeatherCode(weatherCode) {
  const value = String(weatherCode ?? "").trim();
  return /^\d{3}$/u.test(value) ? value : "";
}

function findPrimaryWeatherFeature(text, features) {
  const candidates = [
    ["sun", /晴/u],
    ["cloud", /(?:曇|くもり)/u],
    ["rain", /雨/u],
    ["snow", /雪/u],
    ["sleet", /(?:みぞれ|霙)/u],
    ["fog", /霧/u]
  ]
    .map(([feature, pattern]) => ({ feature, index: text.search(pattern) }))
    .filter(({ feature, index }) => index >= 0 && features.has(feature))
    .sort((left, right) => left.index - right.index);
  return candidates[0]?.feature || [...features][0] || "cloud";
}

function renderSun(cx, cy, radius, foreground = false) {
  const scale = radius / 13;
  return `
    <g class="weekly-weather-glyph-main weekly-weather-glyph-sun"
      transform="translate(${cx} ${cy}) scale(${scale})">
      <path class="weekly-weather-glyph-solid"
        d="M0-22l7 7h10v10l7 7-7 7v10H7l-7 7-7-7h-10V9l-7-7 7-7v-10h10Z"></path>
      <circle class="weekly-weather-glyph-sun-disc${foreground ? " weekly-weather-glyph-foreground" : ""} weekly-weather-glyph-cutout"
        cx="0" cy="2" r="10"></circle>
    </g>
  `;
}

function renderCloud(variant = "primary", foreground = false, compact = false) {
  if (variant === "secondary") {
    return `
      <path class="weekly-weather-glyph-main weekly-weather-glyph-cloud weekly-weather-glyph-cloud-secondary"
        d="M44 51h28c5.7 0 10-4.1 10-9.3 0-5.1-4.2-9-9.5-9.3-1.9-4.8-6.4-7.8-11.7-7.8-6.8 0-12.2 4.8-13 10.9-5.2.3-9.3 3.8-9.3 8.1 0 4.4 3.5 7.4 5.5 7.4Z">
      </path>
    `;
  }
  return `
    <path class="weekly-weather-glyph-main weekly-weather-glyph-cloud${foreground ? " weekly-weather-glyph-foreground" : ""}"
      ${compact ? 'transform="translate(0 1) scale(.82)"' : ""}
      d="M27 49h39.5c7.5 0 13.5-5.5 13.5-12.4 0-6.7-5.6-12-12.7-12.4C64.8 17.8 58.7 14 51.8 14c-8.9 0-16.2 6.2-17.2 14.2-6.8.4-12.1 5-12.1 10.7C22.5 44.6 27 49 27 49Z">
    </path>
  `;
}

function renderWeatherRelationship(primaryFeature, secondaryFeature, mode) {
  const primary = renderStandaloneFeature(primaryFeature);
  const secondary = renderStandaloneFeature(secondaryFeature);

  if (mode === "then") {
    const primaryX = getWeatherRelationshipOffset(primaryFeature, "primary");
    const secondaryX = getWeatherRelationshipOffset(secondaryFeature, "secondary");
    return `
      <g class="weekly-weather-glyph-relationship is-then">
        <g class="weekly-weather-glyph-relationship-primary"
          transform="translate(${primaryX} 15) scale(.58)">${primary}</g>
        <path class="weekly-weather-glyph-transition-arrow"
          d="M40 32.2h10.2v-4.4L58 34l-7.8 5.8v-4.2H40Z"></path>
        <g class="weekly-weather-glyph-relationship-secondary"
          transform="translate(${secondaryX} 15) scale(.58)">${secondary}</g>
      </g>
    `;
  }

  return `
    <g class="weekly-weather-glyph-relationship is-intermittent">
      <g class="weekly-weather-glyph-relationship-primary"
        transform="translate(-4 4) scale(.78)">${primary}</g>
      <g class="weekly-weather-glyph-relationship-secondary"
        transform="translate(49 26) scale(.48)">${secondary}</g>
    </g>
  `;
}

function getWeatherRelationshipOffset(feature, side) {
  const offsets = side === "primary"
    ? { sun: -6, cloud: -10.5, rain: -9.2, snow: -1.7 }
    : { sun: 48.1, cloud: 49, rain: 50.6, snow: 44 };
  return offsets[feature] ?? (side === "primary" ? -8 : 50);
}

function renderStandaloneFeature(feature) {
  if (feature === "sun") return renderSun(48, 31, 13);
  if (feature === "cloud") return renderCloud();
  if (feature === "rain") return renderUmbrella();
  if (feature === "snow") return renderSnow();
  return "";
}

function renderMixedRainAndSnow(primaryFeature) {
  if (primaryFeature === "snow") {
    return `${renderUmbrella(true, false, "left")}${renderSnow(true, "right")}`;
  }
  return `${renderSnow(true, "right")}${renderUmbrella(true, false, "left")}`;
}

function renderUmbrella(compact = false, tilted = false, placement = "right") {
  const scaleTransform = compact
    ? `${placement === "left" ? "translate(5 28)" : "translate(35 28)"} scale(.55)`
    : "translate(9 4) scale(.82)";
  return `
    <g class="weekly-weather-glyph-main weekly-weather-glyph-umbrella${compact ? " is-compact" : ""}"
      ${tilted ? 'transform="rotate(18 48 38)"' : ""}>
      <g transform="${scaleTransform}">
        <path class="weekly-weather-glyph-solid"
          d="M13 40C16 23 29 13 45 11V8a3 3 0 0 1 6 0v3c17 1 30 12 33 29H51v16c0 8-5 13-12 13-8 0-13-5-13-12v-4h7v4c0 4 2 6 6 6 3 0 5-2 5-7V40Z"></path>
      </g>
    </g>
  `;
}

function renderSnow(compact = false, placement = "right") {
  const compactTransform = placement === "center"
    ? "translate(16 18) scale(.67)"
    : placement === "left"
      ? "translate(4 27) scale(.55)"
      : "translate(34 27) scale(.55)";
  return `
    <g class="weekly-weather-glyph-main weekly-weather-glyph-snowman"
      ${compact ? `transform="${compactTransform}"` : ""}>
      <circle cx="48" cy="21" r="10"></circle>
      <circle cx="48" cy="48" r="17"></circle>
      <circle class="weekly-weather-glyph-solid" cx="45" cy="19" r="1.5"></circle>
      <circle class="weekly-weather-glyph-solid" cx="52" cy="19" r="1.5"></circle>
    </g>
  `;
}

function renderSleet() {
  return `${renderUmbrella(true, false, "left")}${renderSnow(true, "right")}`;
}

function renderPrecipitationLines(diagonal = false) {
  const paths = diagonal
    ? ["M25 5L13 34", "M40 5L28 34", "M55 5L43 34", "M70 5L58 34", "M85 5L73 34"]
    : ["M20 7V32", "M34 7V27", "M48 7V32", "M62 7V27", "M76 7V32"];
  return `
    <g class="weekly-weather-glyph-main weekly-weather-glyph-precipitation-lines">
      ${paths.map((path) => `<path d="${path}"></path>`).join("")}
    </g>
  `;
}

function renderThunder() {
  return `
    <path class="weekly-weather-glyph-alert" d="M54 47l-7 11h6l-3 8 12-13h-7l5-6Z"></path>
  `;
}

function renderFog(y = 36) {
  return `
    <g class="weekly-weather-glyph-main weekly-weather-glyph-fog">
      <path d="M20 ${y}h56"></path>
      <path d="M28 ${y + 9}h49"></path>
      <path d="M19 ${y + 18}h43"></path>
    </g>
  `;
}

function renderStorm(type, thunder) {
  const precipitation = type === "snow"
    ? renderSnow(true, "center")
    : type === "sleet"
      ? renderSleet()
      : renderUmbrella(false, true);
  return `
    ${renderPrecipitationLines(true)}
    ${precipitation}
    ${thunder ? renderThunder() : ""}
  `;
}
