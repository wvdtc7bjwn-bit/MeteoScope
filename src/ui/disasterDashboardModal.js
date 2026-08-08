import { getCurrentLanguage, localizeText } from "./locale.js";
import { formatRadarIntensityBand } from "../location/radarTimeline.js";
import {
  formatEarthquakeDepthText,
  formatEarthquakeHypocenterText,
  formatEarthquakeMagnitude,
  getEarthquakeUnknownText
} from "../earthquakeFormat.js";
import {
  getEarlyWarningColor,
  getEarlyWarningRiskRank,
  getWarningColor,
  getWarningRiskRank
} from "../warningMapColors.js";
import { buildModalLoadingState } from "./modalLoadingState.js";

let initialized = false;
let loadDashboardData = async () => ({});
let requestCurrentLocation = async () => {};
let onNavigate = async () => {};
let loadSequence = 0;

const COPY = {
  ja: {
    title: "防災情報ダッシュボード",
    kicker: "現在地の防災情報",
    open: "防災情報ダッシュボードを開く",
    close: "閉じる",
    loading: "現在地の情報を確認しています",
    loadingDetail: "利用中の防災情報をまとめています。",
    retry: "再読み込み",
    locate: "現在地を取得",
    currentLocation: "現在地",
    updated: "確認時刻",
    warnings: "警報・注意報",
    risk: "キキクル",
    river: "指定河川洪水予報",
    earthquake: "地震情報",
    volcano: "火山情報",
    observations: "雨雲・雷",
    details: "詳細を見る",
    noWarnings: "発表中の警報・注意報はありません",
    noEarlyWarnings: "発表中の早期注意情報はありません",
    noRiver: "現在地に関連する発表はありません",
    noEarthquake: "現在地で震度を観測した直近の地震はありません",
    noVolcano: "現在地に関連する発表はありません",
    unavailable: "取得できません",
    notLocated: "現在地を取得すると、この地域の防災情報をまとめて表示します。",
    latestNationwide: "全国の直近",
    observedHere: "現在地で観測",
    land: "土砂災害",
    inund: "浸水害",
    noRisk: "危険度なし",
    radar: "雨雲レーダー",
    lightning: "雷活動",
    noLightning: "活動なし",
    activityLevel: "活動度",
    amedas: "現在地に近いAMeDAS観測値",
    active: "発表中",
    early: "早期注意情報",
    magnitude: "規模",
    depth: "深さ",
    intensity: "最大震度",
    localIntensity: "現在地の震度",
    level: "レベル",
    station: "観測点",
    nearbyObservations: "観測値のある最寄りの観測点",
    temperature: "気温",
    precipitation: "1時間降水量",
    wind: "風速",
    humidity: "湿度",
    pressure: "海面気圧",
    snow: "積雪深",
    refreshFailed: "一部の情報を更新できませんでした。取得済みの情報を表示しています。",
    overview: "現在の状況",
    summaryClear: "現在地で、発表中の重要な防災情報は確認されていません",
    summaryAttention: "確認が必要な情報があります",
    summaryCritical: "危険度の高い情報があります",
    activeCount: "発表・危険度",
    weatherHazards: "気象・河川",
    earthHazards: "地震・火山",
    liveConditions: "周辺の観測",
    locationPrivacy: "位置情報はこの端末で照合し、保存しません。",
    locationBenefit: "警報、危険度、河川、地震などを現在地に合わせて整理します。"
  },
  en: {
    title: "Disaster information dashboard",
    kicker: "Hazards near your location",
    open: "Open disaster information dashboard",
    close: "Close",
    loading: "Checking your area",
    loadingDetail: "Gathering the latest available hazard information.",
    retry: "Refresh",
    locate: "Get current location",
    currentLocation: "Current location",
    updated: "Checked",
    warnings: "Warnings and advisories",
    risk: "Risk maps",
    river: "Designated river flood forecasts",
    earthquake: "Earthquakes",
    volcano: "Volcanoes",
    observations: "Radar and lightning",
    details: "View details",
    noWarnings: "No warnings or advisories are in effect",
    noEarlyWarnings: "No early warning information is in effect",
    noRiver: "No bulletin is related to this location",
    noEarthquake: "No recent earthquake intensity was observed here",
    noVolcano: "No bulletin is related to this location",
    unavailable: "Unavailable",
    notLocated: "Get your current location to see a local hazard summary.",
    latestNationwide: "Latest nationwide",
    observedHere: "Observed here",
    land: "Landslide",
    inund: "Flooding",
    noRisk: "No risk level",
    radar: "Rain radar",
    lightning: "Lightning activity",
    noLightning: "No activity",
    activityLevel: "Activity level",
    amedas: "Nearby AMeDAS observations",
    active: "Active",
    early: "Early warning information",
    magnitude: "Magnitude",
    depth: "Depth",
    intensity: "Maximum intensity",
    localIntensity: "Local intensity",
    level: "Level",
    station: "Station",
    nearbyObservations: "Nearest reporting stations",
    temperature: "Temperature",
    precipitation: "Hourly rain",
    wind: "Wind speed",
    humidity: "Humidity",
    pressure: "Sea-level pressure",
    snow: "Snow depth",
    refreshFailed: "Some sources could not be refreshed. Available information is shown.",
    overview: "Current status",
    summaryClear: "No significant active hazard information was found for this location",
    summaryAttention: "There is information that needs your attention",
    summaryCritical: "High-risk information is active",
    activeCount: "Active items",
    weatherHazards: "Weather and rivers",
    earthHazards: "Earthquakes and volcanoes",
    liveConditions: "Nearby observations",
    locationPrivacy: "Your location is matched on this device and is not stored.",
    locationBenefit: "Warnings, risk levels, rivers and earthquakes are organized for your area."
  }
};

export function setupDisasterDashboardModal(options = {}) {
  if (initialized) return;
  initialized = true;
  loadDashboardData = options.loadData ?? loadDashboardData;
  requestCurrentLocation = options.requestCurrentLocation ?? requestCurrentLocation;
  onNavigate = options.onNavigate ?? onNavigate;

  const button = document.getElementById("disaster-dashboard-button");
  const modal = document.getElementById("disaster-dashboard-modal");
  if (!button || !modal) return;

  button.addEventListener("click", () => void openDisasterDashboardModal());
  modal.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-disaster-dashboard-close]")) {
      closeDisasterDashboardModal();
      return;
    }
    if (event.target.closest("[data-disaster-dashboard-retry]")) {
      void refreshDisasterDashboard({ force: true });
      return;
    }
    if (event.target.closest("[data-disaster-dashboard-locate]")) {
      void locateAndRefresh();
      return;
    }
    const navigation = event.target.closest("[data-disaster-dashboard-tab]");
    if (navigation) {
      const tabId = navigation.getAttribute("data-disaster-dashboard-tab");
      closeDisasterDashboardModal();
      void onNavigate(tabId);
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDisasterDashboardModal();
  });
  window.addEventListener("meteoscope-language-change", () => {
    updateStaticCopy();
    if (!modal.hidden) void refreshDisasterDashboard();
  });
  updateStaticCopy();
}

export async function openDisasterDashboardModal() {
  const modal = document.getElementById("disaster-dashboard-modal");
  if (!modal) return;
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("disaster-dashboard-button")?.setAttribute("aria-expanded", "true");
  updateStaticCopy();
  await refreshDisasterDashboard();
}

function closeDisasterDashboardModal() {
  const modal = document.getElementById("disaster-dashboard-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.getElementById("disaster-dashboard-button")?.setAttribute("aria-expanded", "false");
  if (![...document.querySelectorAll(".warning-modal:not([hidden])")].length) {
    document.body.classList.remove("modal-open");
  }
}

async function locateAndRefresh() {
  renderLoading();
  await requestCurrentLocation();
  await refreshDisasterDashboard({ force: true });
}

async function refreshDisasterDashboard({ force = false } = {}) {
  const body = document.getElementById("disaster-dashboard-body");
  if (!body) return;
  const requestId = ++loadSequence;
  renderLoading();
  try {
    const snapshot = await loadDashboardData({ force });
    if (requestId !== loadSequence) return;
    renderDashboard(body, buildDisasterDashboardViewModel(snapshot, getCurrentLanguage()));
  } catch (error) {
    if (requestId !== loadSequence) return;
    console.warn("[MeteoScope] disaster dashboard unavailable", error);
    renderError(body, error);
  }
}

function updateStaticCopy() {
  const language = getCurrentLanguage();
  const copy = COPY[language] ?? COPY.ja;
  const button = document.getElementById("disaster-dashboard-button");
  if (button) {
    button.setAttribute("aria-label", copy.open);
    button.title = copy.title;
  }
  const title = document.getElementById("disaster-dashboard-title");
  const kicker = document.getElementById("disaster-dashboard-kicker");
  const close = document.querySelector("#disaster-dashboard-modal [data-disaster-dashboard-close].warning-modal-close");
  if (title) title.textContent = copy.title;
  if (kicker) kicker.textContent = copy.kicker;
  if (close) close.setAttribute("aria-label", copy.close);
}

function renderLoading() {
  const body = document.getElementById("disaster-dashboard-body");
  if (!body) return;
  const copy = COPY[getCurrentLanguage()] ?? COPY.ja;
  body.innerHTML = buildModalLoadingState({
    title: copy.loading,
    detail: copy.loadingDetail
  });
}

function renderError(body, error) {
  const copy = COPY[getCurrentLanguage()] ?? COPY.ja;
  body.innerHTML = `
    <div class="disaster-dashboard-state is-error">
      <span class="disaster-dashboard-state-mark" aria-hidden="true">!</span>
      <strong>${escapeHtml(copy.unavailable)}</strong>
      <p>${escapeHtml(error?.message || copy.refreshFailed)}</p>
      ${renderRefreshButton(copy, "is-state")}
    </div>
  `;
}

function renderRefreshButton(copy, className = "") {
  return `
    <button
      type="button"
      class="disaster-dashboard-refresh-button ${escapeHtml(className)}"
      data-disaster-dashboard-retry
      aria-label="${escapeHtml(copy.retry)}"
      title="${escapeHtml(copy.retry)}"
    ><svg class="disaster-dashboard-refresh-icon" viewBox="0 0 24 24" preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false"><path d="M20 12a8 8 0 1 1-2.34-5.66L20 8" /><path d="M20 3v5h-5" /></svg></button>
  `;
}

export function buildDisasterDashboardViewModel(snapshot = {}, language = "ja") {
  const copy = COPY[language] ?? COPY.ja;
  const location = snapshot.currentLocation ?? {};
  const areaCode = String(location.areaCode ?? "");
  const warnings = location.warnings ?? [];
  const earlyWarnings = location.earlyWarnings ?? [];
  const riverReports = (snapshot.riverFlood?.reports ?? []).filter((report) =>
    reportMatchesArea(report, areaCode)
  );
  const earthquakes = snapshot.earthquake?.earthquakes ?? [];
  const localEarthquake = earthquakes.find((earthquake) =>
    earthquakeMatchesArea(earthquake, areaCode)
  );
  const latestEarthquake = localEarthquake ?? earthquakes[0] ?? null;
  const localIntensity = latestEarthquake
    ? getEarthquakeAreaIntensity(latestEarthquake, areaCode)
    : null;
  const volcanoReports = (snapshot.volcano?.reports ?? []).filter((report) =>
    volcanoMatchesArea(report, areaCode)
  );
  const nearestAmedasValues = buildNearestAmedasValues(
    location.coordinates,
    snapshot.amedas?.points,
    copy,
    language
  );
  const activeRiskCount = warnings.length
    + earlyWarnings.length
    + riverReports.length
    + volcanoReports.length
    + ["land", "inund"].filter((id) => Number(snapshot.kikikuruStatuses?.[id]?.rank) > 0).length;
  const highestRiskRank = Math.max(
    0,
    ...["land", "inund"].map((id) => Number(snapshot.kikikuruStatuses?.[id]?.rank) || 0),
    ...warnings.map((warning) => getWarningRiskRank(warning.level)),
    ...earlyWarnings.map((warning) => getEarlyWarningRiskRank(warning.level)),
    ...riverReports.map((report) => Number(report.level) || 0),
    ...volcanoReports.map((report) => Number(report.level) || 0)
  );

  return {
    language,
    copy,
    status: location.status === "found" && areaCode ? "ready" : "location-required",
    locationName: [location.prefecture, location.areaName]
      .filter(Boolean)
      .map((value) => localizeText(value, language))
      .join(" "),
    checkedAt: snapshot.generatedAt ?? new Date().toISOString(),
    partialFailure: snapshot.partialFailure === true,
    overview: {
      activeRiskCount,
      tone: highestRiskRank >= 4 ? "critical" : activeRiskCount > 0 ? "attention" : "clear"
    },
    warnings: warnings.map((warning) => ({
      label: localizeText(warning.label ?? warning.type ?? copy.active, language),
      level: warning.level ?? "advisory",
      color: getWarningColor(warning.level ?? "advisory"),
      updatedAt: warning.updatedAt ?? location.updatedAt ?? ""
    })),
    earlyWarnings: earlyWarnings.map((warning) => ({
      label: localizeText(warning.label ?? warning.type ?? copy.early, language),
      level: warning.level ?? "middle",
      color: getEarlyWarningColor(warning.level ?? "middle"),
      updatedAt: warning.updatedAt ?? location.updatedAt ?? ""
    })),
    riverReports: riverReports.map((report) => ({
      label: localizeText(report.forecastAreaName || report.title, language),
      detail: localizeText(report.levelLabel || report.condition, language),
      level: Number(report.level) || 0,
      updatedAt: report.updatedAt ?? ""
    })),
    kikikuru: ["land", "inund"].map((id) => {
      const item = snapshot.kikikuruStatuses?.[id] ?? {};
      return {
        id,
        label: copy[id],
        value: item.status === "ready"
          ? (Number(item.rank) > 0 ? localizeText(item.label, language) : copy.noRisk)
          : copy.unavailable,
        rank: Number(item.rank) || 0,
        color: item.color || ""
      };
    }),
    earthquake: latestEarthquake ? {
      local: Boolean(localEarthquake),
      name: localizeText(formatEarthquakeHypocenterText(latestEarthquake), language),
      eventTime: latestEarthquake.eventTime,
      magnitude: latestEarthquake.magnitude,
      depth: latestEarthquake.depth,
      maxIntensity: latestEarthquake.maxIntensityShort || latestEarthquake.maxIntensityLabel,
      localIntensity: localIntensity?.intensityShort || localIntensity?.intensityLabel || "",
      unknownText: getEarthquakeUnknownText(latestEarthquake)
    } : null,
    volcanoReports: volcanoReports.slice(0, 3).map((report) => ({
      name: localizeText(report.volcanoName, language),
      detail: localizeText(report.kindName || report.infoKind, language),
      level: Number(report.level) || 0,
      updatedAt: report.reportTime ?? ""
    })),
    observations: {
      radarTime: snapshot.radar?.latestTime ?? snapshot.radar?.updatedAt ?? "",
      lightningTime: snapshot.lightning?.latestTime ?? snapshot.lightning?.updatedAt ?? "",
      radarPoint: snapshot.radar?.pointSample ?? null,
      lightningPoint: snapshot.lightning?.pointSample ?? null,
      amedasTime: snapshot.amedas?.latestTime ?? "",
      nearestAmedasValues
    }
  };
}

function renderDashboard(body, model) {
  body.innerHTML = buildDisasterDashboardMarkup(model);
}

export function buildDisasterDashboardMarkup(model) {
  const { copy } = model;
  if (model.status !== "ready") {
    return `
      <div class="disaster-dashboard-state is-location-required">
        <span class="disaster-dashboard-location-mark" aria-hidden="true"></span>
        <strong>${escapeHtml(copy.notLocated)}</strong>
        <p>${escapeHtml(copy.locationBenefit)}</p>
        <button type="button" data-disaster-dashboard-locate>${escapeHtml(copy.locate)}</button>
        <small>${escapeHtml(copy.locationPrivacy)}</small>
      </div>
    `;
  }

  return `
    <div class="disaster-dashboard-location-bar">
      <div>
        <span>${escapeHtml(copy.currentLocation)}</span>
        <strong>${escapeHtml(model.locationName)}</strong>
      </div>
      <div class="disaster-dashboard-location-time">
        <span>${escapeHtml(copy.updated)}</span>
        <time>${escapeHtml(formatTime(model.checkedAt, model.language))}</time>
      </div>
      ${renderRefreshButton(copy)}
    </div>
    ${model.partialFailure ? `<p class="disaster-dashboard-notice">${escapeHtml(copy.refreshFailed)}</p>` : ""}
    ${renderOverview(model)}
    <div class="disaster-dashboard-columns">
      ${renderGroup({
        title: copy.weatherHazards,
        className: "is-weather",
        body: [
          renderSection({ title: copy.warnings, tab: "warnings", body: renderWarnings(model) }),
          renderSection({ title: copy.early, tab: "warnings", body: renderEarlyWarnings(model) }),
          renderSection({ title: copy.risk, tab: "warnings", body: renderKikikuru(model) }),
          renderSection({ title: copy.river, tab: "warnings", body: renderRiver(model) })
        ].join("")
      })}
      ${renderGroup({
        title: copy.earthHazards,
        className: "is-earth",
        body: [
          renderSection({ title: copy.earthquake, tab: "earthquake", body: renderEarthquake(model) }),
          renderSection({ title: copy.volcano, tab: "earthquake", body: renderVolcano(model) })
        ].join("")
      })}
    </div>
    ${renderGroup({
      title: copy.liveConditions,
      className: "is-observations",
      body: [
        renderSection({ title: copy.observations, tab: "radar", body: renderRadarObservations(model) }),
        renderSection({ title: copy.amedas, tab: "amedas", body: renderAmedasObservation(model) })
      ].join("")
    })}
  `;
}

function renderOverview(model) {
  const { copy, overview } = model;
  const summary = overview.tone === "critical"
    ? copy.summaryCritical
    : overview.tone === "attention"
      ? copy.summaryAttention
      : copy.summaryClear;
  return `
    <section class="disaster-dashboard-overview is-${overview.tone}" aria-label="${escapeHtml(copy.overview)}">
      <span class="disaster-dashboard-overview-mark" aria-hidden="true"></span>
      <div>
        <span>${escapeHtml(copy.overview)}</span>
        <strong>${escapeHtml(summary)}</strong>
      </div>
      <dl>
        <div><dt>${escapeHtml(copy.activeCount)}</dt><dd>${overview.activeRiskCount}</dd></div>
      </dl>
    </section>
  `;
}

function renderGroup({ title, body, className = "" }) {
  return `
    <section class="disaster-dashboard-group ${escapeHtml(className)}">
      <h3>${escapeHtml(title)}</h3>
      <div>${body}</div>
    </section>
  `;
}

function renderSection({ title, tab, body }) {
  const copy = COPY[getCurrentLanguage()] ?? COPY.ja;
  return `
    <section class="disaster-dashboard-section">
      <header>
        <h4>${escapeHtml(title)}</h4>
        <button type="button" data-disaster-dashboard-tab="${escapeHtml(tab)}" aria-label="${escapeHtml(title)}: ${escapeHtml(copy.details)}"><span>${escapeHtml(copy.details)}</span></button>
      </header>
      <div class="disaster-dashboard-section-body">${body}</div>
    </section>
  `;
}

function renderWarnings(model) {
  if (!model.warnings.length) return `<p class="disaster-dashboard-empty">${escapeHtml(model.copy.noWarnings)}</p>`;
  return renderAlertList(model.warnings.slice(0, 6));
}

function renderEarlyWarnings(model) {
  if (!model.earlyWarnings.length) return `<p class="disaster-dashboard-empty">${escapeHtml(model.copy.noEarlyWarnings)}</p>`;
  return renderAlertList(model.earlyWarnings.slice(0, 6));
}

function renderAlertList(items) {
  return `<ul class="disaster-dashboard-list disaster-dashboard-alert-list">${items.map((item) => `
    <li style="--dashboard-alert-color:${escapeHtml(item.color)}"><span class="disaster-dashboard-level" aria-hidden="true"></span><strong>${escapeHtml(item.label)}</strong><time>${escapeHtml(formatShortTime(item.updatedAt))}</time></li>
  `).join("")}</ul>`;
}

function renderKikikuru(model) {
  return `<dl class="disaster-dashboard-risk-list">${model.kikikuru.map((item) => `
    <div><dt>${escapeHtml(item.label)}</dt><dd${item.color ? ` style="--risk-color:${escapeHtml(item.color)}"` : ""}>${escapeHtml(item.value)}</dd></div>
  `).join("")}</dl>`;
}

function renderRiver(model) {
  if (!model.riverReports.length) return `<p class="disaster-dashboard-empty">${escapeHtml(model.copy.noRiver)}</p>`;
  return `<ul class="disaster-dashboard-list">${model.riverReports.slice(0, 4).map((report) => `
    <li><span class="disaster-dashboard-level river-level-${report.level}"></span><div><strong>${escapeHtml(report.label)}</strong><small>${escapeHtml(report.detail)}</small></div><time>${escapeHtml(formatShortTime(report.updatedAt))}</time></li>
  `).join("")}</ul>`;
}

function renderEarthquake(model) {
  const item = model.earthquake;
  if (!item) return `<p class="disaster-dashboard-empty">${escapeHtml(model.copy.noEarthquake)}</p>`;
  const context = item.local ? model.copy.observedHere : model.copy.latestNationwide;
  const metrics = buildDashboardEarthquakeMetrics(item, model.copy, model.language);
  return `
    <article class="disaster-dashboard-earthquake">
      <div><span>${escapeHtml(context)}</span><time>${escapeHtml(item.eventTime ?? "")}</time></div>
      <strong>${escapeHtml(item.name)}</strong>
      <dl>${metrics.map((metric) => `<div><dt>${escapeHtml(metric.label)}</dt><dd>${escapeHtml(metric.value)}</dd></div>`).join("")}</dl>
    </article>
  `;
}

export function buildDashboardEarthquakeMetrics(item, copy, language) {
  const unknownText = item.unknownText || "不明";
  return [
    {
      label: copy.intensity,
      value: !item.maxIntensity || item.maxIntensity === "震度不明" ? unknownText : item.maxIntensity
    },
    {
      label: copy.magnitude,
      value: formatEarthquakeMagnitude(item.magnitude, { prefix: true, compact: true, unknownText })
    },
    {
      label: copy.depth,
      value: localizeText(formatEarthquakeDepthText(item.depth, { compact: true, unknownText }), language)
    }
  ];
}

function renderVolcano(model) {
  if (!model.volcanoReports.length) return `<p class="disaster-dashboard-empty">${escapeHtml(model.copy.noVolcano)}</p>`;
  return `<ul class="disaster-dashboard-list">${model.volcanoReports.map((report) => `
    <li><span class="disaster-dashboard-level volcano-level-${report.level}"></span><div><strong>${escapeHtml(report.name)}</strong><small>${escapeHtml(report.detail)}</small></div><time>${escapeHtml(formatShortTime(report.updatedAt))}</time></li>
  `).join("")}</ul>`;
}

function renderRadarObservations(model) {
  const { observations, copy } = model;
  const radarValue = observations.radarPoint?.status === "ready"
    ? formatRadarIntensityBand(observations.radarPoint.intensity, model.language)
    : copy.unavailable;
  const lightningLevel = Number(observations.lightningPoint?.level);
  const lightningValue = observations.lightningPoint?.status === "ready"
    ? (lightningLevel > 0 ? `${copy.activityLevel} ${lightningLevel}` : copy.noLightning)
    : copy.unavailable;
  const radarTime = observations.radarPoint?.time || observations.radarTime;
  const lightningTime = observations.lightningPoint?.time || observations.lightningTime;
  return `<dl class="disaster-dashboard-observations">
    <div><dt>${escapeHtml(copy.radar)}</dt><dd><strong>${escapeHtml(radarValue)}</strong><small>${escapeHtml(formatShortTime(radarTime))}</small></dd></div>
    <div><dt>${escapeHtml(copy.lightning)}</dt><dd><strong>${escapeHtml(lightningValue)}</strong><small>${escapeHtml(formatShortTime(lightningTime))}</small></dd></div>
  </dl>`;
}

function renderAmedasObservation(model) {
  const { observations, copy } = model;
  const values = observations.nearestAmedasValues ?? [];
  if (!values.length) return `<p class="disaster-dashboard-empty">${escapeHtml(copy.unavailable)}</p>`;
  return `<article class="disaster-dashboard-amedas">
    <header><strong>${escapeHtml(copy.nearbyObservations)}</strong><time>${escapeHtml(formatShortTime(observations.amedasTime))}</time></header>
    <dl>${values.map((item) => `
      <div>
        <dt>${escapeHtml(item.label)}</dt>
        <dd><strong>${escapeHtml(item.value)}</strong><small>${escapeHtml(item.stationName)}</small></dd>
      </div>
    `).join("")}</dl>
  </article>`;
}

export function reportMatchesArea(report, areaCode) {
  return Boolean(areaCode) && (report?.affectedAreas ?? []).some((area) =>
    codesMatch(area.cityCode, areaCode)
  );
}

export function earthquakeMatchesArea(earthquake, areaCode) {
  return Boolean(areaCode) && (earthquake?.intensityCities ?? []).some((city) =>
    codesMatch(city.code, areaCode)
  );
}

export function volcanoMatchesArea(report, areaCode) {
  return Boolean(areaCode) && (report?.targetAreas ?? []).some((group) =>
    (group.areas ?? []).some((area) => codesMatch(area.code, areaCode))
  );
}

function getEarthquakeAreaIntensity(earthquake, areaCode) {
  return (earthquake?.intensityCities ?? []).find((city) => codesMatch(city.code, areaCode)) ?? null;
}

function codesMatch(left, right) {
  const first = String(left ?? "").replace(/\D/g, "");
  const second = String(right ?? "").replace(/\D/g, "");
  return Boolean(first && second) && (first === second || first.startsWith(second) || second.startsWith(first));
}

function findNearestAmedasPoint(coordinates, points = [], metricId = "") {
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lng, lat] = coordinates.map(Number);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return (points ?? []).reduce((nearest, point) => {
    if (metricId && !isObservedNumber(point?.values?.[metricId])) return nearest;
    const [pointLng, pointLat] = (point.coordinates ?? []).map(Number);
    if (!Number.isFinite(pointLng) || !Number.isFinite(pointLat)) return nearest;
    const distance = Math.hypot((pointLng - lng) * Math.cos(lat * Math.PI / 180), pointLat - lat);
    return !nearest || distance < nearest.distance ? { point, distance } : nearest;
  }, null)?.point ?? null;
}

function buildNearestAmedasValues(coordinates, points = [], copy, language) {
  const metrics = [
    ["temperature", copy.temperature, "°C", 1],
    ["precipitation", copy.precipitation, "mm", 1],
    ["wind", copy.wind, "m/s", 1],
    ["humidity", copy.humidity, "%", 0],
    ["pressure", copy.pressure, "hPa", 1],
    ["snow", copy.snow, "cm", 0]
  ];
  return metrics.flatMap(([id, label, unit, digits]) => {
    const station = findNearestAmedasPoint(coordinates, points, id);
    if (!station) return [];
    const numeric = Number(station.values[id]);
    return [{
      id,
      label,
      value: `${numeric.toFixed(digits)}${unit}`,
      stationName: localizeText(station.name, language)
    }];
  });
}

function isObservedNumber(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function formatShortTime(value) {
  const text = String(value ?? "").trim();
  const match = text.match(/(?:\d{4}[/-])?(\d{1,2})[/-](\d{1,2})[^\d]+(\d{1,2}):(\d{2})/);
  return match ? `${match[1]}/${match[2]} ${match[3].padStart(2, "0")}:${match[4]}` : text;
}

function formatTime(value, language) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return formatShortTime(value);
  return new Intl.DateTimeFormat(language === "en" ? "en-US" : "ja-JP", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
