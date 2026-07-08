let panelToggleInitialized = false;

export function setupPanelToggle({ onLayoutChange } = {}) {
  if (panelToggleInitialized) return;
  panelToggleInitialized = true;

  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const isMobileSheet = () => window.matchMedia("(max-width: 800px)").matches;
  const isPortraitSheet = () => window.matchMedia("(max-width: 800px) and (orientation: portrait)").matches;
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

  let drawerState = "peek";
  let drawerOffset = null;
  let dragging = false;
  let dragTarget = null;
  let startY = 0;
  let startOffset = 0;
  let currentOffset = 0;
  let suppressClickUntil = 0;

  function isDockControlEvent(event) {
    return event.target instanceof Element && Boolean(event.target.closest("[data-mobile-dock-control]"));
  }

  function getSheetHeight() {
    if (isPortraitSheet()) {
      const viewportHeight = window.innerHeight || 0;
      const narrowPhone = (window.innerWidth || 0) <= 420;
      const ratio = narrowPhone ? 0.72 : 0.7;
      const maxHeight = narrowPhone ? 590 : 620;
      const minHeight = narrowPhone ? 330 : 360;
      return Math.max(minHeight, Math.min(viewportHeight * ratio, maxHeight));
    }
    return sidebar.getBoundingClientRect().height || 0;
  }

  function getPeekVisibleHeight() {
    const viewportHeight = window.innerHeight || 0;
    if (window.matchMedia("(max-width: 800px) and (orientation: portrait)").matches) {
      const tabBarHeight = document.getElementById("main-tabs")?.getBoundingClientRect().height || 74;
      return Math.max(68, Math.min(96, tabBarHeight));
    }
    return Math.min(260, Math.max(178, viewportHeight * 0.34));
  }

  function getMiddleVisibleHeight() {
    const sidebarHeight = getSheetHeight();
    const viewportHeight = window.innerHeight || 0;
    const peekHeight = getPeekVisibleHeight();
    return Math.min(
      Math.max(peekHeight + 132, viewportHeight * 0.56),
      Math.max(peekHeight, sidebarHeight - 52),
      sidebarHeight
    );
  }

  function getSnapOffsets() {
    const sidebarHeight = getSheetHeight();
    const peek = Math.max(0, sidebarHeight - getPeekVisibleHeight());
    const middle = Math.max(0, sidebarHeight - getMiddleVisibleHeight());
    return {
      full: 0,
      middle,
      peek
    };
  }

  function getOffsetForState(state) {
    const offsets = getSnapOffsets();
    return offsets[state] ?? offsets.peek;
  }

  function clampOffset(offset) {
    const maxOffset = getSnapOffsets().peek;
    return Math.min(maxOffset, Math.max(0, offset));
  }

  function getCurrentOffset() {
    return drawerOffset ?? getOffsetForState(drawerState);
  }

  function updateDrawerStateFromOffset(offset) {
    const offsets = getSnapOffsets();
    if (offset <= 2) {
      drawerState = "full";
      return;
    }
    if (offset >= offsets.peek - 2) {
      drawerState = "peek";
      return;
    }
    drawerState = "free";
  }

  function setVisibleHeight(offset) {
    const sidebarHeight = getSheetHeight();
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
      sidebar.classList.remove("drawer-middle");
      document.documentElement.classList.remove("mobile-drawer-open");
      handle.setAttribute("aria-expanded", "false");
      document.documentElement.style.removeProperty("--mobile-sidebar-visible-height");
      drawerOffset = null;
      return;
    }

    const nextOffset = clampOffset(offset ?? getCurrentOffset());
    sidebar.style.transform = isPortraitSheet() ? "translateY(0)" : `translateY(${nextOffset}px)`;
    sidebar.classList.toggle("drawer-open", nextOffset <= 2);
    sidebar.classList.toggle("drawer-middle", nextOffset > 2 && nextOffset < getSnapOffsets().peek - 2);
    document.documentElement.classList.toggle("mobile-drawer-open", nextOffset < getSnapOffsets().peek - 2);
    const isExpanded = nextOffset < getSnapOffsets().peek - 2;
    handle.setAttribute("aria-expanded", String(isExpanded));
    mobileContextDock?.setAttribute("aria-expanded", String(isExpanded));
    setVisibleHeight(nextOffset);
  }

  function setDrawerState(state) {
    drawerState = state;
    drawerOffset = null;
    sidebar.style.transition = "transform 340ms cubic-bezier(0.16, 1, 0.3, 1), height 320ms cubic-bezier(0.16, 1, 0.3, 1), opacity 220ms ease, filter 220ms ease";
    applyTransform();
    window.setTimeout(notifyLayoutChange, 350);
  }

  function setDrawerOffset(offset, { transition = false } = {}) {
    drawerOffset = clampOffset(offset);
    updateDrawerStateFromOffset(drawerOffset);
    sidebar.style.transition = transition
      ? "transform 260ms cubic-bezier(0.16, 1, 0.3, 1), height 240ms cubic-bezier(0.16, 1, 0.3, 1), opacity 180ms ease, filter 180ms ease"
      : "none";
    applyTransform(drawerOffset);
    notifyLayoutChange();
  }

  function beginDrag(event, target = handle) {
    if (!isMobileSheet()) return;
    dragging = true;
    dragTarget = target;
    startY = event.clientY;
    startOffset = getCurrentOffset();
    currentOffset = startOffset;
    sidebar.style.transition = "none";
    target.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!dragging) return;
    const maxOffset = getSnapOffsets().peek;
    currentOffset = Math.min(maxOffset, Math.max(0, startOffset + event.clientY - startY));
    applyTransform(currentOffset);
    notifyLayoutChange();
  }

  handle.addEventListener("pointerdown", (event) => beginDrag(event, handle));
  handle.addEventListener("pointermove", moveDrag);

  function finishDrag(event) {
    if (!dragging) return;
    const moved = Math.abs(currentOffset - startOffset) > 6 || Math.abs(event.clientY - startY) > 6;
    dragging = false;
    suppressClickUntil = moved ? Date.now() + 250 : 0;
    dragTarget?.releasePointerCapture?.(event.pointerId);
    dragTarget = null;
    setDrawerOffset(moved ? currentOffset : startOffset);
  }

  handle.addEventListener("pointerup", finishDrag);
  handle.addEventListener("pointercancel", finishDrag);
  handle.addEventListener("click", () => {
    if (Date.now() < suppressClickUntil || !isMobileSheet()) return;
    setDrawerState(drawerState === "full" ? "peek" : "full");
  });
  handle.addEventListener("keydown", (event) => {
    if (!isMobileSheet()) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setDrawerOffset(getCurrentOffset() - 96, { transition: true });
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setDrawerOffset(getCurrentOffset() + 96, { transition: true });
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setDrawerState(drawerState === "full" ? "peek" : "full");
  });

  const mobileContextDock = document.getElementById("mobile-context-dock");
  mobileContextDock?.addEventListener("pointerdown", (event) => {
    if (isDockControlEvent(event)) return;
    beginDrag(event, mobileContextDock);
  });
  mobileContextDock?.addEventListener("pointermove", moveDrag);
  mobileContextDock?.addEventListener("pointerup", finishDrag);
  mobileContextDock?.addEventListener("pointercancel", finishDrag);
  mobileContextDock?.setAttribute("aria-expanded", "false");
  mobileContextDock?.addEventListener("click", (event) => {
    if (isDockControlEvent(event)) return;
    if (Date.now() < suppressClickUntil || !isMobileSheet()) return;
    setDrawerState("full");
  });
  mobileContextDock?.addEventListener("keydown", (event) => {
    if (isDockControlEvent(event)) return;
    if (!isMobileSheet()) return;
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setDrawerOffset(getCurrentOffset() - 96, { transition: true });
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setDrawerOffset(getCurrentOffset() + 96, { transition: true });
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    setDrawerState("full");
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
