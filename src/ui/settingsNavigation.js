import { escapeHtml } from "../utils/html.js";
import { localizeText } from "./locale.js";

export const SETTINGS_CATEGORIES = Object.freeze([
  { id: "general", title: "一般", description: "外観・言語・表示切替", selector: ".settings-theme-group, .settings-language-group, .settings-early-access-group, .settings-tab-order-group", icon: "M4 6h16M4 12h16M4 18h16M9 3v6M15 9v6M8 15v6" },
  { id: "map", title: "地図・表示", description: "地形表示・配色・防災マップ", selector: ".settings-observation-colors-group, .settings-terrain-group, .settings-disaster-map-group", icon: "m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16" },
  { id: "earthquake", title: "地震", description: "震央分布・緊急地震速報", selector: ".settings-earthquake-group", icon: "M2 12h4l3-8 5 16 3-8h5" },
  { id: "area", title: "地域・通知", description: "マイエリア・お知らせ通知", selector: ".settings-my-area-group, .settings-push-group", icon: "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM9 10a3 3 0 1 0 6 0 3 3 0 0 0-6 0" },
  { id: "account", title: "アカウント", description: "ログイン状態と登録情報", selector: ".settings-account-group", icon: "M8 7a4 4 0 1 0 8 0 4 4 0 0 0-8 0M4 21v-2a8 8 0 0 1 16 0v2" },
  { id: "support", title: "サポート・情報", description: "使い方・ご意見・更新履歴", selector: '[data-settings-section="support"]', icon: "M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17v.01M2 12a10 10 0 1 0 20 0 10 10 0 0 0-20 0" }
]);

export function createSettingsNavigationState() {
  const root = query => ({ kind: "root", query, scrollTop: 0, focusKey: null });
  let stack = [root("")];
  const current = () => ({ ...stack.at(-1) });
  return {
    current,
    reset() { stack = [root("")]; return current(); },
    search(query) { stack = [root(String(query ?? ""))]; return current(); },
    open(view, { scrollTop = 0, focusKey = null } = {}) {
      Object.assign(stack.at(-1), { scrollTop, focusKey });
      stack.push({ ...view, scrollTop: 0, focusKey: null });
      return current();
    },
    back() { if (stack.length === 1) return null; stack.pop(); return current(); }
  };
}

export function createSettingsNavigator(modal, { onOpenGroup = () => {} } = {}) {
  const state = createSettingsNavigationState();
  const body = modal.querySelector(".settings-modal-body");
  const list = modal.querySelector("[data-settings-navigation-list]");
  const back = modal.querySelector("[data-settings-navigation-back]");
  const title = modal.querySelector("#settings-modal-title");
  const description = modal.querySelector("[data-settings-navigation-description]");
  const filter = modal.querySelector("#settings-filter-input");
  const entries = [...modal.querySelectorAll(".settings-group")].map((group, index) => {
    const category = SETTINGS_CATEGORIES.find(item => group.matches(item.selector));
    if (!category) throw new Error("Uncategorized setting");
    return { id: `settings-item-${index}`, group, category };
  });
  let focusFrame = null;
  let pageAnimation = null;

  const copy = entry => ({
    title: entry.group.querySelector(".settings-group-title-copy strong")?.textContent ?? "",
    description: entry.group.querySelector(".settings-group-title-copy small")?.textContent ?? ""
  });
  const row = (key, heading, detail, icon = "") => `<button type="button" class="settings-navigation-row" data-settings-navigation-key="${escapeHtml(key)}">
    ${icon ? `<span class="settings-navigation-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="${icon}"/></svg></span>` : ""}
    <span class="settings-navigation-copy"><strong>${escapeHtml(heading)}</strong><small>${escapeHtml(detail)}</small></span><span class="settings-navigation-chevron" aria-hidden="true"></span></button>`;

  function render({ restoreFocus = false, animate = false, backwards = false } = {}) {
    const view = state.current();
    const query = view.query?.trim().toLocaleLowerCase() ?? "";
    const selected = entries.find(entry => view.kind === "detail" && entry.id === view.itemId);
    const category = SETTINGS_CATEGORIES.find(item => item.id === view.categoryId);
    const tools = modal.querySelector(".settings-modal-tools");
    tools.hidden = view.kind !== "root";
    back.hidden = view.kind === "root";
    modal.dataset.settingsView = view.kind;
    title.textContent = selected ? copy(selected).title : category?.title ?? "設定";
    description.textContent = selected ? copy(selected).description : category?.description ?? "表示や通知、地域の設定をまとめて変更できます";
    const parent = view.kind === "detail" && view.parentCategory ? category?.title : query ? "検索結果" : "設定";
    back.querySelector("span").textContent = parent;
    back.setAttribute("aria-label", `${parent}に戻る`);
    for (const entry of entries) {
      const active = entry === selected;
      entry.group.hidden = !active;
      entry.group.classList.toggle("is-expanded", active);
      entry.group.querySelector("[data-settings-group-toggle]").hidden = true;
      const content = entry.group.querySelector(".settings-group-content");
      content.hidden = !active;
      content.inert = !active;
    }
    modal.querySelector(".settings-source-note").hidden = view.kind !== "root";
    list.hidden = Boolean(selected);
    let rows = [];
    if (view.kind === "root" && !query) {
      rows = SETTINGS_CATEGORIES.map(item => row(`category:${item.id}`, item.title, item.description, item.icon));
      list.setAttribute("aria-label", "設定カテゴリ");
    } else if (!selected) {
      const matches = entries.filter(entry => {
        if (category) return entry.category === category;
        const text = [copy(entry).title, copy(entry).description, entry.category.title, localizeText(entry.category.title),
          ...Array.from(entry.group.querySelectorAll(".settings-group-content label, .settings-theme-help"), node => node.textContent)].join(" ").toLocaleLowerCase();
        return text.includes(query);
      });
      rows = matches.map(entry => row(`item:${entry.id}`, copy(entry).title,
        query ? `${localizeText(entry.category.title)} · ${copy(entry).description}` : copy(entry).description));
      list.setAttribute("aria-label", category?.title ?? "設定の検索結果");
    }
    list.innerHTML = rows.join("");
    modal.querySelector("[data-settings-filter-clear]").hidden = !query;
    modal.querySelector("[data-settings-filter-empty]").hidden = view.kind !== "root" || !query || rows.length > 0;
    body.scrollTop = view.scrollTop;
    if (focusFrame !== null) cancelAnimationFrame(focusFrame);
    pageAnimation?.cancel();
    if (animate && !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      pageAnimation = (selected?.group ?? list).animate?.([
        { opacity: 0.5, transform: `translateX(${backwards ? -8 : 8}px)` },
        { opacity: 1, transform: "translateX(0)" }
      ], { duration: 150, easing: "ease-out" });
    }
    if (restoreFocus) focusFrame = requestAnimationFrame(() => {
      focusFrame = null;
      const target = view.focusKey
        ? [...list.querySelectorAll("[data-settings-navigation-key]")].find(button => button.dataset.settingsNavigationKey === view.focusKey)
        : back;
      target?.focus({ preventScroll: true });
      body.scrollTop = view.scrollTop;
    });
  }

  function openEntry(entry, { direct = false, focusKey = `item:${entry.id}` } = {}) {
    state.open({ kind: "detail", categoryId: entry.category.id, itemId: entry.id,
      query: state.current().query, parentCategory: !direct && state.current().kind === "category" },
    { scrollTop: body.scrollTop, focusKey });
    render({ restoreFocus: true, animate: true });
    onOpenGroup(entry.group);
  }

  return {
    reset() { state.reset(); filter.value = ""; render(); },
    search(query) { state.search(query); render(); },
    back() { if (!state.back()) return false; render({ restoreFocus: true, animate: true, backwards: true }); return true; },
    handleClick(event) {
      if (event.target.closest("[data-settings-navigation-back]")) { this.back(); return true; }
      const button = event.target.closest("[data-settings-navigation-key]");
      if (!button) return false;
      const key = button.dataset.settingsNavigationKey;
      if (key.startsWith("category:")) {
        const id = key.slice(9);
        const items = entries.filter(entry => entry.category.id === id);
        if (items.length === 1) openEntry(items[0], { direct: true, focusKey: key });
        else {
          state.open({ kind: "category", categoryId: id }, { scrollTop: body.scrollTop, focusKey: key });
          render({ restoreFocus: true, animate: true });
        }
      } else {
        const entry = entries.find(item => item.id === key.slice(5));
        if (entry) openEntry(entry);
      }
      return true;
    }
  };
}
