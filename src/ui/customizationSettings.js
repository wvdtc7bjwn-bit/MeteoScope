import { escapeHtml } from "../utils/html.js";
import { CUSTOMIZATION_DEFAULTS } from "../preferences/customization.js";

const select = (group, key, label, choices) => `<label class="settings-customization-field"><span>${label}</span><select aria-label="${label}" data-customization-group="${group}" data-customization-key="${key}">${choices.map(([value, text]) => `<option value="${value}">${text}</option>`).join("")}</select></label>`;
const toggle = (group, key, label) => `<div class="settings-detail-item settings-toggle-item"><div class="settings-customization-toggle settings-switch-row"><span>${label}</span><button type="button" class="settings-switch" role="switch" aria-checked="true" aria-label="${label}" data-customization-toggle="${key}" data-customization-group="${group}"><span class="settings-switch-thumb"></span></button></div></div>`;
const group = (key, title, description, content) => `<section class="settings-group settings-customization-${key}-group"><button class="settings-group-title settings-group-toggle" type="button" aria-expanded="false" data-settings-group-toggle><span class="settings-group-title-copy"><strong>${title}</strong><small>${description}</small></span></button><div class="settings-group-content" hidden>${content}<button type="button" class="settings-tab-order-reset" data-customization-reset="${key}">${key === "menu" ? "表示・お気に入りを標準に戻す" : "標準に戻す"}</button><p class="settings-theme-help" data-customization-status="${key}" role="status"></p></div></section>`;

export function customizationSettingsMarkup() {
  return group("startup", "起動時の表示", "最初のタブと地図範囲", [
    select("startup", "tab", "最初に開くタブ", [["radar", "雨雲レーダー"], ["amedas", "AMeDAS"], ["warnings", "警報・注意報"], ["typhoon", "台風"], ["earthquake", "地震"], ["previous", "前回のタブ"]]),
    select("startup", "viewport", "最初に表示する地図", [["default", "標準の日本周辺"], ["saved", "保存した地図範囲"], ["previous", "前回の地図範囲"]]),
    '<button type="button" class="settings-account-action" data-customization-save-view>今の地図範囲を保存</button><p class="settings-theme-help" data-customization-view-status></p><p class="settings-theme-help">次回の起動から適用します。リンクで指定されたタブを優先します。地図範囲はこの端末内に保存します。</p>'
  ].join("")) + group("menu", "機能メニューの編集", "表示する機能・お気に入り", '<p class="settings-theme-help">お気に入りを先頭に表示します。並び順はメニューの長押しで変更できます。設定は常に表示します。</p><div data-customization-menu-list></div>')
    + group("controls", "地図の操作", "地震のフォーカス・移動の速さ", [
      toggle("controls", "earthquakeFocus", "地震選択時に自動フォーカス"),
      select("controls", "earthquakeZoom", "地震フォーカスの拡大率", [[6, "広め"], [7.4, "標準"], [9, "詳しく"]]),
      '<p class="settings-theme-help">震源と観測点が収まる範囲で拡大します。緊急地震速報の自動フォーカスは地震設定で管理します。</p>',
      select("controls", "cameraSpeed", "地図移動の速さ", [["slow", "ゆっくり"], ["standard", "標準"], ["fast", "速い"], ["instant", "アニメーションなし"]])
    ].join("")) + group("information", "地図の情報量", "AMeDASの表示・行政界", [
      toggle("information", "stationNames", "AMeDASの地点名を表示"),
      toggle("information", "stationValues", "AMeDASの数値を表示"),
      select("information", "markerScale", "AMeDASの表示サイズ", [[0.85, "小さい"], [1, "標準"], [1.2, "大きい"]]),
      '<p class="settings-theme-help">数値を非表示にすると丸い観測点で表示します。地点名は従来と同じ拡大率から表示します。風向・風速の矢印表示は維持します。</p>',
      toggle("information", "boundaries", "行政界を表示"),
      select("information", "boundaryOpacity", "行政界の濃さ", [[0.45, "薄い"], [0.7, "やや薄い"], [1, "標準"]])
    ].join(""));
}

export function setupCustomizationSettings(modal, { getState, onChange, getMapView }) {
  modal.querySelector(".settings-theme-group").insertAdjacentHTML("beforebegin", customizationSettingsMarkup());
  let menuSignature = "";
  const state = () => getState().customization ?? CUSTOMIZATION_DEFAULTS;
  const menuButtons = () => [...document.querySelectorAll("#map-utility-actions > button[id]")].filter(button => !button.hidden);
  function render() {
    const preferences = state();
    for (const element of modal.querySelectorAll("[data-customization-key]")) {
      element.value = String(preferences[element.dataset.customizationGroup][element.dataset.customizationKey]);
    }
    for (const element of modal.querySelectorAll("[data-customization-toggle]")) {
      const enabled = preferences[element.dataset.customizationGroup][element.dataset.customizationToggle];
      element.setAttribute("aria-checked", String(enabled));
      element.classList.toggle("is-enabled", enabled);
    }
    const savedView = preferences.startup.savedView;
    modal.querySelector("[data-customization-view-status]").textContent = savedView
      ? `地図範囲を保存済み · 拡大率 ${savedView.zoom.toFixed(1)}` : "地図範囲はまだ保存されていません。";
    const buttons = menuButtons();
    const signature = buttons.map(button => `${button.id}:${button.querySelector(".map-utility-label")?.textContent}`).sort().join("|");
    if (signature !== menuSignature) {
      menuSignature = signature;
      modal.querySelector("[data-customization-menu-list]").innerHTML = buttons.map(button => `<div class="settings-customization-menu-row"><strong>${escapeHtml(button.querySelector(".map-utility-label")?.textContent ?? button.title)}</strong><label><input type="checkbox" data-customization-menu-visible="${escapeHtml(button.id)}"${button.id === "settings-button" ? " disabled" : ""}>表示</label><label><input type="checkbox" data-customization-menu-pinned="${escapeHtml(button.id)}">お気に入り</label></div>`).join("");
    }
    for (const input of modal.querySelectorAll("[data-customization-menu-visible]")) input.checked = !preferences.menu.hidden.includes(input.dataset.customizationMenuVisible);
    for (const input of modal.querySelectorAll("[data-customization-menu-pinned]")) {
      input.checked = preferences.menu.pinned.includes(input.dataset.customizationMenuPinned);
      input.disabled = preferences.menu.hidden.includes(input.dataset.customizationMenuPinned);
    }
  }
  function save(key, patch) {
    onChange(key, patch);
    render();
  }
  modal.addEventListener("change", event => {
    const element = event.target;
    if (element.matches("[data-customization-key]")) {
      const key = element.dataset.customizationKey;
      save(element.dataset.customizationGroup, { [key]: ["earthquakeZoom", "markerScale", "boundaryOpacity"].includes(key) ? Number(element.value) : element.value });
    }
    for (const [attribute, field, inverse] of [["customizationMenuVisible", "hidden", true], ["customizationMenuPinned", "pinned", false]]) {
      const id = element.dataset[attribute];
      if (!id) continue;
      const selected = new Set(state().menu[field]);
      if (element.checked !== inverse) selected.add(id); else selected.delete(id);
      save("menu", { [field]: [...selected] });
    }
  });
  modal.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    const key = button.dataset.customizationToggle;
    const section = button.dataset.customizationGroup;
    if (key) save(section, { [key]: !state()[section][key] });
    if (button.dataset.customizationReset) {
      const target = button.dataset.customizationReset;
      save(target, CUSTOMIZATION_DEFAULTS[target]);
      modal.querySelector(`[data-customization-status="${target}"]`).textContent = "標準に戻しました。";
    }
    if (button.hasAttribute("data-customization-save-view")) {
      const view = getMapView?.();
      if (view) save("startup", { savedView: view, viewport: "saved" });
      modal.querySelector('[data-customization-status="startup"]').textContent = view ? "今の地図範囲を保存しました。" : "地図の読み込み完了後にお試しください。";
    }
  });
  return { render };
}
