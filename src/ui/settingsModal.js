import { escapeHtml } from "../utils/html.js";
import { formatJstDate } from "../utils/jstDateTime.js";
import { loadLegalDocumentMarkup } from "./legalConsentModal.js";
import { getDefaultTabOrder, normalizeTabOrder } from "./tabOrder.js";
import { QuizRankingClient } from "../domain/quizRankingClient.js";
import { prepareProfileImage } from "./profileImage.js";
import { setupAccountCardMotion } from "./accountCardMotion.js";
import { getCurrentLanguage } from "./locale.js";
import { createSettingsNavigator } from "./settingsNavigation.js";
import { setupCustomizationSettings } from "./customizationSettings.js";
import { setupSettingsChoiceLists } from "./settingsChoiceLists.js";
import { openLocalTemperatureTerms } from "./localTemperatureTerms.js";
import { createTemperatureSourceSelector, effectiveTemperatureSource, canUseTemperatureEstimation } from "../preferences/temperatureSource.js";
import { getEarthquakeIntensityColor } from "../config.js";
import { renderAmedasColorLegend } from "./amedasColorLegend.js";
import { getLongPeriodClassStyle } from "../earthquake/longPeriodGroundMotion.js";
import changelogMarkdown from "../../CHANGELOG.md?raw";

let settingsModalInitialized = false;
let settingsOptions = {};
let settingsSearchRequestId = 0;
let settingsPdfStatusRequestId = 0;
let selectedTabOrderId = null;
let settingsAccountRequestId = 0;
let settingsAccount = null;
let settingsAccountAvailable = false;
let settingsAccountBusy = false;
let settingsAccountMode = "login";
let settingsProfileAvatar;
let settingsProfileImageRequest = 0;
let settingsProfileImageBusy = false;
let settingsNavigator = null;
let customizationSettings = null;
let settingsChoiceLists = null;
const selectTemperatureSource = createTemperatureSourceSelector({
  getState: () => settingsOptions.getState?.() ?? {},
  onChange: source => settingsOptions.onTemperatureSourceChange?.(source),
  confirm: () => openLocalTemperatureTerms()
});

export function setupSettingsModal(options = {}) {
  settingsOptions = options;
  if (settingsModalInitialized) return;
  settingsModalInitialized = true;

  const button = document.getElementById("settings-button");
  const modal = document.getElementById("settings-modal");
  if (!button || !modal) return;
  setupAccountCardMotion(document.getElementById("settings-account-card"), {
    root: modal,
    toggle: document.getElementById("settings-account-card-motion"),
    status: document.getElementById("settings-account-card-motion-status")
  });
  customizationSettings = setupCustomizationSettings(modal, {
    getState: () => settingsOptions.getState?.() ?? {},
    onChange: (group, patch) => settingsOptions.onCustomizationChange?.(group, patch),
    getMapView: () => settingsOptions.getMapView?.()
  });
  settingsChoiceLists = setupSettingsChoiceLists(modal);
  settingsNavigator = createSettingsNavigator(modal, { onOpenGroup(group) {
    if (group.matches(".settings-changelog-group")) renderSettingsChangelog();
    void renderSettingsLegalDocument(group);
  } });

  button.addEventListener("click", openSettingsModal);
  modal.addEventListener("keydown", event => {
    const option = event.target.closest?.("[data-settings-temperature-source]");
    if (!option || !["ArrowDown","ArrowUp","ArrowLeft","ArrowRight","Home","End"].includes(event.key)) return;
    event.preventDefault();
    const options = [...modal.querySelectorAll("[data-settings-temperature-source]")].filter(button => !button.disabled && !button.hidden);
    const index = options.indexOf(option);
    const next = event.key === "Home" ? options[0] : event.key === "End" ? options.at(-1)
      : options[(index + (["ArrowUp","ArrowLeft"].includes(event.key) ? -1 : 1) + options.length) % options.length];
    next?.focus(); next?.click();
  });
  document.getElementById("settings-profile-file")?.addEventListener("change", event => {
    void chooseSettingsProfileImage(event.target);
  });
  document.getElementById("settings-profile-display-name")?.addEventListener("input", renderSettingsProfileImage);
  modal.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-settings-modal-close]")) {
      closeSettingsModal();
      return;
    }
    if (settingsNavigator.handleClick(event)) return;

    if (event.target.closest("[data-settings-filter-clear]")) {
      resetSettingsFilter({ focus: true });
      return;
    }

    const addResult = event.target.closest("[data-settings-add-my-area]");
    if (addResult) {
      const area = parseAreaDataset(addResult.dataset);
      settingsOptions.onAddArea?.(area);
      clearSettingsSearch();
      return;
    }

    const removeButton = event.target.closest("[data-settings-remove-my-area]");
    if (removeButton?.dataset.settingsRemoveMyArea) {
      settingsOptions.onRemoveArea?.(removeButton.dataset.settingsRemoveMyArea);
      return;
    }

    const clearPdfButton = event.target.closest("[data-settings-clear-disaster-map-pdf]");
    if (clearPdfButton) {
      void clearStoredDisasterMapPdfFromSettings(clearPdfButton);
      return;
    }

    if (event.target.closest("[data-settings-push-toggle]")) {
      void settingsOptions.onToggleAdminNoticePush?.();
      return;
    }

    if (event.target.closest("[data-settings-eew-auto-focus]")) {
      const state = settingsOptions.getState?.() ?? {};
      settingsOptions.onEewAutoFocusChange?.(state.eewAutoFocusEnabled === false);
      renderSettingsEarthquake();
      return;
    }

    if (event.target.closest("[data-settings-earthquake-recent-xml-toggle]")) {
      const state = settingsOptions.getState?.() ?? {};
      settingsOptions.onEarthquakeDistributionRecentXmlChange?.(
        state.earthquakeDistributionRecentXmlVisible === false
      );
      renderSettingsEarthquake();
      return;
    }

    if (event.target.closest("[data-settings-earthquake-history-recent]")) {
      const state = settingsOptions.getState?.() ?? {};
      settingsOptions.onEarthquakeHistoryRecentChange?.(state.earthquakeHistoryRecentEnabled === false);
      renderSettingsEarthquake();
      return;
    }

    const terrainOpacityButton = event.target.closest("[data-settings-terrain-opacity]");
    const terrainColorButton = event.target.closest("[data-settings-terrain-color]");
    const terrainCoverageButton = event.target.closest("[data-settings-terrain-coverage]");
    if (terrainOpacityButton || terrainColorButton || terrainCoverageButton) {
      const state = settingsOptions.getState?.() ?? {};
      settingsOptions.onTerrainLayerChange?.({
        ...state.terrainLayerSettings,
        visible: state.terrainLayerSettings?.visible === true,
        ...(terrainCoverageButton ? { coverage: terrainCoverageButton.dataset.settingsTerrainCoverage }
          : terrainOpacityButton ? { opacity: terrainOpacityButton.dataset.settingsTerrainOpacity }
          : { colorMode: terrainColorButton.dataset.settingsTerrainColor })
      });
      renderSettingsTerrain();
      return;
    }

    if (event.target.closest("[data-settings-early-access-refresh]")) {
      void settingsOptions.onRefreshEarlyAccess?.();
      return;
    }

    if (event.target.closest("[data-settings-profile-remove]")) {
      if (settingsAccountBusy || settingsProfileImageBusy) return;
      settingsProfileAvatar = null;
      renderSettingsProfileImage();
      setSettingsAccountMessage("「変更を保存」を押すと画像を削除します。");
      return;
    }

    if (event.target.closest("[data-settings-account-refresh]")) {
      if (settingsAccountBusy || settingsProfileImageBusy) return;
      void renderSettingsAccount();
      return;
    }

    const accountModeButton = event.target.closest("[data-settings-account-mode]");
    if (accountModeButton) {
      settingsAccountMode = accountModeButton.dataset.settingsAccountMode === "register" ? "register" : "login";
      setSettingsAccountMessage("");
      renderSettingsAccountControls();
      return;
    }

    if (event.target.closest("[data-settings-account-logout]")) {
      void logoutSettingsAccount();
      return;
    }

    const temperatureSourceButton = event.target.closest("[data-settings-temperature-source]");
    if (temperatureSourceButton) {
      void selectTemperatureSource(temperatureSourceButton.dataset.settingsTemperatureSource)
        .catch(error=>console.warn("[MeteoScope] Temperature terms unavailable",error)).finally(renderSettingsAmedasChart);
      return;
    }
    if (event.target.closest("[data-settings-temperature-terms]")) {
      if (canUseTemperatureEstimation(settingsOptions.getState?.())) void openLocalTemperatureTerms({review:true});
      return;
    }
    const amedasChartButton = event.target.closest("[data-settings-amedas-chart]");
    if (amedasChartButton) {
      if (amedasChartButton.getAttribute("aria-checked") === "true") return;
      settingsOptions.onAmedasChartDisplayChange?.(amedasChartButton.dataset.settingsAmedasChart);
      renderSettingsAmedasChart();
      return;
    }

    const colorButton = event.target.closest("[data-settings-color-key]");
    if (colorButton) {
      if (colorButton.getAttribute("aria-checked") === "true") return;
      settingsOptions.onObservationColorsChange?.({ [colorButton.dataset.settingsColorKey]: colorButton.dataset.settingsColorScheme });
      renderSettingsObservationColors();
      return;
    }

    const themeButton = event.target.closest("[data-settings-theme]");
    if (themeButton) {
      settingsOptions.onThemeChange?.(themeButton.dataset.settingsTheme);
      renderSettingsTheme();
      customizationSettings?.render();
      return;
    }

    const languageButton = event.target.closest("[data-settings-language]");
    if (languageButton) {
      settingsOptions.onLanguageChange?.(languageButton.dataset.settingsLanguage);
      renderSettingsLanguage();
      return;
    }

    const tabOrderButton = event.target.closest("[data-settings-tab-order-tab]");
    if (tabOrderButton) {
      handleSettingsTabOrderTap(tabOrderButton.dataset.settingsTabOrderTab);
      return;
    }

    if (event.target.closest("[data-settings-tab-order-reset]")) {
      selectedTabOrderId = null;
      applySettingsTabOrder(getDefaultTabOrder(getSettingsTabs()));
      return;
    }

    if (event.target.closest("[data-settings-open-guide]")) {
      closeSettingsModal();
      settingsOptions.onOpenGuide?.();
      return;
    }

    if (event.target.closest("[data-settings-add-current-location]")) {
      settingsOptions.onAddCurrentLocation?.();
    }
  });

  document.getElementById("settings-my-area-search")?.addEventListener("input", (event) => {
    renderSettingsAreaSearch(event.currentTarget.value);
  });

  document.getElementById("settings-filter-input")?.addEventListener("input", (event) => {
    filterSettingsGroups(event.currentTarget.value);
  });

  modal.querySelectorAll("[data-settings-color-metric], [data-settings-color-period]").forEach(select => {
    select.addEventListener("change", renderSettingsAmedasColorLegend);
  });

  modal.addEventListener("submit", (event) => {
    const profileForm = event.target.closest("[data-settings-account-profile]");
    if (profileForm instanceof HTMLFormElement) {
      event.preventDefault();
      void saveSettingsProfile(profileForm);
      return;
    }
    if (!(event.target instanceof HTMLFormElement)) return;
    const accountForm = event.target.closest("[data-settings-account-form]");
    if (accountForm instanceof HTMLFormElement) {
      event.preventDefault();
      void authenticateSettingsAccount(accountForm, accountForm.dataset.settingsAccountForm);
      return;
    }
    const deleteForm = event.target.closest("[data-settings-account-delete]");
    if (deleteForm instanceof HTMLFormElement) {
      event.preventDefault();
      void deleteSettingsAccount(deleteForm);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const feedbackModal = document.getElementById("feedback-modal");
    if (feedbackModal && !feedbackModal.hidden) return;
    closeSettingsModal();
  });

  window.addEventListener("disaster-map-pdf-storage-change", () => {
    void renderSettingsDisasterMapPdf();
  });
}

export function refreshSettingsModalView() {
  const modal = document.getElementById("settings-modal");
  if (!modal || modal.hidden) return;
  customizationSettings?.render();
  renderSettingsMyAreas();
  renderSettingsTabOrder();
  renderSettingsPushNotifications();
  renderSettingsEarthquake();
  renderSettingsTheme();
  renderSettingsTerrain();
  renderSettingsObservationColors();
  renderSettingsAmedasChart();
  renderSettingsLanguage();
  renderSettingsEarlyAccess();
  void renderSettingsAccount();
  void renderSettingsDisasterMapPdf();
  settingsChoiceLists?.render();
}

export function openSettingsModal() {
  const modal = document.getElementById("settings-modal");
  const button = document.getElementById("settings-button");
  if (!modal) return;
  modal.hidden = false;
  button?.setAttribute("aria-expanded", "true");
  document.body.classList.add("modal-open");
  settingsNavigator.reset();
  customizationSettings?.render();
  setSettingsAccountMessage("");
  renderSettingsMyAreas();
  renderSettingsTabOrder();
  renderSettingsPushNotifications();
  renderSettingsEarthquake();
  renderSettingsTheme();
  renderSettingsTerrain();
  renderSettingsObservationColors();
  renderSettingsAmedasChart();
  renderSettingsLanguage();
  renderSettingsEarlyAccess();
  void renderSettingsAccount();
  void renderSettingsDisasterMapPdf();
  settingsChoiceLists?.render();
}

function closeSettingsModal() {
  const modal = document.getElementById("settings-modal");
  const button = document.getElementById("settings-button");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  button?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("modal-open");
  selectedTabOrderId = null;
  resetSettingsFilter();
}

function renderSettingsEarthquake() {
  const recentButton = document.getElementById("settings-earthquake-history-recent");
  if (recentButton) {
    const enabled = settingsOptions.getState?.()?.earthquakeHistoryRecentEnabled !== false;
    recentButton.classList.toggle("is-enabled", enabled);
    recentButton.setAttribute("aria-checked", String(enabled));
  }
  const focusButton = document.getElementById("settings-eew-auto-focus");
  if (focusButton) {
    const state = settingsOptions.getState?.() ?? {};
    const enabled = state.eewAutoFocusEnabled !== false;
    focusButton.closest(".settings-detail-item").hidden = !state.earlyAccessEnabled;
    focusButton.classList.toggle("is-enabled", enabled);
    focusButton.setAttribute("aria-checked", String(enabled));
  }
  const button = document.getElementById("settings-earthquake-recent-xml-toggle");
  if (!button) return;
  const state = settingsOptions.getState?.() ?? {};
  const enabled = state.earthquakeDistributionRecentXmlVisible !== false;
  button.classList.toggle("is-enabled", enabled);
  button.setAttribute("aria-checked", String(enabled));
  button.setAttribute(
    "aria-label",
    `当日・前日の有感地震を${enabled ? "表示" : "非表示"}`
  );
}

async function renderSettingsLegalDocument(group) {
  const container = group.querySelector("[data-settings-legal-document]");
  if (!container || container.dataset.rendered === "true" || container.dataset.loading === "true") return;
  const kind = container.dataset.settingsLegalDocument;
  if (!["terms", "privacy"].includes(kind)) return;
  container.dataset.loading = "true";
  container.textContent = "読み込み中…";
  try {
    container.innerHTML = await loadLegalDocumentMarkup(kind);
    container.dataset.rendered = "true";
  } catch {
    container.textContent = "読み込めませんでした。接続を確認して、もう一度開いてください。";
  } finally {
    delete container.dataset.loading;
  }
}

function renderSettingsChangelog() {
  const container = document.getElementById("settings-changelog-content");
  if (!container || container.dataset.rendered === "true") return;

  const lines = changelogMarkdown.split(/\r?\n/);
  const html = [];
  let listOpen = false;
  let entryOpen = false;
  const closeList = () => {
    if (!listOpen) return;
    html.push("</ul>");
    listOpen = false;
  };
  for (const line of lines) {
    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      const title = escapeHtml(heading[2].trim()).replace(/`([^`]+)`/g, "<code>$1</code>");
      if (level === 1) continue;
      if (level === 2) {
        if (entryOpen) html.push("</section>");
        const date = heading[2].trim().match(/^(\d{4}-\d{2}-\d{2})$/)?.[1];
        html.push(date
          ? `<section class="settings-changelog-entry"><h3><time datetime="${date}">${date}</time></h3>`
          : `<section class="settings-changelog-entry settings-changelog-period"><h3>${title}</h3>`);
        entryOpen = true;
      } else {
        html.push(`<h4>${title}</h4>`);
      }
      continue;
    }

    const item = line.match(/^\s*-\s+(.+)$/);
    if (item) {
      if (!listOpen) {
        html.push("<ul>");
        listOpen = true;
      }
      const content = escapeHtml(item[1].trim()).replace(/`([^`]+)`/g, "<code>$1</code>");
      html.push(`<li>${content}</li>`);
      continue;
    }

    closeList();
  }
  closeList();
  if (entryOpen) html.push("</section>");

  container.innerHTML = html.join("");
  container.dataset.rendered = "true";
}

function renderSettingsObservationColors() {
  const preferences = settingsOptions.getState?.().observationColors ?? {};
  document.querySelectorAll("[data-settings-color-key]").forEach(button => {
    const active = button.dataset.settingsColorScheme === (preferences[button.dataset.settingsColorKey] ?? "meteoscope");
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", String(active));
  });
  const previews = {
    intensity: ["1", "2", "3", "4", "5-", "5+", "6-", "6+", "7"].map(value => ({ label: `震度${value}`, color: getEarthquakeIntensityColor(value) })),
    longPeriod: [1, 2, 3, 4].map(value => ({ label: `階級${value}`, color: getLongPeriodClassStyle(value).color }))
  };
  for (const [key, colors] of Object.entries(previews)) {
    const preview = document.querySelector(`[data-settings-color-preview="${key}"]`);
    if (preview) preview.innerHTML = colors.map(({ label, color }) => `<span title="${escapeHtml(label)}" style="background:${color}"></span>`).join("");
  }
  renderSettingsAmedasColorLegend();
}

function renderSettingsAmedasColorLegend() {
  const metric = document.querySelector("[data-settings-color-metric]")?.value ?? "temperature";
  const period = document.querySelector("[data-settings-color-period]")?.value ?? "1h";
  const periodLabel = document.querySelector("[data-settings-color-period-label]");
  if (periodLabel) periodLabel.hidden = metric !== "precipitation";
  const legend = document.querySelector("[data-settings-amedas-legend]");
  if (legend) legend.innerHTML = renderAmedasColorLegend(metric, period);
}

function filterSettingsGroups(value) {
  settingsNavigator?.search(value);
}

function resetSettingsFilter({ focus = false } = {}) {
  const input = document.getElementById("settings-filter-input");
  if (input) input.value = "";
  filterSettingsGroups("");
  if (focus) input?.focus({ preventScroll: true });
}

function renderSettingsAmedasChart() {
  const state = settingsOptions.getState?.() ?? {};
  const temperatureAllowed = canUseTemperatureEstimation(state);
  for (const protectedSource of ["meteoscope", "auto"]) {
    const estimation = document.querySelector(`[data-settings-temperature-source="${protectedSource}"]`);
    if (estimation) {
      estimation.disabled = !temperatureAllowed;
      estimation.hidden = !temperatureAllowed;
    }
  }
  document.querySelectorAll("[data-settings-temperature-access]").forEach(element => { element.hidden = !temperatureAllowed; });
  const source = effectiveTemperatureSource(state.temperatureSource, temperatureAllowed);
  document.querySelectorAll("[data-settings-temperature-source]").forEach(button => {
    button.setAttribute("aria-checked", String(button.dataset.settingsTemperatureSource === source));
  });
  document.querySelectorAll("[data-settings-amedas-chart]").forEach(button => {
    button.setAttribute("aria-checked", String(button.dataset.settingsAmedasChart === (state.amedasChartDisplay ?? "continuous")));
  });
  const note = document.querySelector("[data-settings-amedas-chart-access]");
  if (note) note.hidden = Boolean(state.earlyAccessEnabled);
}

function renderSettingsMyAreas() {
  const state = settingsOptions.getState?.() ?? {};
  const areas = state.myAreas ?? [];
  const limit = state.myAreaLimit ?? 8;
  const list = document.getElementById("settings-my-area-list");
  const count = document.getElementById("settings-my-area-count");
  const currentButton = document.getElementById("settings-my-area-current");
  if (count) count.textContent = `${areas.length}/${limit}`;

  if (currentButton) {
    const canAddCurrent = state.currentLocation?.status === "found" && state.currentLocation?.areaCode;
    currentButton.disabled = !canAddCurrent || areas.length >= limit;
    currentButton.textContent = canAddCurrent
      ? `${state.currentLocation.prefecture ?? ""}${state.currentLocation.areaName ?? ""}を追加`
      : "現在地をマイエリアに追加";
  }

  if (!list) return;
  if (!areas.length) {
    list.innerHTML = `<p class="settings-my-area-empty">マイエリアはまだ登録されていません。</p>`;
    return;
  }

  list.innerHTML = areas.map((area) => `
    <div class="settings-my-area-item">
      <div>
        <strong>${escapeHtml(area.areaName)}</strong>
        <span>${escapeHtml(area.prefecture || "地域未取得")}</span>
      </div>
      <button type="button" data-settings-remove-my-area="${escapeHtml(area.areaCode)}">削除</button>
    </div>
  `).join("");
}

function renderSettingsPushNotifications() {
  const state = settingsOptions.getState?.() ?? {};
  const push = state.adminNoticePush ?? {};
  const title = document.getElementById("settings-push-title");
  const status = document.getElementById("settings-push-status");
  const button = document.getElementById("settings-push-toggle");
  if (!title || !status || !button) return;

  const enabled = Boolean(push.enabled && push.subscribed);
  const subscribed = Boolean(push.subscribed);
  const busy = Boolean(push.busy);
  const configured = push.configured === true;
  const supported = push.supported === true;
  const canEnable = supported && configured;

  button.disabled = busy || (!subscribed && !canEnable);
  button.classList.toggle("is-enabled", enabled);
  button.textContent = busy ? "処理中" : subscribed ? "無効にする" : "有効にする";
  if (enabled) {
    title.textContent = "お知らせ通知は有効です";
    status.textContent = push.message || "MeteoScope管理者からのお知らせを受け取ります。";
    return;
  }

  title.textContent = "通知は無効です";
  if (!supported) {
    status.textContent = "このブラウザではWeb通知を利用できません。";
  } else if (!configured) {
    status.textContent = "通知サーバーの設定が未完了です。";
  } else {
    status.textContent = push.message || "メンテナンスなどの重要なお知らせを通知できます。";
  }
}

function renderSettingsTheme() {
  const state = settingsOptions.getState?.() ?? {};
  const preference = state.themePreference ?? "system";
  document.querySelectorAll("#settings-theme-options [data-settings-theme]").forEach((button) => {
    const active = button.dataset.settingsTheme === preference;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", active ? "true" : "false");
  });
}

function renderSettingsTerrain() {
  const state = settingsOptions.getState?.() ?? {};
  const terrain = state.terrainLayerSettings ?? {};
  const enabled = terrain.visible === true;
  const opacity = Number(terrain.opacity) || 0.48;
  document.querySelectorAll("[data-settings-terrain-coverage]").forEach(button => {
    const selected = button.dataset.settingsTerrainCoverage === (terrain.coverage ?? "auto");
    button.classList.toggle("active", selected);
    button.setAttribute("aria-checked", String(selected));
  });
  document.querySelectorAll("[data-settings-terrain-color]").forEach((button) => {
    const selected = button.dataset.settingsTerrainColor === (terrain.colorMode ?? "color");
    button.classList.toggle("active", selected);
    button.setAttribute("aria-checked", String(selected));
    button.disabled = terrain.coverage === "global";
  });
  const options = document.getElementById("settings-terrain-opacity-options");
  const status = document.getElementById("settings-terrain-status");
  if (options) options.toggleAttribute("disabled", !enabled);
  document.querySelectorAll("[data-settings-terrain-opacity]").forEach((button) => {
    const selected = Number(button.dataset.settingsTerrainOpacity) === opacity;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-checked", String(selected));
    button.disabled = !enabled;
  });
  if (status) status.textContent = enabled
    ? "地図のレイヤーメニューにある「地形」でON/OFFを切り替えます。"
    : "地形はOFFです。表示方法は保存され、次にONにしたときに適用されます。";
}

function renderSettingsLanguage() {
  const state = settingsOptions.getState?.() ?? {};
  const preference = state.languagePreference === "en" ? "en" : "ja";
  document.querySelectorAll("#settings-language-options [data-settings-language]").forEach((button) => {
    const active = button.dataset.settingsLanguage === preference;
    button.classList.toggle("active", active);
    button.setAttribute("aria-checked", active ? "true" : "false");
  });
}

function renderSettingsEarlyAccess() {
  const state = settingsOptions.getState?.() ?? {};
  const access = state.earlyAccessState ?? {};
  const active = document.getElementById("settings-early-access-active");
  const status = document.getElementById("settings-early-access-status");
  if (!active || !status) return;
  active.hidden = !access.active;
  document.getElementById("settings-early-access-label").textContent = access.label || "認証済み";
  status.textContent = access.message || "";
  status.dataset.state = access.active ? "active" : access.status || "inactive";
}

async function renderSettingsAccount() {
  const name = document.getElementById("settings-account-name");
  const status = document.getElementById("settings-account-status");
  const refreshButton = document.getElementById("settings-account-refresh");
  if (!name || !status || !(refreshButton instanceof HTMLButtonElement)) return;

  const requestId = ++settingsAccountRequestId;
  settingsProfileImageRequest += 1;
  settingsProfileImageBusy = false;
  settingsProfileAvatar = undefined;
  name.textContent = "確認中...";
  status.textContent = "MeteoScopeアカウントの状態を確認しています。";
  status.dataset.state = "loading";
  refreshButton.disabled = true;
  refreshButton.textContent = "確認中";
  settingsAccountAvailable = false;
  settingsAccount = null;
  renderSettingsAccountControls();

  try {
    const configuration = await QuizRankingClient.configuration();
    if (requestId !== settingsAccountRequestId) return;
    if (!configuration.enabled) {
      name.textContent = "ランキング基盤は準備中です";
      status.textContent = "アカウント機能は現在準備中です。";
      status.dataset.state = "unavailable";
      return;
    }

    settingsAccountAvailable = true;
    const result = await QuizRankingClient.account();
    if (requestId !== settingsAccountRequestId) return;
    if (result.authenticated && result.account?.displayName) {
      settingsAccount = result.account;
      const displayNameInput = document.getElementById("settings-profile-display-name");
      if (displayNameInput) displayNameInput.value = result.account.displayName;
      name.textContent = result.account.displayName;
      status.textContent = "MeteoScopeアカウントでログイン中";
      status.dataset.state = "authenticated";
    } else {
      settingsAccount = null;
      name.textContent = "未ログイン";
      status.textContent = "ログインまたは新規作成してアカウント機能を利用できます。";
      status.dataset.state = "signed-out";
    }
  } catch (error) {
    if (requestId !== settingsAccountRequestId) return;
    name.textContent = "状態を確認できません";
    status.textContent = error instanceof Error ? error.message : "アカウントサーバーへ接続できませんでした。";
    status.dataset.state = "error";
  } finally {
    if (requestId === settingsAccountRequestId) {
      refreshButton.disabled = false;
      refreshButton.textContent = "更新";
      renderSettingsAccountControls();
    }
  }
}

function renderSettingsAccountControls() {
  const authPanel = document.getElementById("settings-account-auth");
  const actions = document.getElementById("settings-account-actions");
  if (authPanel) authPanel.hidden = !settingsAccountAvailable || Boolean(settingsAccount);
  if (actions) actions.hidden = !settingsAccountAvailable || !settingsAccount;
  const profile = document.getElementById("settings-account-profile");
  if (profile) profile.querySelector("fieldset").disabled = settingsAccountBusy || settingsProfileImageBusy;
  renderSettingsProfileImage();

  document.querySelectorAll("[data-settings-account-mode]").forEach((button) => {
    const active = button.dataset.settingsAccountMode === settingsAccountMode;
    button.setAttribute("aria-selected", String(active));
    button.classList.toggle("active", active);
  });
  document.querySelectorAll("[data-settings-account-form]").forEach((form) => {
    form.hidden = form.dataset.settingsAccountForm !== settingsAccountMode;
  });
  document.querySelectorAll("#settings-modal .settings-account-auth button, #settings-modal .settings-account-actions button").forEach((button) => {
    button.disabled = settingsAccountBusy || settingsProfileImageBusy;
  });
}

function renderSettingsProfileImage() {
  const image = document.getElementById("settings-profile-image");
  const initial = document.getElementById("settings-profile-initial");
  if (!image || !initial) return;
  const card = document.getElementById("settings-account-card");
  if (card) card.hidden = !settingsAccountAvailable || !settingsAccount;
  document.querySelector(".settings-account-row")?.classList.toggle("has-digital-card", Boolean(settingsAccount));
  const draftName = document.getElementById("settings-profile-display-name")?.value ?? "";
  const displayName = draftName.trim() || settingsAccount?.displayName || "";
  const cardName = document.getElementById("settings-account-card-name");
  if (cardName) cardName.textContent = displayName;
  const created = document.getElementById("settings-account-card-created");
  if (created) {
    const date = formatJstDate(settingsAccount?.createdAt);
    created.hidden = !date;
    created.dateTime = date;
    created.textContent = date ? `MEMBER SINCE ${date.replaceAll("-", ".")}` : "";
  }
  const cardId = document.getElementById("settings-account-card-id");
  if (cardId) cardId.textContent = settingsAccount?.id ?? "";
  const preview = document.getElementById("settings-account-card-preview");
  if (preview) preview.hidden = settingsProfileAvatar === undefined && draftName === (settingsAccount?.displayName ?? "");
  const avatar = settingsProfileAvatar === undefined ? settingsAccount?.avatarDataUrl : settingsProfileAvatar;
  image.hidden = !avatar;
  if (avatar) image.src = avatar; else image.removeAttribute("src");
  initial.hidden = Boolean(avatar);
  initial.textContent = Array.from(displayName)[0] ?? "";
  const remove = document.querySelector("[data-settings-profile-remove]");
  if (remove) remove.hidden = !avatar;
}

async function chooseSettingsProfileImage(input) {
  const file = input.files?.[0];
  if (!file || !settingsAccount || settingsAccountBusy || settingsProfileImageBusy) return;
  const request = ++settingsProfileImageRequest;
  const accountId = settingsAccount.id;
  settingsProfileImageBusy = true;
  setSettingsAccountMessage("画像を準備しています…");
  renderSettingsAccountControls();
  try {
    const avatar = await prepareProfileImage(file);
    if (request !== settingsProfileImageRequest || settingsAccount?.id !== accountId) return;
    settingsProfileAvatar = avatar;
    setSettingsAccountMessage("プレビューを確認し、「変更を保存」を押してください。");
  } catch (error) {
    if (request === settingsProfileImageRequest) setSettingsAccountMessage(error.message || "画像を読み込めませんでした。", "error");
  } finally {
    if (request === settingsProfileImageRequest) {
      settingsProfileImageBusy = false;
      input.value = "";
      renderSettingsAccountControls();
    }
  }
}

async function saveSettingsProfile(form) {
  if (!settingsAccount || settingsAccountBusy || settingsProfileImageBusy || !form.reportValidity()) return;
  const accountId = settingsAccount.id;
  const values = { displayName: String(new FormData(form).get("displayName") ?? "") };
  if (settingsProfileAvatar !== undefined) values.avatarDataUrl = settingsProfileAvatar;
  settingsAccountBusy = true;
  setSettingsAccountMessage("保存しています…");
  renderSettingsAccountControls();
  try {
    const result = await QuizRankingClient.updateProfile(values);
    if (settingsAccount?.id !== accountId) return;
    settingsAccount = result.account;
    settingsProfileAvatar = undefined;
    document.getElementById("settings-account-name").textContent = result.account.displayName;
    document.getElementById("settings-profile-display-name").value = result.account.displayName;
    setSettingsAccountMessage("アカウント情報を更新しました。", "success");
  } catch (error) {
    setSettingsAccountMessage(error.message || "アカウント情報を保存できませんでした。", "error");
  } finally {
    settingsAccountBusy = false;
    renderSettingsAccountControls();
  }
}

async function authenticateSettingsAccount(form, action) {
  if (settingsAccountBusy) return;
  settingsAccountBusy = true;
  setSettingsAccountMessage("");
  renderSettingsAccountControls();
  const values = Object.fromEntries(new FormData(form));
  try {
    await (action === "register" ? QuizRankingClient.register(values) : QuizRankingClient.login(values));
    form.reset();
    setSettingsAccountMessage(action === "register" ? "アカウントを作成しました。" : "ログインしました。", "success");
    await renderSettingsAccount();
  } catch (error) {
    setSettingsAccountMessage(error instanceof Error ? error.message : "アカウントを処理できませんでした。", "error");
  } finally {
    settingsAccountBusy = false;
    renderSettingsAccountControls();
  }
}

async function logoutSettingsAccount() {
  if (settingsAccountBusy) return;
  settingsAccountBusy = true;
  setSettingsAccountMessage("");
  renderSettingsAccountControls();
  try {
    await QuizRankingClient.logout();
    setSettingsAccountMessage("ログアウトしました。", "success");
    await renderSettingsAccount();
  } catch (error) {
    setSettingsAccountMessage(error instanceof Error ? error.message : "ログアウトできませんでした。", "error");
  } finally {
    settingsAccountBusy = false;
    renderSettingsAccountControls();
  }
}

async function deleteSettingsAccount(form) {
  if (settingsAccountBusy) return;
  if (!window.confirm("アカウントとすべてのクイズ記録を完全に削除しますか？")) return;
  settingsAccountBusy = true;
  setSettingsAccountMessage("");
  renderSettingsAccountControls();
  try {
    const password = String(new FormData(form).get("password") ?? "");
    await QuizRankingClient.deleteAccount(password);
    form.reset();
    setSettingsAccountMessage("アカウントと記録を削除しました。", "success");
    await renderSettingsAccount();
  } catch (error) {
    setSettingsAccountMessage(error instanceof Error ? error.message : "アカウントを削除できませんでした。", "error");
  } finally {
    settingsAccountBusy = false;
    renderSettingsAccountControls();
  }
}

function setSettingsAccountMessage(message, state = "") {
  const output = document.getElementById("settings-account-message");
  if (!output) return;
  output.textContent = message;
  output.dataset.state = state;
}

function getSettingsTabs() {
  return Array.isArray(settingsOptions.tabs) ? settingsOptions.tabs : [];
}

function getCurrentTabOrder() {
  return normalizeTabOrder(settingsOptions.getTabOrder?.(), getSettingsTabs());
}

function renderSettingsTabOrder() {
  const list = document.getElementById("settings-tab-order-list");
  if (!list) return;

  const tabs = getSettingsTabs();
  const order = getCurrentTabOrder();
  if (!tabs.length || !order.length) {
    list.innerHTML = `<p class="settings-my-area-empty">表示切替ボタンを取得できませんでした。</p>`;
    return;
  }

  const byId = new Map(tabs.map((tab) => [tab.id, tab]));
  const selectedLabel = byId.get(selectedTabOrderId)?.label ?? null;
  const statusText = selectedLabel
    ? `${selectedLabel}を選択中。入れ替えたいボタンをタップしてください。`
    : "入れ替えたいボタンを選び、移動先のボタンをタップしてください。";
  list.innerHTML = `
    <div class="settings-tab-order-preview" role="group" aria-label="表示切替ボタンの並び順">
      ${order.map((id) => {
    const tab = byId.get(id);
    if (!tab) return "";
    const label = tab.label ?? id;
    const shortLabel = document.querySelector(`.tab-button[data-tab="${cssEscape(id)}"] .tab-button-label`)?.textContent?.trim() || label;
    return `
      <button
        class="settings-tab-order-button tab-button ${selectedTabOrderId === id ? "is-selected" : ""}"
        type="button"
        data-tab="${escapeHtml(id)}"
        data-settings-tab-order-tab="${escapeHtml(id)}"
        aria-pressed="${selectedTabOrderId === id ? "true" : "false"}"
        aria-label="${escapeHtml(label)}を選択または入れ替え"
      >
        <span class="tab-button-label">${escapeHtml(shortLabel)}</span>
      </button>
    `;
      }).join("")}
    </div>
    <p class="settings-tab-order-status">${escapeHtml(statusText)}</p>
  `;
}

function handleSettingsTabOrderTap(tabId) {
  if (!tabId) return;
  if (!selectedTabOrderId) {
    selectedTabOrderId = tabId;
    renderSettingsTabOrder();
    return;
  }

  if (selectedTabOrderId === tabId) {
    selectedTabOrderId = null;
    renderSettingsTabOrder();
    return;
  }

  const order = getCurrentTabOrder();
  const fromIndex = order.indexOf(selectedTabOrderId);
  const toIndex = order.indexOf(tabId);
  if (fromIndex < 0 || toIndex < 0) {
    selectedTabOrderId = null;
    renderSettingsTabOrder();
    return;
  }

  [order[fromIndex], order[toIndex]] = [order[toIndex], order[fromIndex]];
  selectedTabOrderId = null;
  applySettingsTabOrder(order);
}

function applySettingsTabOrder(order) {
  const normalized = settingsOptions.onTabOrderChange?.(order) ?? order;
  renderSettingsTabOrder(normalized);
}

async function renderSettingsDisasterMapPdf() {
  const modal = document.getElementById("settings-modal");
  const status = document.getElementById("settings-disaster-map-status");
  const clearButton = document.getElementById("settings-disaster-map-clear");
  if (!modal || modal.hidden || !status || !clearButton) return;

  const requestId = ++settingsPdfStatusRequestId;
  status.textContent = "確認中...";
  clearButton.disabled = true;

  try {
    const info = await settingsOptions.getDisasterMapPdfInfo?.();
    if (requestId !== settingsPdfStatusRequestId) return;
    if (!info?.name) {
      status.textContent = "保存されていません";
      clearButton.disabled = true;
      return;
    }
    status.textContent = `${info.name} を保存中`;
    clearButton.disabled = false;
  } catch (error) {
    if (requestId !== settingsPdfStatusRequestId) return;
    console.warn("[MeteoScope] failed to read stored disaster map PDF", error);
    status.textContent = "保存状態を確認できませんでした";
    clearButton.disabled = true;
  }
}

async function clearStoredDisasterMapPdfFromSettings(button) {
  if (!(button instanceof HTMLButtonElement)) return;
  const status = document.getElementById("settings-disaster-map-status");
  const previousText = button.textContent;
  button.disabled = true;
  button.textContent = "削除中";
  if (status) status.textContent = "削除しています...";

  try {
    await settingsOptions.onClearDisasterMapPdf?.();
    await renderSettingsDisasterMapPdf();
  } catch (error) {
    console.warn("[MeteoScope] failed to clear stored disaster map PDF", error);
    if (status) status.textContent = "削除できませんでした";
    button.disabled = false;
  } finally {
    button.textContent = previousText || "削除";
  }
}

async function renderSettingsAreaSearch(query) {
  const results = document.getElementById("settings-my-area-results");
  if (!results) return;
  const trimmed = String(query ?? "").trim();
  const requestId = ++settingsSearchRequestId;
  if (!trimmed) {
    results.innerHTML = "";
    return;
  }

  results.innerHTML = `<p class="settings-my-area-empty">検索中...</p>`;
  try {
    const areas = await settingsOptions.onSearchArea?.(trimmed) ?? [];
    if (requestId !== settingsSearchRequestId) return;
    if (!areas.length) {
      results.innerHTML = `<p class="settings-my-area-empty">該当する市区町村が見つかりません。</p>`;
      return;
    }
    results.innerHTML = areas.map((area) => `
      <button
        type="button"
        class="settings-my-area-result"
        data-settings-add-my-area
        data-area-code="${escapeHtml(area.areaCode)}"
        data-area-name="${escapeHtml(area.areaName)}"
        data-prefecture="${escapeHtml(area.prefecture)}"
        data-coordinates="${escapeHtml(JSON.stringify(area.coordinates ?? null))}"
      >
        <strong>${escapeHtml(area.areaName)}</strong>
        <span>${escapeHtml(area.prefecture)}</span>
      </button>
    `).join("");
  } catch (error) {
    if (requestId !== settingsSearchRequestId) return;
    console.warn("[MeteoScope] settings area search failed", error);
    results.innerHTML = `<p class="settings-my-area-empty">検索できませんでした。</p>`;
  }
}

function clearSettingsSearch() {
  const input = document.getElementById("settings-my-area-search");
  const results = document.getElementById("settings-my-area-results");
  if (input) input.value = "";
  if (results) results.innerHTML = "";
}

function parseAreaDataset(dataset) {
  let coordinates = null;
  try {
    coordinates = JSON.parse(dataset.coordinates ?? "null");
  } catch {
    coordinates = null;
  }
  return {
    areaCode: dataset.areaCode,
    areaName: dataset.areaName,
    prefecture: dataset.prefecture,
    coordinates
  };
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") return CSS.escape(value);
  return String(value ?? "").replace(/["\\]/g, "\\$&");
}
