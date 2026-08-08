import { getCurrentLanguage } from "./locale.js";
import { buildModalLoadingState } from "./modalLoadingState.js";

let initialized = false;
let handleSelect = () => {};
let pickerState = {
  visible: false,
  options: [],
  selectedKeys: []
};

export function setupWorldTyphoonTargetModal({ onSelect } = {}) {
  if (initialized) return;
  initialized = true;
  handleSelect = onSelect ?? handleSelect;

  document.getElementById("world-typhoon-target-button")?.addEventListener("click", openModal);
  document.getElementById("world-typhoon-target-modal")?.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    if (event.target.closest("[data-world-typhoon-target-close]")) {
      closeModal();
      return;
    }
    const option = event.target.closest("[data-world-typhoon-target-key]");
    if (!option) return;
    handleSelect(option.dataset.worldTyphoonTargetKey ?? "all");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
  window.addEventListener("meteoscope-language-change", () => renderPicker());
}

export function updateWorldTyphoonTargetPicker(nextState = {}) {
  pickerState = {
    visible: Boolean(nextState.visible),
    options: Array.isArray(nextState.options) ? nextState.options : [],
    selectedKeys: Array.isArray(nextState.selectedKeys)
      ? nextState.selectedKeys.map(String)
      : []
  };
  const button = document.getElementById("world-typhoon-target-button");
  if (button) {
    button.hidden = !pickerState.visible;
    button.dataset.selectedCount = String(pickerState.selectedKeys.length);
    button.setAttribute("aria-expanded", String(!document.getElementById("world-typhoon-target-modal")?.hidden));
  }
  if (!pickerState.visible) closeModal();
  renderPicker();
}

function openModal() {
  if (!pickerState.visible) return;
  const modal = document.getElementById("world-typhoon-target-modal");
  if (!modal) return;
  renderPicker();
  modal.hidden = false;
  document.body.classList.add("modal-open");
  document.getElementById("world-typhoon-target-button")?.setAttribute("aria-expanded", "true");
  window.requestAnimationFrame(() => {
    modal.querySelector("[aria-pressed='true']")?.focus();
  });
}

function closeModal() {
  const modal = document.getElementById("world-typhoon-target-modal");
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  document.getElementById("world-typhoon-target-button")?.setAttribute("aria-expanded", "false");
  if (![...document.querySelectorAll(".warning-modal:not([hidden])")].length) {
    document.body.classList.remove("modal-open");
  }
}

function renderPicker() {
  const body = document.getElementById("world-typhoon-target-body");
  const title = document.getElementById("world-typhoon-target-title");
  const kicker = document.querySelector(".world-typhoon-target-panel .settings-modal-kicker");
  if (!body) return;
  const isEnglish = getCurrentLanguage() === "en";
  if (title) title.textContent = isEnglish ? "Select targets" : "対象選択";
  if (kicker) kicker.textContent = isEnglish ? "Global forecasts" : "各国予想";
  const button = document.getElementById("world-typhoon-target-button");
  if (button) {
    const selectedCount = pickerState.selectedKeys.length;
    const label = isEnglish
      ? `Select global forecast targets${selectedCount ? ` (${selectedCount} selected)` : ""}`
      : `各国予想の対象を選択${selectedCount ? `（${selectedCount}件選択中）` : ""}`;
    button.setAttribute("aria-label", label);
    button.title = isEnglish ? "Select targets" : "対象選択";
  }
  const groups = groupOptionsByModel(pickerState.options);
  if (!groups.length) {
    body.innerHTML = buildModalLoadingState({
      title: isEnglish ? "Loading forecast targets" : "予想対象を読み込んでいます",
      detail: isEnglish
        ? "Available systems will appear here."
        : "取得できた台風・熱帯低気圧をここに表示します。"
    });
    return;
  }

  body.innerHTML = `
    <button
      type="button"
      class="world-typhoon-target-option is-all${pickerState.selectedKeys.length === 0 ? " is-selected" : ""}"
      data-world-typhoon-target-key="all"
      aria-pressed="${pickerState.selectedKeys.length === 0}"
    >
      <span class="world-typhoon-target-option-copy">
        <strong>${isEnglish ? "Show all targets" : "すべての対象を表示"}</strong>
        <small>${isEnglish ? "Display every enabled model" : "オンになっている全モデルを表示"}</small>
      </span>
      <i aria-hidden="true"></i>
    </button>
    ${groups.map((group) => `
      <section class="world-typhoon-target-group">
        <h3>
          <span style="--world-target-model-color:${escapeHtml(group.color)}"></span>
          ${escapeHtml(group.label)}
        </h3>
        <div class="world-typhoon-target-options">
          ${group.options.map((option) => buildOptionMarkup(option, pickerState.selectedKeys, isEnglish)).join("")}
        </div>
      </section>
    `).join("")}
  `;
}

function groupOptionsByModel(options) {
  const groups = new Map();
  options.forEach((option) => {
    const modelId = String(option.modelId ?? "");
    if (!groups.has(modelId)) {
      groups.set(modelId, {
        id: modelId,
        label: String(option.modelLabel ?? modelId),
        color: String(option.modelColor ?? "#56b7f2"),
        options: []
      });
    }
    groups.get(modelId).options.push(option);
  });
  return [...groups.values()];
}

function buildOptionMarkup(option, selectedKeys, isEnglish) {
  const selected = selectedKeys.includes(option.key);
  const kind = option.kind === "genesis"
    ? (isEnglish ? "Development candidate" : "発達候補")
    : (isEnglish ? "Typhoon / tropical cyclone" : "台風・熱帯低気圧");
  const members = Number(option.memberCount) || 0;
  const memberLabel = members > 0
    ? (isEnglish ? `${members} tracks` : `${members}本の進路`)
    : (isEnglish ? "Deterministic track" : "単一予想");
  return `
    <button
      type="button"
      class="world-typhoon-target-option${selected ? " is-selected" : ""}"
      data-world-typhoon-target-key="${escapeHtml(option.key)}"
      aria-pressed="${selected}"
    >
      <span class="world-typhoon-target-option-copy">
        <strong>${escapeHtml(option.name)}</strong>
        <small>${escapeHtml(kind)}・${escapeHtml(memberLabel)}</small>
      </span>
      <i aria-hidden="true"></i>
    </button>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
