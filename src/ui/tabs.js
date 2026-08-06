import { loadTabOrder, normalizeTabOrder, saveTabOrder } from "./tabOrder.js";

export function setupTabs({ onChange, tabs = [] }) {
  const root = document.getElementById("main-tabs");
  let buttons = [...document.querySelectorAll(".tab-button")];
  let dragPointerId = null;
  let dragAxis = "x";
  let dragStartCoord = 0;
  let dragStartIndicatorOffset = 0;
  let dragMoved = false;
  let pendingIndicatorFrame = 0;
  let pendingIndicatorOffset = 0;
  let suppressNextClick = false;
  let resizeFrame = 0;
  let committedTabId = null;
  let pointerStartTabId = null;
  let pointerPreviewTabId = null;
  let pointerPreviewChanged = false;
  let dragTargetTabId = null;

  function refreshButtons() {
    buttons = root ? [...root.querySelectorAll(".tab-button")] : [];
    return buttons;
  }

  function getSliderAxis() {
    if (!root) return "x";
    const rect = root.getBoundingClientRect();
    return rect.height > rect.width ? "y" : "x";
  }

  function getAxisCoordinate(event, axis) {
    return axis === "y" ? event.clientY : event.clientX;
  }

  function getRenderedTabId() {
    return buttons.find((button) => button.classList.contains("active"))?.dataset.tab
      ?? root?.dataset.activeTab
      ?? buttons[0]?.dataset.tab
      ?? null;
  }

  function getActiveTabId() {
    return committedTabId ?? getRenderedTabId();
  }

  function syncIndicatorToActive() {
    if (!root || root.classList.contains("is-dragging")) return;
    refreshButtons();
    const axis = getSliderAxis();
    const offset = getActiveIndicatorOffset(axis);
    root.style.setProperty(axis === "y" ? "--tab-indicator-y" : "--tab-indicator-x", `${offset}px`);
  }

  function renderActiveButton(tabId) {
    refreshButtons();
    const activeIndex = buttons.findIndex((item) => item.dataset.tab === tabId);
    if (activeIndex < 0) return false;
    buttons.forEach((item) => item.classList.toggle("active", item.dataset.tab === tabId));
    if (root) {
      root.dataset.activeTab = tabId;
      syncIndicatorToActive();
    }
    return true;
  }

  function setActiveButton(tabId) {
    refreshButtons();
    if (!buttons.some((item) => item.dataset.tab === tabId)) return false;
    const previousTab = committedTabId ?? getRenderedTabId();
    committedTabId = tabId;
    renderActiveButton(tabId);
    return previousTab !== tabId;
  }

  function activateTab(tabId, { force = false } = {}) {
    if (!tabId) return;
    const changed = setActiveButton(tabId);
    if (!changed && !force) return;
    // selectTab commits the URL, map mode and panel state synchronously before
    // its first await. Invoke it in the same release/click event as the visual
    // commit so a later gesture cannot cancel the application-side switch.
    const result = onChange?.(tabId);
    if (result && typeof result.catch === "function") {
      result.catch((error) => console.error("[MeteoScope] tab change failed", error));
    }
  }

  function getTabFromPoint(event, axis) {
    refreshButtons();
    if (!root || buttons.length === 0) return null;
    const rect = root.getBoundingClientRect();
    const position = axis === "y" ? event.clientY - rect.top : event.clientX - rect.left;
    const size = axis === "y" ? rect.height : rect.width;
    const ratio = position / Math.max(1, size);
    const index = Math.min(buttons.length - 1, Math.max(0, Math.floor(ratio * buttons.length)));
    return buttons[index]?.dataset.tab ?? null;
  }

  function getIndicatorLimits(axis) {
    refreshButtons();
    if (!root || buttons.length === 0) return null;
    const rootRect = root.getBoundingClientRect();
    const firstRect = buttons[0].getBoundingClientRect();
    const indicatorSize = Math.max(1, axis === "y" ? firstRect.height : firstRect.width);
    const shellPadding = Math.max(0, axis === "y" ? firstRect.top - rootRect.top : firstRect.left - rootRect.left);
    const rootSize = axis === "y" ? rootRect.height : rootRect.width;
    const maxOffset = Math.max(0, rootSize - shellPadding * 2 - indicatorSize);
    return { maxOffset, shellPadding };
  }

  function getActiveIndicatorOffset(axis) {
    refreshButtons();
    if (!root || buttons.length === 0) return 0;
    const limits = getIndicatorLimits(axis);
    if (!limits) return 0;
    const activeButton = buttons.find((button) => button.classList.contains("active")) ?? buttons[0];
    const rootRect = root.getBoundingClientRect();
    const activeRect = activeButton.getBoundingClientRect();
    const offset = axis === "y" ? activeRect.top - rootRect.top : activeRect.left - rootRect.left;
    return Math.min(limits.maxOffset, Math.max(0, offset - limits.shellPadding));
  }

  function setIndicatorOffset(axis, offset) {
    const limits = getIndicatorLimits(axis);
    if (!root || !limits) return;
    pendingIndicatorOffset = Math.min(limits.maxOffset, Math.max(0, offset));
    if (pendingIndicatorFrame) return;
    pendingIndicatorFrame = window.requestAnimationFrame(() => {
      root.style.setProperty(axis === "y" ? "--tab-indicator-y" : "--tab-indicator-x", `${pendingIndicatorOffset}px`);
      pendingIndicatorFrame = 0;
    });
  }

  function stopIndicatorDrag() {
    if (!root) return;
    root.classList.remove("is-dragging");
    if (pendingIndicatorFrame) {
      window.cancelAnimationFrame(pendingIndicatorFrame);
      pendingIndicatorFrame = 0;
    }
    window.requestAnimationFrame(syncIndicatorToActive);
  }

  function cancelIndicatorDrag() {
    if (dragPointerId === null) return;
    if (committedTabId) renderActiveButton(committedTabId);
    stopIndicatorDrag();
    dragPointerId = null;
    dragMoved = false;
    dragTargetTabId = null;
    clearPointerPreview();
  }

  function applyTabOrder(order) {
    if (!root) return [];
    const normalized = normalizeTabOrder(order, tabs);
    const byId = new Map([...root.querySelectorAll(".tab-button")].map((button) => [button.dataset.tab, button]));
    normalized.forEach((id) => {
      const button = byId.get(id);
      if (button) root.appendChild(button);
    });
    refreshButtons();
    syncIndicatorToActive();
    return normalized;
  }

  function setOrder(order) {
    const activeTab = getActiveTabId();
    const normalized = saveTabOrder(applyTabOrder(order), tabs);
    if (activeTab) setActiveButton(activeTab);
    return normalized;
  }

  function getOrder() {
    refreshButtons();
    return normalizeTabOrder(buttons.map((button) => button.dataset.tab), tabs);
  }

  root?.addEventListener("click", (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      clearPointerPreview();
      event.preventDefault();
      return;
    }
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest(".tab-button");
    if (!button || !root.contains(button)) return;
    const tabId = button.dataset.tab;
    const force = pointerPreviewChanged && pointerPreviewTabId === tabId;
    activateTab(tabId, { force });
    clearPointerPreview();
  });

  function beginIndicatorDrag({ pointerId, point, target }) {
    if (dragPointerId !== null) cancelIndicatorDrag();
    // A new pointer gesture must not inherit click suppression from a previous drag.
    suppressNextClick = false;
    dragPointerId = pointerId;
    dragAxis = getSliderAxis();
    dragStartCoord = getAxisCoordinate(point, dragAxis);
    dragMoved = false;
    pointerStartTabId = getActiveTabId();
    const button = target instanceof Element ? target.closest(".tab-button") : null;
    pointerPreviewTabId = button && root.contains(button) ? button.dataset.tab : null;
    pointerPreviewChanged = Boolean(pointerPreviewTabId && pointerPreviewTabId !== pointerStartTabId);
    dragTargetTabId = pointerPreviewTabId ?? pointerStartTabId;
    if (pointerPreviewChanged) renderActiveButton(pointerPreviewTabId);
    // Start the sliding indicator from the tab under the pointer. Measuring
    // before the preview is applied makes it jump back to the previously
    // active tab as soon as the gesture crosses the drag threshold.
    dragStartIndicatorOffset = getActiveIndicatorOffset(dragAxis);
  }

  function moveIndicatorDrag({ pointerId, point, pointerType, preventDefault }) {
    if (dragPointerId !== pointerId) return;
    const delta = getAxisCoordinate(point, dragAxis) - dragStartCoord;
    if (!dragMoved && Math.abs(delta) > 6) {
      dragMoved = true;
      root?.classList.add("is-dragging");
      setIndicatorOffset(dragAxis, dragStartIndicatorOffset);
      // Touch pointers already receive implicit capture. Calling explicit
      // capture on iOS Safari can dispatch lostpointercapture mid-gesture.
      if (pointerType !== "touch" && typeof pointerId === "number") root?.setPointerCapture?.(pointerId);
    }
    if (!dragMoved) return;
    preventDefault?.();
    dragTargetTabId = getTabFromPoint(point, dragAxis) ?? dragTargetTabId;
    setIndicatorOffset(dragAxis, dragStartIndicatorOffset + delta);
  }

  function finishIndicatorDrag({ pointerId, type, point = null }) {
    if (dragPointerId !== pointerId) return;
    const completedPointerId = dragPointerId;
    const completedTabId = type === "pointerup" && point
      ? getTabFromPoint(point, dragAxis) ?? dragTargetTabId
      : dragTargetTabId;
    if (type === "pointerup" && dragMoved && completedTabId) {
      // Ignore only the compatibility click generated by this completed drag.
      // A blanket time window can swallow the user's next, separate tab tap.
      suppressNextClick = true;
      // Use the release position when available, otherwise the last valid tab
      // seen during pointermove. iOS cancellation events may lose coordinates.
      activateTab(completedTabId, { force: true });
      clearPointerPreview();
    } else if (type === "pointerup" && !dragMoved && pointerPreviewTabId) {
      // Commit ordinary pointer taps on release. Depending on the browser,
      // the following compatibility click may be delayed or omitted after a
      // touch gesture, so leaving the preview uncommitted can desynchronise
      // the highlighted button from the application tab.
      suppressNextClick = true;
      activateTab(pointerPreviewTabId, { force: pointerPreviewChanged });
      clearPointerPreview();
    } else {
      // pointercancel and lostpointercapture must never commit the last hover
      // target. Restore the latest application-owned tab instead of the tab
      // that happened to be active when this gesture started.
      if (committedTabId) renderActiveButton(committedTabId);
      clearPointerPreview();
    }
    stopIndicatorDrag();
    dragPointerId = null;
    dragMoved = false;
    dragTargetTabId = null;
    // Clear our gesture state before releasing capture. Browsers dispatch
    // lostpointercapture synchronously in some mobile implementations; if it
    // runs while dragPointerId is still set, it cancels this completed slide.
    if (typeof completedPointerId === "number" && root?.hasPointerCapture?.(completedPointerId)) {
      root.releasePointerCapture(completedPointerId);
    }
  }

  function clearPointerPreview() {
    pointerStartTabId = null;
    pointerPreviewTabId = null;
    pointerPreviewChanged = false;
  }

  root?.addEventListener("pointerdown", (event) => {
    if (event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
    beginIndicatorDrag({ pointerId: event.pointerId, point: event, target: event.target });
  });
  root?.addEventListener("pointermove", (event) => {
    moveIndicatorDrag({
      pointerId: event.pointerId,
      point: event,
      pointerType: event.pointerType,
      preventDefault: () => event.preventDefault()
    });
  });
  root?.addEventListener("pointerup", (event) => {
    finishIndicatorDrag({ pointerId: event.pointerId, type: event.type, point: event });
  });
  root?.addEventListener("pointercancel", (event) => {
    finishIndicatorDrag({ pointerId: event.pointerId, type: event.type, point: event });
  });
  root?.addEventListener("lostpointercapture", (event) => {
    finishIndicatorDrag({ pointerId: event.pointerId, type: event.type });
  });

  window.addEventListener("blur", cancelIndicatorDrag);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelIndicatorDrag();
  });
  window.addEventListener("resize", () => {
    if (resizeFrame) return;
    resizeFrame = window.requestAnimationFrame(() => {
      resizeFrame = 0;
      syncIndicatorToActive();
    });
  });

  applyTabOrder(loadTabOrder(tabs));
  const initialTab = getActiveTabId();
  if (initialTab) setActiveButton(initialTab);

  return { setActiveButton, setOrder, getOrder };
}
