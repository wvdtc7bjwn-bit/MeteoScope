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
  let suppressClickUntil = 0;
  let resizeFrame = 0;
  let pendingActivationFrame = 0;
  let pendingActivationTimer = 0;
  let activationGeneration = 0;
  let pointerStartTabId = null;
  let pointerPreviewTabId = null;
  let pointerPreviewChanged = false;

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

  function getActiveTabId() {
    return buttons.find((button) => button.classList.contains("active"))?.dataset.tab
      ?? root?.dataset.activeTab
      ?? buttons[0]?.dataset.tab
      ?? null;
  }

  function syncIndicatorToActive() {
    if (!root || root.classList.contains("is-dragging")) return;
    refreshButtons();
    const axis = getSliderAxis();
    const offset = getActiveIndicatorOffset(axis);
    root.style.setProperty(axis === "y" ? "--tab-indicator-y" : "--tab-indicator-x", `${offset}px`);
  }

  function setActiveButton(tabId) {
    refreshButtons();
    const previousTab = root?.dataset.activeTab;
    buttons.forEach((item) => item.classList.toggle("active", item.dataset.tab === tabId));
    const activeIndex = buttons.findIndex((item) => item.dataset.tab === tabId);
    if (root) {
      root.dataset.activeTab = tabId;
      syncIndicatorToActive();
    }
    return previousTab !== tabId && activeIndex >= 0;
  }

  function activateTab(tabId, { force = false } = {}) {
    if (!tabId) return;
    const changed = setActiveButton(tabId);
    if (!changed && !force) return;
    scheduleTabChangeAfterPaint(tabId);
  }

  function scheduleTabChangeAfterPaint(tabId) {
    const generation = ++activationGeneration;
    if (pendingActivationFrame) window.cancelAnimationFrame(pendingActivationFrame);
    if (pendingActivationTimer) window.clearTimeout(pendingActivationTimer);

    pendingActivationFrame = window.requestAnimationFrame(() => {
      pendingActivationFrame = 0;
      pendingActivationTimer = window.setTimeout(() => {
        pendingActivationTimer = 0;
        if (generation !== activationGeneration || root?.dataset.activeTab !== tabId) return;
        const result = onChange?.(tabId);
        if (result && typeof result.catch === "function") {
          result.catch((error) => console.error("[MeteoScope] tab change failed", error));
        }
      }, 0);
    });
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
    if (Date.now() < suppressClickUntil) return;
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest(".tab-button");
    if (!button || !root.contains(button)) return;
    const tabId = button.dataset.tab;
    const force = pointerPreviewChanged && pointerPreviewTabId === tabId;
    activateTab(tabId, { force });
    clearPointerPreview();
  });

  root?.addEventListener("pointerdown", (event) => {
    dragPointerId = event.pointerId;
    dragAxis = getSliderAxis();
    dragStartCoord = getAxisCoordinate(event, dragAxis);
    dragStartIndicatorOffset = getActiveIndicatorOffset(dragAxis);
    dragMoved = false;
    pointerStartTabId = getActiveTabId();
    const button = event.target instanceof Element ? event.target.closest(".tab-button") : null;
    pointerPreviewTabId = button && root.contains(button) ? button.dataset.tab : null;
    pointerPreviewChanged = Boolean(pointerPreviewTabId && pointerPreviewTabId !== pointerStartTabId);
    if (pointerPreviewChanged) setActiveButton(pointerPreviewTabId);
  });

  root?.addEventListener("pointermove", (event) => {
    if (dragPointerId !== event.pointerId) return;
    const delta = getAxisCoordinate(event, dragAxis) - dragStartCoord;
    if (!dragMoved && Math.abs(delta) > 6) {
      dragMoved = true;
      root?.classList.add("is-dragging");
      setIndicatorOffset(dragAxis, dragStartIndicatorOffset);
      root?.setPointerCapture?.(event.pointerId);
    }
    if (!dragMoved) return;
    event.preventDefault();
    setIndicatorOffset(dragAxis, dragStartIndicatorOffset + delta);
  });

  function finishDrag(event) {
    if (dragPointerId !== event.pointerId) return;
    root?.releasePointerCapture?.(event.pointerId);
    if (dragMoved) {
      suppressClickUntil = Date.now() + 250;
      activateTab(getTabFromPoint(event, dragAxis), { force: true });
      clearPointerPreview();
    } else if (event.type === "pointercancel") {
      if (pointerStartTabId) setActiveButton(pointerStartTabId);
      clearPointerPreview();
    }
    stopIndicatorDrag();
    dragPointerId = null;
    dragMoved = false;
  }

  function clearPointerPreview() {
    pointerStartTabId = null;
    pointerPreviewTabId = null;
    pointerPreviewChanged = false;
  }

  root?.addEventListener("pointerup", finishDrag);
  root?.addEventListener("pointercancel", finishDrag);
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
