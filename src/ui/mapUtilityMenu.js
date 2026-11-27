import { setupMapUtilityReorder } from "./mapUtilityReorder.js";
import { loadCustomization } from "../preferences/customization.js";

export function setupMapUtilityMenu() {
  const toggle = document.getElementById("map-utility-menu-toggle");
  const actions = document.getElementById("map-utility-actions");
  if (!toggle || !actions || toggle.dataset.ready === "true") return;

  toggle.dataset.ready = "true";
  const closeDurationMs = 260;
  let closeTimer = 0;
  let isOpen = false;
  const reorder = setupMapUtilityReorder(actions);
  let customization = loadCustomization();
  const applyCustomization = () => reorder.customize(customization.menu);
  applyCustomization();
  document.addEventListener("meteoscope:customization-change", event => {
    customization = event.detail ?? loadCustomization();
    applyCustomization();
  });

  const finishClose = () => {
    if (isOpen) return;
    actions.hidden = true;
    actions.classList.remove("is-closing");
  };

  const setOpen = (open, { restoreFocus = false } = {}) => {
    if (open === isOpen && (open || actions.hidden)) return;

    isOpen = open;
    window.clearTimeout(closeTimer);
    toggle.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "機能メニューを閉じる" : "機能メニューを開く");
    actions.setAttribute("aria-hidden", String(!open));
    actions.inert = !open;

    if (open) {
      applyCustomization();
      actions.hidden = false;
      actions.classList.remove("is-closing");
      // hidden解除後の初期状態を確定させ、展開アニメーションを確実に開始する。
      void actions.offsetWidth;
      actions.classList.add("is-open");
    } else {
      reorder.cancel();
      actions.classList.remove("is-open");
      actions.classList.add("is-closing");
      closeTimer = window.setTimeout(finishClose, closeDurationMs);
    }

    if (restoreFocus) toggle.focus({ preventScroll: true });
  };

  actions.setAttribute("aria-hidden", "true");
  actions.inert = true;

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(!isOpen);
  });

  actions.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const action = event.target.closest("button");
    if (!action || action.disabled) return;
    setOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (!isOpen || !(event.target instanceof Element)) return;
    if (event.target.closest("#map-utility-menu-toggle, #map-utility-actions")) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isOpen) return;
    setOpen(false, { restoreFocus: true });
  });
}
