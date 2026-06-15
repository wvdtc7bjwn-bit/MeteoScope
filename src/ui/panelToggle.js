let panelToggleInitialized = false;

export function setupPanelToggle({ onLayoutChange } = {}) {
  if (panelToggleInitialized) return;
  panelToggleInitialized = true;

  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const isMobileSheet = () => window.matchMedia("(max-width: 800px)").matches;
  let handle = document.getElementById("sidebar-drawer-handle");
  if (!handle) {
    handle = document.createElement("div");
    handle.id = "sidebar-drawer-handle";
    handle.setAttribute("role", "button");
    handle.setAttribute("tabindex", "0");
    handle.setAttribute("aria-label", "情報シートを開閉");
    handle.setAttribute("aria-expanded", "false");
    sidebar.prepend(handle);
  }

  let drawerOpen = false;
  let dragging = false;
  let startY = 0;
  let startOffset = 0;
  let currentOffset = 0;
  let suppressClickUntil = 0;

  function getVisibleHeight() {
    const viewportHeight = window.innerHeight || 0;
    return Math.min(260, Math.max(178, viewportHeight * 0.34));
  }

  function getCollapsedOffset() {
    const sidebarHeight = sidebar.getBoundingClientRect().height || 0;
    return Math.max(0, sidebarHeight - getVisibleHeight());
  }

  function setVisibleHeight(offset) {
    const sidebarHeight = sidebar.getBoundingClientRect().height || 0;
    const visibleHeight = Math.max(0, sidebarHeight - offset);
    document.documentElement.style.setProperty("--mobile-sidebar-visible-height", `${visibleHeight}px`);
  }

  function notifyLayoutChange() {
    onLayoutChange?.();
    window.dispatchEvent(new CustomEvent("sidebar-layout-change"));
  }

  function applyTransform(offset = null) {
    if (!isMobileSheet()) {
      sidebar.style.transform = "";
      sidebar.classList.remove("drawer-open");
      handle.setAttribute("aria-expanded", "false");
      document.documentElement.style.removeProperty("--mobile-sidebar-visible-height");
      return;
    }

    const nextOffset = offset ?? (drawerOpen ? 0 : getCollapsedOffset());
    sidebar.style.transform = `translateY(${nextOffset}px)`;
    sidebar.classList.toggle("drawer-open", drawerOpen);
    handle.setAttribute("aria-expanded", String(drawerOpen));
    setVisibleHeight(nextOffset);
  }

  function setDrawerOpen(value) {
    drawerOpen = value;
    sidebar.style.transition = "transform 220ms ease";
    applyTransform();
    window.setTimeout(notifyLayoutChange, 230);
  }

  handle.addEventListener("pointerdown", (event) => {
    if (!isMobileSheet()) return;
    dragging = true;
    startY = event.clientY;
    startOffset = drawerOpen ? 0 : getCollapsedOffset();
    currentOffset = startOffset;
    sidebar.style.transition = "none";
    handle.setPointerCapture?.(event.pointerId);
  });

  handle.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const maxOffset = getCollapsedOffset();
    currentOffset = Math.min(maxOffset, Math.max(0, startOffset + event.clientY - startY));
    applyTransform(currentOffset);
    notifyLayoutChange();
  });

  function finishDrag(event) {
    if (!dragging) return;
    dragging = false;
    suppressClickUntil = Date.now() + 250;
    handle.releasePointerCapture?.(event.pointerId);
    const maxOffset = getCollapsedOffset();
    setDrawerOpen(currentOffset < maxOffset * 0.55);
  }

  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);
  handle.addEventListener("click", () => {
    if (Date.now() < suppressClickUntil || !isMobileSheet()) return;
    setDrawerOpen(!drawerOpen);
  });
  handle.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (isMobileSheet()) setDrawerOpen(!drawerOpen);
  });

  window.addEventListener("resize", () => {
    applyTransform();
    notifyLayoutChange();
  }, { passive: true });
  window.addEventListener("orientationchange", () => {
    window.setTimeout(() => {
      applyTransform();
      notifyLayoutChange();
    }, 250);
  }, { passive: true });

  applyTransform();
}
