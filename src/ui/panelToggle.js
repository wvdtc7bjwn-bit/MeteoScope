let panelToggleInitialized = false;

export function setupPanelToggle({ onLayoutChange } = {}) {
  if (panelToggleInitialized) return;
  panelToggleInitialized = true;

  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

  const isMobileSheet = () => window.matchMedia("(max-width: 800px)").matches;
  const isPortraitSheet = () => window.matchMedia("(max-width: 800px) and (orientation: portrait)").matches;
  const mobileContextDock = document.getElementById("mobile-context-dock");
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
  let dragAxis = "y";
  let startX = 0;
  let startY = 0;
  let currentX = 0;
  let startOffset = 0;
  let currentOffset = 0;
  let suppressClickUntil = 0;
  let layoutNotifyFrame = 0;
  let dragTransformFrame = 0;
  let pendingDragOffset = null;

  function isDockControlEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    return path.some((node) => node instanceof Element && (
      node.matches("[data-mobile-dock-control], .mobile-dock-segmented") ||
      Boolean(node.closest("[data-mobile-dock-control], .mobile-dock-segmented"))
    ));
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

  function notifyLayoutChangeSoon() {
    if (layoutNotifyFrame) return;
    layoutNotifyFrame = window.requestAnimationFrame(() => {
      layoutNotifyFrame = 0;
      notifyLayoutChange();
    });
  }

  function applyDragTransformSoon(offset) {
    pendingDragOffset = offset;
    if (dragTransformFrame) return;
    dragTransformFrame = window.requestAnimationFrame(() => {
      dragTransformFrame = 0;
      const nextOffset = pendingDragOffset;
      pendingDragOffset = null;
      if (!dragging || nextOffset == null) return;
      applyTransform(nextOffset);
      notifyLayoutChangeSoon();
    });
  }

  function cancelPendingDragTransform() {
    if (!dragTransformFrame) return;
    window.cancelAnimationFrame(dragTransformFrame);
    dragTransformFrame = 0;
    pendingDragOffset = null;
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

  function beginDrag(event, target = handle, initialAxis = "y") {
    if (!isMobileSheet()) return;
    if (initialAxis === "y") event.preventDefault();
    dragging = true;
    dragTarget = target;
    dragAxis = initialAxis;
    startX = event.clientX;
    startY = event.clientY;
    currentX = startX;
    startOffset = getCurrentOffset();
    currentOffset = startOffset;
    sidebar.style.transition = "none";
    target.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!dragging) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    currentX = event.clientX;
    if (dragAxis === null) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) <= 6) return;
      dragAxis = Math.abs(deltaX) > Math.abs(deltaY) * 1.12 ? "x" : "y";
    }
    event.preventDefault();
    if (dragAxis === "x") {
      const page = mobileContextDock?.dataset.mobileEarthquakeSummaryPage;
      const isBoundaryDrag = (page === "earthquake" && deltaX > 0)
        || (page === "tide" && deltaX < 0);
      const visualDelta = isBoundaryDrag ? deltaX * 0.24 : deltaX;
      mobileContextDock?.classList.add("is-horizontal-swiping");
      mobileContextDock?.style.setProperty("--mobile-summary-drag-x", `${visualDelta}px`);
      return;
    }
    const maxOffset = getSnapOffsets().peek;
    currentOffset = Math.min(maxOffset, Math.max(0, startOffset + deltaY));
    applyDragTransformSoon(currentOffset);
  }

  handle.addEventListener("pointerdown", (event) => beginDrag(event, handle));
  handle.addEventListener("pointermove", moveDrag);

  function finishDrag(event) {
    if (!dragging) return;
    const horizontalDistance = (event.clientX ?? currentX) - startX;
    if (dragAxis === "x") {
      const moved = Math.abs(horizontalDistance) > 6;
      dragging = false;
      suppressClickUntil = moved ? Date.now() + 250 : 0;
      mobileContextDock?.classList.remove("is-horizontal-swiping");
      mobileContextDock?.dispatchEvent(new CustomEvent("mobile-dock-horizontal-swipe", {
        detail: {
          deltaX: event.type === "pointercancel" ? 0 : horizontalDistance
        }
      }));
      mobileContextDock?.style.setProperty("--mobile-summary-drag-x", "0px");
      dragTarget?.releasePointerCapture?.(event.pointerId);
      dragTarget = null;
      dragAxis = "y";
      return;
    }
    const moved = Math.abs(currentOffset - startOffset) > 6 || Math.abs(event.clientY - startY) > 6;
    dragging = false;
    cancelPendingDragTransform();
    suppressClickUntil = moved ? Date.now() + 250 : 0;
    dragTarget?.releasePointerCapture?.(event.pointerId);
    dragTarget = null;
    dragAxis = "y";
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

  mobileContextDock?.addEventListener("pointerdown", (event) => {
    if (isDockControlEvent(event)) return;
    const supportsHorizontalSwipe = Boolean(
      mobileContextDock.querySelector(".mobile-dock-earthquake-summary-track")
    );
    beginDrag(event, mobileContextDock, supportsHorizontalSwipe ? null : "y");
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
