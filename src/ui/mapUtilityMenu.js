export function setupMapUtilityMenu() {
  const toggle = document.getElementById("map-utility-menu-toggle");
  const actions = document.getElementById("map-utility-actions");
  if (!toggle || !actions || toggle.dataset.ready === "true") return;

  toggle.dataset.ready = "true";

  const setOpen = (open, { restoreFocus = false } = {}) => {
    actions.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "機能メニューを閉じる" : "機能メニューを開く");
    if (restoreFocus) toggle.focus({ preventScroll: true });
  };

  toggle.addEventListener("click", (event) => {
    event.stopPropagation();
    setOpen(actions.hidden);
  });

  actions.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) return;
    const action = event.target.closest("button");
    if (!action || action.disabled) return;
    setOpen(false);
  });

  document.addEventListener("click", (event) => {
    if (actions.hidden || !(event.target instanceof Element)) return;
    if (event.target.closest("#map-utility-menu-toggle, #map-utility-actions")) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || actions.hidden) return;
    setOpen(false, { restoreFocus: true });
  });
}
