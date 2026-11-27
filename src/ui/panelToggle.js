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
  let dragPointerId = null;
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
  let horizontalSummarySwipeEnabled = false;
  let motionMetrics = null;
  let transitionTimer = null;
  let transitionGeneration = 0;
  const transitionDuration = 280;
  let frozenSummary = false;

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
      "button, a, input, select, textarea, label, form, [role='button'], [role='tab'], [data-mobile-dock-control]"
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
    if (motionMetrics) return motionMetrics.offsets;
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
    if (document.documentElement.classList.contains("is-drawer-transitioning")) {
      // Read only when a new gesture interrupts CSS motion, never per frame.
      const renderedHeight = parseFloat(window.getComputedStyle(sidebar).height);
      if (Number.isFinite(renderedHeight)) return clampOffset(getSheetHeight() - renderedHeight);
    }
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
      const tabBarHeight = motionMetrics?.tabBarHeight ?? (document.getElementById("main-tabs")?.getBoundingClientRect().height || 68);
      const summaryHeight = motionMetrics?.summaryHeight ?? (mobileContextDock.offsetHeight || 126);
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
    if (frozenSummary && mobileContextDock) {
      mobileContextDock.style.removeProperty("opacity");
      mobileContextDock.style.removeProperty("transform");
      frozenSummary = false;
    }
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

  function stopDrawerMotion() {
    transitionGeneration++;
    if (transitionTimer !== null) window.clearTimeout(transitionTimer);
    transitionTimer = null;
    motionMetrics = null;
    if (layoutNotifyFrame) window.cancelAnimationFrame(layoutNotifyFrame);
    layoutNotifyFrame = 0;
    document.documentElement.classList.remove("is-drawer-transitioning");
  }

  function measureMotion() {
    motionMetrics = null;
    motionMetrics = {
      offsets: getSnapOffsets(),
      tabBarHeight: document.getElementById("main-tabs")?.getBoundingClientRect().height || 68,
      summaryHeight: mobileContextDock?.offsetHeight || 126
    };
  }

  function animateDrawerOffset(applyTarget) {
    stopDrawerMotion();
    cancelPendingDragTransform();
    measureMotion();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    const easing = "cubic-bezier(0.16, 1, 0.3, 1)";
    sidebar.style.transition = reducedMotion ? "none" : `height ${transitionDuration}ms ${easing}, opacity ${transitionDuration}ms ${easing}, transform ${transitionDuration}ms ${easing}`;
    document.documentElement.classList.add("is-drawer-transitioning");
    applyTarget();
    motionMetrics = null;
    if (reducedMotion) {
      finishDrawerMotion();
      return;
    }
    scheduleDrawerCompletion();
  }

  function scheduleDrawerCompletion() {
    if (transitionTimer !== null) window.clearTimeout(transitionTimer);
    const generation = ++transitionGeneration;
    // transitionend normally finishes the motion; this also covers unchanged
    // endpoints, canceled rendering and background tabs without extra resizing.
    transitionTimer = window.setTimeout(() => {
      if (generation === transitionGeneration) finishDrawerMotion();
    }, transitionDuration + 120);
  }

  function finishDrawerMotion() {
    if (!document.documentElement.classList.contains("is-drawer-transitioning")) return;
    stopDrawerMotion();
    notifyLayoutChangeSoon();
  }

  sidebar.addEventListener("transitionend", event => {
    if (event.target === sidebar && ["height", "opacity"].includes(event.propertyName)) finishDrawerMotion();
  });
  sidebar.addEventListener("transitionrun", event => {
    if (event.target === sidebar && document.documentElement.classList.contains("is-drawer-transitioning")) {
      // Rendering may start later on a busy page; count the safety timeout from
      // the browser's transition start rather than interrupting that transition.
      scheduleDrawerCompletion();
    }
  });

  function setDrawerState(state) {
    animateDrawerOffset(() => {
      drawerState = state;
      drawerOffset = null;
      applyTransform(getOffsetForState(state));
    });
  }

  function setDrawerOffset(offset, { transition = false } = {}) {
    if (transition) {
      animateDrawerOffset(() => {
        drawerOffset = clampOffset(offset);
        updateDrawerStateFromOffset(drawerOffset);
        applyTransform(drawerOffset);
      });
      return;
    }
    stopDrawerMotion();
    drawerOffset = clampOffset(offset);
    updateDrawerStateFromOffset(drawerOffset);
    sidebar.style.transition = "none";
    applyTransform(drawerOffset);
    notifyLayoutChange();
  }

  function beginDrag(event, target = handle, initialAxis = "y") {
    const wasTransitioning = document.documentElement.classList.contains("is-drawer-transitioning");
    const renderedOffset = getCurrentOffset();
    const opacity = wasTransitioning ? window.getComputedStyle(sidebar).opacity : null;
    const summaryStyle = wasTransitioning && mobileContextDock ? window.getComputedStyle(mobileContextDock) : null;
    const summaryOpacity = summaryStyle?.opacity;
    const summaryTransform = summaryStyle?.transform;
    stopDrawerMotion();
    measureMotion();
    if (initialAxis === "y") event.preventDefault();
    dragging = true;
    dragPointerId = event.pointerId;
    dragTarget = target;
    dragAxis = initialAxis;
    startX = event.clientX;
    startY = event.clientY;
    currentX = startX;
    lastHorizontalX = startX;
    lastHorizontalTime = event.timeStamp || performance.now();
    horizontalVelocityX = 0;
    horizontalSummarySwipeEnabled = target === mobileContextDock
      && Boolean(mobileContextDock?.querySelector(".mobile-dock-earthquake-summary-track, .mobile-dock-typhoon-track"));
    startOffset = renderedOffset;
    currentOffset = startOffset;
    sidebar.style.transition = "none";
    if (wasTransitioning) {
      // Freeze the rendered frame before disabling transitions for a gesture.
      // Otherwise pointerdown briefly snaps the sheet to its previous target.
      drawerOffset = renderedOffset;
      setVisibleHeight(renderedOffset);
      sidebar.style.opacity = opacity;
      if (mobileContextDock) {
        mobileContextDock.style.opacity = summaryOpacity;
        mobileContextDock.style.transform = summaryTransform;
        frozenSummary = true;
      }
    }
    mobileContextDock?.classList.toggle("is-vertical-dragging", initialAxis === "y");
    if (initialAxis === "y") target.setPointerCapture?.(event.pointerId);
  }

  function isSummaryBoundaryDrag(distance) {
    const page = mobileContextDock?.dataset.tab === "typhoon"
      ? mobileContextDock.dataset.mobileTyphoonSummaryPage
      : mobileContextDock?.dataset.mobileEarthquakeSummaryPage;
    return (["earthquake", "jma"].includes(page) && distance > 0)
      || (["tide", "world"].includes(page) && distance < 0);
  }

  function moveDrag(event) {
    if (!dragging || event.pointerId !== dragPointerId) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    currentX = event.clientX;
    if (dragAxis === null) {
      if (Math.max(Math.abs(deltaX), Math.abs(deltaY)) <= 6) return;
      const prefersHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.12;
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
      const isBoundaryDrag = isSummaryBoundaryDrag(deltaX);
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
    if (!dragging || event.pointerId !== dragPointerId) return;
    const horizontalDistance = (event.clientX ?? currentX) - startX;
    if (dragAxis === "x") {
      const moved = Math.abs(horizontalDistance) > 6;
      const isBoundaryDrag = isSummaryBoundaryDrag(horizontalDistance);
      const visualDistance = isBoundaryDrag ? horizontalDistance * 0.24 : horizontalDistance;
      cancelPendingHorizontalDrag();
      mobileContextDock?.style.setProperty("--mobile-summary-drag-x", `${visualDistance}px`);
      if (mobileContextDock) void mobileContextDock.offsetWidth;
      dragging = false;
      dragPointerId = null;
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
      horizontalSummarySwipeEnabled = false;
      motionMetrics = null;
      if (frozenSummary && ["peek", "full"].includes(drawerState)) setDrawerState(drawerState);
      return;
    }
    const moved = Math.abs(currentOffset - startOffset) > 6 || Math.abs(event.clientY - startY) > 6;
    dragging = false;
    dragPointerId = null;
    cancelPendingDragTransform();
    suppressClickUntil = moved ? Date.now() + 250 : 0;
    mobileContextDock?.classList.remove("is-vertical-dragging");
    dragTarget?.releasePointerCapture?.(event.pointerId);
    dragTarget = null;
    dragAxis = "y";
    horizontalSummarySwipeEnabled = false;
    if (moved) setDrawerOffset(currentOffset);
    // A tap may interrupt an animation before the click handler reverses it.
    // Keep its intended state; treating that tap as a free drag loses direction.
    else if (["peek", "full"].includes(drawerState)) setDrawerState(drawerState);
    else setDrawerOffset(startOffset);
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
    // Segmented controls own their pointer gesture from press through release.
    // Starting the drawer gesture as well makes the window-level drag handler
    // race the control's indicator on iOS standalone/PWA, where touch events
    // are dispatched with a different capture order than in a browser tab.
    if (isDockControlEvent(event)) return;
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

  window.addEventListener("sidebar-drawer-state", (event) => {
    if (["peek", "full"].includes(event.detail)) setDrawerState(event.detail);
  });

  window.addEventListener("resize", () => {
    stopDrawerMotion();
    sidebar.style.transition = "none";
    if (["peek", "full"].includes(drawerState)) drawerOffset = null;
    applyTransform();
    notifyLayoutChange();
  }, { passive: true });
  window.addEventListener("orientationchange", () => {
    window.setTimeout(() => {
      stopDrawerMotion();
      sidebar.style.transition = "none";
      if (["peek", "full"].includes(drawerState)) drawerOffset = null;
      applyTransform();
      notifyLayoutChange();
    }, 250);
  }, { passive: true });
  // Dock controls stop propagation while sliding. Capture the gesture first so
  // their release always clears the drawer drag state before another map touch.
  window.addEventListener("pointermove", moveDrag, { capture: true });
  window.addEventListener("pointerup", finishDrag, { capture: true });
  window.addEventListener("pointercancel", finishDrag, { capture: true });

  applyTransform();
}
