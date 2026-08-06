let panelToggleInitialized = false;

export function setupPanelToggle({ onLayoutChange } = {}) {
  if (panelToggleInitialized) return;
  panelToggleInitialized = true;

  const sidebar = document.getElementById("sidebar");
  if (!sidebar) return;

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
  let horizontalDragFrame = 0;
  let pendingHorizontalDragX = null;
  let lastHorizontalX = 0;
  let lastHorizontalTime = 0;
  let horizontalVelocityX = 0;
  let dragStartedOnControl = false;
  let horizontalSummarySwipeEnabled = false;

  function isCompactLandscape() {
    return window.matchMedia?.("(orientation: landscape) and (max-width: 1024px) and (max-height: 600px) and (hover: none) and (pointer: coarse)").matches === true;
  }

  function isDockControlEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    return path.some((node) => node instanceof Element && (
      node.matches("[data-mobile-dock-control], .mobile-dock-segmented") ||
      Boolean(node.closest("[data-mobile-dock-control], .mobile-dock-segmented"))
    ));
  }

  function isSidebarGrabEvent(event) {
    const path = typeof event.composedPath === "function" ? event.composedPath() : [event.target];
    if (path.some((node) => node instanceof Element && node.closest("#sidebar-drawer-handle"))) {
      return false;
    }
    const sidebarRect = sidebar.getBoundingClientRect();
    if (event.clientY > sidebarRect.top + 64) return false;
    return !path.some((node) => node instanceof Element && node.matches(
      "button, a, input, select, textarea, [role='button'], [role='tab'], [data-mobile-dock-control]"
    ));
  }

  function getSheetHeight() {
    const viewportHeight = window.innerHeight || 0;
    if (isCompactLandscape()) {
      const minHeight = Math.min(280, Math.max(240, viewportHeight - 16));
      return Math.max(minHeight, Math.min(viewportHeight * 0.82, 480));
    }
    const compactViewport = (window.innerWidth || 0) <= 420;
    const maxHeight = compactViewport ? 590 : 620;
    const minHeight = Math.min(compactViewport ? 330 : 360, Math.max(240, viewportHeight - 24));
    return Math.max(minHeight, Math.min(viewportHeight * 0.72, maxHeight));
  }

  function getPeekVisibleHeight() {
    const tabBarHeight = document.getElementById("main-tabs")?.getBoundingClientRect().height || 74;
    return Math.max(68, Math.min(96, tabBarHeight));
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

  function setDrawerTransition(offset, offsets = getSnapOffsets()) {
    const expansionProgress = Math.min(1, Math.max(0, (offsets.peek - offset) / Math.max(1, offsets.peek)));
    const detailRevealProgress = Math.min(1, Math.max(0, (expansionProgress - 0.04) / 0.58));
    const easedDetailProgress = detailRevealProgress * detailRevealProgress * (3 - 2 * detailRevealProgress);
    sidebar.style.opacity = easedDetailProgress.toFixed(4);
    // Keep the sheet anchored to the bottom-navigation edge while it appears.
    // A subtle scale preserves the soft transition without moving the sheet
    // underneath the navigation before it becomes visible.
    sidebar.style.transform = `scaleY(${(0.985 + easedDetailProgress * 0.015).toFixed(4)}) translateZ(0)`;
    sidebar.style.setProperty("--mobile-detail-reveal-progress", easedDetailProgress.toFixed(4));

    if (mobileContextDock) {
      const tabBarHeight = document.getElementById("main-tabs")?.getBoundingClientRect().height || 68;
      const summaryHeight = mobileContextDock.offsetHeight || 126;
      const retreatDistance = Math.max(72, (summaryHeight + tabBarHeight) / 2 - 1);
      const absorptionProgress = Math.min(1, Math.max(0, (expansionProgress - 0.16) / 0.56));
      mobileContextDock.classList.toggle("is-drawer-grab-active", absorptionProgress < 0.86);
      mobileContextDock.style.setProperty("--mobile-drawer-progress", expansionProgress.toFixed(4));
      mobileContextDock.style.setProperty(
        "--mobile-summary-retreat-y",
        `${(expansionProgress * retreatDistance).toFixed(2)}px`
      );
      mobileContextDock.style.setProperty(
        "--mobile-summary-absorb-opacity",
        (1 - absorptionProgress).toFixed(4)
      );
      mobileContextDock.style.setProperty(
        "--mobile-summary-absorb-scale",
        (1 - absorptionProgress * 0.055).toFixed(4)
      );
    }
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

  function applyHorizontalDragSoon(offset) {
    pendingHorizontalDragX = offset;
    if (horizontalDragFrame) return;
    horizontalDragFrame = window.requestAnimationFrame(() => {
      horizontalDragFrame = 0;
      const nextOffset = pendingHorizontalDragX;
      pendingHorizontalDragX = null;
      if (!dragging || dragAxis !== "x" || nextOffset == null) return;
      mobileContextDock?.style.setProperty("--mobile-summary-drag-x", `${nextOffset}px`);
    });
  }

  function cancelPendingHorizontalDrag() {
    if (horizontalDragFrame) window.cancelAnimationFrame(horizontalDragFrame);
    horizontalDragFrame = 0;
    pendingHorizontalDragX = null;
  }

  function applyTransform(offset = null) {
    const offsets = getSnapOffsets();
    const nextOffset = Math.min(offsets.peek, Math.max(0, offset ?? getCurrentOffset()));
    sidebar.classList.toggle("drawer-open", nextOffset <= 2);
    sidebar.classList.toggle("drawer-middle", nextOffset > 2 && nextOffset < offsets.peek - 2);
    document.documentElement.classList.toggle("mobile-drawer-open", nextOffset < offsets.peek - 2);
    const isExpanded = nextOffset < offsets.peek - 2;
    handle.setAttribute("aria-expanded", String(isExpanded));
    mobileContextDock?.setAttribute("aria-expanded", String(isExpanded));
    setVisibleHeight(nextOffset);
    setDrawerTransition(nextOffset, offsets);
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
    if (initialAxis === "y") event.preventDefault();
    dragging = true;
    dragTarget = target;
    dragAxis = initialAxis;
    startX = event.clientX;
    startY = event.clientY;
    currentX = startX;
    lastHorizontalX = startX;
    lastHorizontalTime = event.timeStamp || performance.now();
    horizontalVelocityX = 0;
    dragStartedOnControl = target === mobileContextDock && isDockControlEvent(event);
    horizontalSummarySwipeEnabled = target === mobileContextDock
      && !dragStartedOnControl
      && Boolean(mobileContextDock?.querySelector(".mobile-dock-earthquake-summary-track"));
    startOffset = getCurrentOffset();
    currentOffset = startOffset;
    sidebar.style.transition = "none";
    mobileContextDock?.classList.toggle("is-vertical-dragging", initialAxis === "y");
    if (initialAxis === "y") target.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!dragging) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    currentX = event.clientX;
    if (dragAxis === null) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) <= 6) return;
      const prefersHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.12;
      if (dragStartedOnControl && prefersHorizontal) {
        dragging = false;
        dragTarget = null;
        dragAxis = "y";
        dragStartedOnControl = false;
        horizontalSummarySwipeEnabled = false;
        return;
      }
      dragAxis = horizontalSummarySwipeEnabled && prefersHorizontal ? "x" : "y";
      mobileContextDock?.classList.toggle("is-vertical-dragging", dragAxis === "y");
      dragTarget?.setPointerCapture?.(event.pointerId);
    }
    event.preventDefault();
    if (dragAxis === "x") {
      const eventTime = event.timeStamp || performance.now();
      const elapsed = Math.max(1, eventTime - lastHorizontalTime);
      const instantaneousVelocity = (event.clientX - lastHorizontalX) / elapsed;
      horizontalVelocityX = horizontalVelocityX * 0.65 + instantaneousVelocity * 0.35;
      lastHorizontalX = event.clientX;
      lastHorizontalTime = eventTime;
      const page = mobileContextDock?.dataset.mobileEarthquakeSummaryPage;
      const isBoundaryDrag = (page === "earthquake" && deltaX > 0)
        || (page === "tide" && deltaX < 0);
      const visualDelta = isBoundaryDrag ? deltaX * 0.24 : deltaX;
      mobileContextDock?.classList.add("is-horizontal-swiping");
      applyHorizontalDragSoon(visualDelta);
      return;
    }
    const maxOffset = getSnapOffsets().peek;
    currentOffset = Math.min(maxOffset, Math.max(0, startOffset + deltaY));
    applyDragTransformSoon(currentOffset);
  }

  handle.addEventListener("pointerdown", (event) => beginDrag(event, handle));

  function finishDrag(event) {
    if (!dragging) return;
    const horizontalDistance = (event.clientX ?? currentX) - startX;
    if (dragAxis === "x") {
      const moved = Math.abs(horizontalDistance) > 6;
      const page = mobileContextDock?.dataset.mobileEarthquakeSummaryPage;
      const isBoundaryDrag = (page === "earthquake" && horizontalDistance > 0)
        || (page === "tide" && horizontalDistance < 0);
      const visualDistance = isBoundaryDrag ? horizontalDistance * 0.24 : horizontalDistance;
      cancelPendingHorizontalDrag();
      mobileContextDock?.style.setProperty("--mobile-summary-drag-x", `${visualDistance}px`);
      if (mobileContextDock) void mobileContextDock.offsetWidth;
      dragging = false;
      suppressClickUntil = moved ? Date.now() + 250 : 0;
      mobileContextDock?.classList.remove("is-vertical-dragging");
      mobileContextDock?.classList.remove("is-horizontal-swiping");
      mobileContextDock?.dispatchEvent(new CustomEvent("mobile-dock-horizontal-swipe", {
        detail: {
          deltaX: event.type === "pointercancel" ? 0 : horizontalDistance,
          velocityX: event.type === "pointercancel" ? 0 : horizontalVelocityX
        }
      }));
      mobileContextDock?.style.setProperty("--mobile-summary-drag-x", "0px");
      dragTarget?.releasePointerCapture?.(event.pointerId);
      dragTarget = null;
      dragAxis = "y";
      dragStartedOnControl = false;
      horizontalSummarySwipeEnabled = false;
      return;
    }
    const moved = Math.abs(currentOffset - startOffset) > 6 || Math.abs(event.clientY - startY) > 6;
    dragging = false;
    cancelPendingDragTransform();
    suppressClickUntil = moved ? Date.now() + 250 : 0;
    mobileContextDock?.classList.remove("is-vertical-dragging");
    dragTarget?.releasePointerCapture?.(event.pointerId);
    dragTarget = null;
    dragAxis = "y";
    dragStartedOnControl = false;
    horizontalSummarySwipeEnabled = false;
    setDrawerOffset(moved ? currentOffset : startOffset);
  }

  handle.addEventListener("click", () => {
    if (Date.now() < suppressClickUntil) return;
    setDrawerState(drawerState === "peek" ? "full" : "peek");
  });
  handle.addEventListener("keydown", (event) => {
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
    setDrawerState(drawerState === "peek" ? "full" : "peek");
  });

  sidebar.addEventListener("pointerdown", (event) => {
    if (!isSidebarGrabEvent(event)) return;
    beginDrag(event, sidebar, "y");
  });

  mobileContextDock?.addEventListener("pointerdown", (event) => {
    beginDrag(event, mobileContextDock, null);
  });
  mobileContextDock?.setAttribute("aria-expanded", "false");
  mobileContextDock?.addEventListener("click", (event) => {
    if (Date.now() >= suppressClickUntil) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, { capture: true });
  mobileContextDock?.addEventListener("click", (event) => {
    if (isDockControlEvent(event)) return;
    if (Date.now() < suppressClickUntil) return;
    setDrawerState("full");
  });
  mobileContextDock?.addEventListener("keydown", (event) => {
    if (isDockControlEvent(event)) return;
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
  window.addEventListener("pointermove", moveDrag);
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);

  applyTransform();
}
