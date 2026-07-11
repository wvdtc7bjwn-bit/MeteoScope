import { getDefaultTabOrder, normalizeTabOrder } from "./tabOrder.js";

let settingsModalInitialized = false;
let settingsOptions = {};
let settingsSearchRequestId = 0;
let settingsPdfStatusRequestId = 0;
let selectedTabOrderId = null;
let earlyAccessBusy = false;

export function setupSettingsModal(options = {}) {
  settingsOptions = options;
  if (settingsModalInitialized) return;
  settingsModalInitialized = true;

  const button = document.getElementById("settings-button");
  const modal = document.getElementById("settings-modal");
  if (!button || !modal) return;

  button.addEventListener("click", openSettingsModal);
  modal.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-settings-modal-close]")) {
      closeSettingsModal();
      return;
    }

    const groupToggle = event.target.closest("[data-settings-group-toggle]");
    if (groupToggle) {
      toggleSettingsGroup(groupToggle);
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
      void settingsOptions.onToggleLocationWarningPush?.();
      return;
    }

    if (event.target.closest("[data-settings-push-advisory-toggle]")) {
      void settingsOptions.onToggleLocationWarningAdvisory?.();
      return;
    }

    if (event.target.closest("[data-settings-early-access-activate]")) {
      void submitEarlyAccessCode();
      return;
    }

    if (event.target.closest("[data-settings-early-access-deactivate]")) {
      settingsOptions.onDeactivateEarlyAccess?.();
      renderSettingsEarlyAccess();
      return;
    }

    const themeButton = event.target.closest("[data-settings-theme]");
    if (themeButton) {
      settingsOptions.onThemeChange?.(themeButton.dataset.settingsTheme);
      renderSettingsTheme();
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
  renderSettingsMyAreas();
  renderSettingsTabOrder();
  renderSettingsPushNotifications();
  renderSettingsTheme();
  renderSettingsEarlyAccess();
  void renderSettingsDisasterMapPdf();
}

export function openSettingsModal() {
  const modal = document.getElementById("settings-modal");
  const button = document.getElementById("settings-button");
  if (!modal) return;
  modal.hidden = false;
  button?.setAttribute("aria-expanded", "true");
  document.body.classList.add("modal-open");
  resetSettingsGroups();
  renderSettingsMyAreas();
  renderSettingsTabOrder();
  renderSettingsPushNotifications();
  renderSettingsTheme();
  renderSettingsEarlyAccess();
  void renderSettingsDisasterMapPdf();
}

function closeSettingsModal() {
  const modal = document.getElementById("settings-modal");
  const button = document.getElementById("settings-button");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  button?.setAttribute("aria-expanded", "false");
  document.body.classList.remove("modal-open");
  selectedTabOrderId = null;
}

function resetSettingsGroups() {
  document.querySelectorAll("#settings-modal .settings-group").forEach((group) => {
    setSettingsGroupExpanded(group, false);
  });
}

function toggleSettingsGroup(toggle) {
  const group = toggle.closest(".settings-group");
  if (!group) return;
  setSettingsGroupExpanded(group, toggle.getAttribute("aria-expanded") !== "true");
}

function setSettingsGroupExpanded(group, expanded) {
  const toggle = group.querySelector("[data-settings-group-toggle]");
  const content = group.querySelector(".settings-group-content");
  group.classList.toggle("is-expanded", expanded);
  toggle?.setAttribute("aria-expanded", expanded ? "true" : "false");
  if (content) content.hidden = !expanded;
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
  const push = state.locationWarningPush ?? {};
  const currentLocation = state.currentLocation ?? {};
  const title = document.getElementById("settings-push-title");
  const status = document.getElementById("settings-push-status");
  const button = document.getElementById("settings-push-toggle");
  const advisoryButton = document.getElementById("settings-push-advisory-toggle");
  if (!title || !status || !button) return;

  const currentAreaName = currentLocation.areaName || push.areaName || "";
  const locationReady = currentLocation.status === "found" && currentLocation.areaCode;
  const enabled = Boolean(push.enabled && push.subscribed);
  const busy = Boolean(push.busy);
  const configured = push.configured !== false;
  const supported = push.supported !== false;
  const canEnable = locationReady && supported && configured;

  button.disabled = busy || (!enabled && !canEnable);
  button.classList.toggle("is-enabled", enabled);
  button.textContent = busy ? "処理中" : enabled ? "無効にする" : "有効にする";
  advisoryButton?.setAttribute("aria-pressed", push.notifyAdvisory ? "true" : "false");
  if (advisoryButton) advisoryButton.disabled = busy;

  if (enabled) {
    title.textContent = `${currentAreaName || "現在地"}を監視中`;
    status.textContent = push.message || "警報・危険警報・特別警報の変化を通知します。";
    return;
  }

  title.textContent = "通知は無効です";
  if (!supported) {
    status.textContent = "このブラウザではWeb通知を利用できません。";
  } else if (!configured) {
    status.textContent = "通知サーバーの設定が未完了です。";
  } else if (locationReady) {
    status.textContent = `${currentAreaName}の警報変化を通知できます。`;
  } else {
    status.textContent = push.message || "現在地を取得すると通知を有効にできます。";
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

function renderSettingsEarlyAccess() {
  const state = settingsOptions.getState?.() ?? {};
  const access = state.earlyAccessState ?? {};
  const form = document.getElementById("settings-early-access-form");
  const active = document.getElementById("settings-early-access-active");
  const status = document.getElementById("settings-early-access-status");
  const button = document.getElementById("settings-early-access-activate");
  if (!form || !active || !status || !button) return;
  form.hidden = Boolean(access.active);
  active.hidden = !access.active;
  button.disabled = earlyAccessBusy || access.status === "checking";
  button.textContent = button.disabled ? "確認中" : "認証";
  document.getElementById("settings-early-access-label").textContent = access.label || "認証済み";
  status.textContent = access.message || "";
  status.dataset.state = access.active ? "active" : access.status || "inactive";
}

async function submitEarlyAccessCode() {
  if (earlyAccessBusy) return;
  const input = document.getElementById("settings-early-access-code");
  earlyAccessBusy = true;
  renderSettingsEarlyAccess();
  try {
    const result = await settingsOptions.onActivateEarlyAccess?.(input?.value || "");
    if (result?.active && input) input.value = "";
  } finally {
    earlyAccessBusy = false;
    renderSettingsEarlyAccess();
  }
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

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[char]));
}

