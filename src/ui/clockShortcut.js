import { localizeText } from "./locale.js";

export const CLOCK_SHORTCUT_STORAGE_KEY = "meteoscope.clockShortcut.v1";
export const DEFAULT_CLOCK_SHORTCUT = "support";

export function normalizeClockShortcut(value, choices) {
  return choices.some(choice => choice.value === value) ? value : DEFAULT_CLOCK_SHORTCUT;
}

export function resolveClockShortcut(value, choices) {
  return choices.find(choice => choice.value === value && choice.available)
    ?? choices.find(choice => choice.value === DEFAULT_CLOCK_SHORTCUT);
}

export function loadClockShortcut(storage, choices) {
  try { return normalizeClockShortcut(storage.getItem(CLOCK_SHORTCUT_STORAGE_KEY), choices); }
  catch { return DEFAULT_CLOCK_SHORTCUT; }
}

export function saveClockShortcut(storage, value, choices) {
  try { storage.setItem(CLOCK_SHORTCUT_STORAGE_KEY, normalizeClockShortcut(value, choices)); return true; }
  catch { return false; }
}

export function setupClockShortcut() {
  const launcher = document.getElementById("clock-feedback-button");
  const select = document.getElementById("settings-clock-shortcut");
  const actions = document.getElementById("map-utility-actions");
  const support = document.getElementById("feedback-open");
  const status = document.getElementById("settings-clock-shortcut-status");
  if (!launcher || !select || !actions || !support || launcher.dataset.shortcutReady) return;
  launcher.dataset.shortcutReady = "true";
  const supportIcon = launcher.querySelector("svg").cloneNode(true);
  let selected;
  let saved = true;
  let choices = [];
  let current;

  const render = () => {
    choices = [{ value: DEFAULT_CLOCK_SHORTCUT, label: localizeText("サポート・ご意見"),
      button: support, icon: supportIcon, available: true },
    ...[...actions.querySelectorAll("button[id]")].map(button => ({
      value: button.id,
      label: button.querySelector(".map-utility-label")?.textContent.trim() ?? button.title,
      button, icon: button.querySelector("svg"), available: !button.hidden && !button.disabled
    }))];
    if (selected === undefined) {
      try { selected = loadClockShortcut(window.localStorage, choices); }
      catch { selected = DEFAULT_CLOCK_SHORTCUT; }
    }
    current = resolveClockShortcut(selected, choices);
    const fragment = document.createDocumentFragment();
    choices.forEach(choice => {
      const option = document.createElement("option");
      option.value = choice.value;
      option.textContent = choice.label;
      option.disabled = !choice.available;
      fragment.append(option);
    });
    select.replaceChildren(fragment);
    select.value = normalizeClockShortcut(selected, choices);
    const icon = (current.icon ?? supportIcon).cloneNode(true);
    icon.removeAttribute("class");
    icon.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    launcher.replaceChildren(icon);
    launcher.title = current.label;
    launcher.setAttribute("aria-label", current.value === DEFAULT_CLOCK_SHORTCUT
      ? localizeText("サポート・ご意見を開く") : current.button.getAttribute("aria-label") ?? current.label);
    const controlled = current.value === DEFAULT_CLOCK_SHORTCUT ? "feedback-modal" : current.button.getAttribute("aria-controls");
    if (controlled) {
      launcher.setAttribute("aria-controls", controlled);
      launcher.setAttribute("aria-haspopup", "dialog");
    } else {
      launcher.removeAttribute("aria-controls");
      launcher.removeAttribute("aria-haspopup");
    }
    status.textContent = !saved ? localizeText("設定を保存できませんでした。再読み込みするまで適用されます。")
      : current.value !== selected ? localizeText("選択した機能は現在利用できないため、サポートを表示しています。") : "";
    status.hidden = !status.textContent;
  };

  launcher.addEventListener("click", () => {
    // Availability may have changed while the settings sheet was closed.
    render();
    current.button.click();
  });
  select.addEventListener("change", () => {
    const choice = choices.find(item => item.value === select.value && item.available);
    if (!choice) { render(); return; }
    selected = choice.value;
    try { saved = saveClockShortcut(window.localStorage, selected, choices); }
    catch { saved = false; }
    render();
  });
  // Feature listeners update their availability before this deferred render.
  document.addEventListener("meteoscope:early-access-change", () => queueMicrotask(render));
  window.addEventListener("meteoscope-language-change", () => queueMicrotask(render));
  render();
}
