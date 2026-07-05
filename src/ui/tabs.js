export function setupTabs({ onChange }) {
  const root = document.getElementById("main-tabs");
  const buttons = [...document.querySelectorAll(".tab-button")];
  let dragPointerId = null;
  let dragAxis = "x";
  let dragStartCoord = 0;
  let dragStartIndicatorOffset = 0;
  let dragMoved = false;
  let pendingIndicatorFrame = 0;
  let pendingIndicatorOffset = 0;
  let suppressClickUntil = 0;

  function getSliderAxis() {
    if (!root) return "x";
    const rect = root.getBoundingClientRect();
    return rect.height > rect.width ? "y" : "x";
  }

  function getAxisCoordinate(event, axis) {
    return axis === "y" ? event.clientY : event.clientX;
  }

  function setActiveButton(tabId) {
    const previousTab = root?.dataset.activeTab;
    buttons.forEach((item) => item.classList.toggle("active", item.dataset.tab === tabId));
    const activeIndex = buttons.findIndex((item) => item.dataset.tab === tabId);
    if (root) {
      root.dataset.activeTab = tabId;
      if (!root.classList.contains("is-dragging")) {
        root.style.removeProperty("--tab-indicator-x");
        root.style.removeProperty("--tab-indicator-y");
      }
    }
    return previousTab !== tabId && activeIndex >= 0;
  }

  function activateTab(tabId) {
    if (!tabId) return;
    if (setActiveButton(tabId)) onChange?.(tabId);
  }

  function getTabFromPoint(event, axis) {
    if (!root || buttons.length === 0) return null;
    const rect = root.getBoundingClientRect();
    const position = axis === "y" ? event.clientY - rect.top : event.clientX - rect.left;
    const size = axis === "y" ? rect.height : rect.width;
    const ratio = position / Math.max(1, size);
    const index = Math.min(buttons.length - 1, Math.max(0, Math.floor(ratio * buttons.length)));
    return buttons[index]?.dataset.tab ?? null;
  }

  function getIndicatorLimits(axis) {
    if (!root || buttons.length === 0) return;
    const rootRect = root.getBoundingClientRect();
    const firstRect = buttons[0].getBoundingClientRect();
    const indicatorSize = Math.max(1, axis === "y" ? firstRect.height : firstRect.width);
    const shellPadding = Math.max(0, axis === "y" ? firstRect.top - rootRect.top : firstRect.left - rootRect.left);
    const rootSize = axis === "y" ? rootRect.height : rootRect.width;
    const maxOffset = Math.max(0, rootSize - shellPadding * 2 - indicatorSize);
    return { maxOffset, shellPadding };
  }

  function getActiveIndicatorOffset(axis) {
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
    window.requestAnimationFrame(() => {
      root.style.removeProperty("--tab-indicator-x");
      root.style.removeProperty("--tab-indicator-y");
    });
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      if (Date.now() < suppressClickUntil) return;
      const tabId = button.dataset.tab;
      activateTab(tabId);
    });
  });

  root?.addEventListener("pointerdown", (event) => {
    dragPointerId = event.pointerId;
    dragAxis = getSliderAxis();
    dragStartCoord = getAxisCoordinate(event, dragAxis);
    dragStartIndicatorOffset = getActiveIndicatorOffset(dragAxis);
    dragMoved = false;
    root.classList.add("is-dragging");
    setIndicatorOffset(dragAxis, dragStartIndicatorOffset);
    root.setPointerCapture?.(event.pointerId);
  });

  root?.addEventListener("pointermove", (event) => {
    if (dragPointerId !== event.pointerId) return;
    const delta = getAxisCoordinate(event, dragAxis) - dragStartCoord;
    if (Math.abs(delta) > 6) dragMoved = true;
    if (!dragMoved) return;
    event.preventDefault();
    setIndicatorOffset(dragAxis, dragStartIndicatorOffset + delta);
  });

  function finishDrag(event) {
    if (dragPointerId !== event.pointerId) return;
    root?.releasePointerCapture?.(event.pointerId);
    if (dragMoved) {
      suppressClickUntil = Date.now() + 250;
      activateTab(getTabFromPoint(event, dragAxis));
    }
    stopIndicatorDrag();
    dragPointerId = null;
    dragMoved = false;
  }

  root?.addEventListener("pointerup", finishDrag);
  root?.addEventListener("pointercancel", finishDrag);

  const initialTab = buttons.find((button) => button.classList.contains("active"))?.dataset.tab ?? buttons[0]?.dataset.tab;
  if (initialTab) setActiveButton(initialTab);

  return { setActiveButton };
}
