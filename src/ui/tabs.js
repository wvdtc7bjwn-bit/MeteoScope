export function setupTabs({ onChange }) {
  const root = document.getElementById("main-tabs");
  const buttons = [...document.querySelectorAll(".tab-button")];
  const isMobileSlider = () => window.matchMedia("(max-width: 800px) and (orientation: portrait)").matches;
  let dragPointerId = null;
  let dragStartX = 0;
  let dragMoved = false;
  let suppressClickUntil = 0;

  function setActiveButton(tabId) {
    const previousTab = root?.dataset.activeTab;
    buttons.forEach((item) => item.classList.toggle("active", item.dataset.tab === tabId));
    const activeIndex = buttons.findIndex((item) => item.dataset.tab === tabId);
    if (root) {
      root.dataset.activeTab = tabId;
    }
    return previousTab !== tabId && activeIndex >= 0;
  }

  function activateTab(tabId) {
    if (!tabId) return;
    if (setActiveButton(tabId)) onChange?.(tabId);
  }

  function getTabFromPoint(clientX) {
    if (!root || buttons.length === 0) return null;
    const rect = root.getBoundingClientRect();
    const ratio = (clientX - rect.left) / Math.max(1, rect.width);
    const index = Math.min(buttons.length - 1, Math.max(0, Math.floor(ratio * buttons.length)));
    return buttons[index]?.dataset.tab ?? null;
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      if (Date.now() < suppressClickUntil) return;
      const tabId = button.dataset.tab;
      activateTab(tabId);
    });
  });

  root?.addEventListener("pointerdown", (event) => {
    if (!isMobileSlider()) return;
    dragPointerId = event.pointerId;
    dragStartX = event.clientX;
    dragMoved = false;
    root.setPointerCapture?.(event.pointerId);
  });

  root?.addEventListener("pointermove", (event) => {
    if (dragPointerId !== event.pointerId) return;
    if (Math.abs(event.clientX - dragStartX) > 6) dragMoved = true;
    if (!dragMoved) return;
    event.preventDefault();
    activateTab(getTabFromPoint(event.clientX));
  });

  function finishDrag(event) {
    if (dragPointerId !== event.pointerId) return;
    root?.releasePointerCapture?.(event.pointerId);
    if (dragMoved) {
      suppressClickUntil = Date.now() + 250;
      activateTab(getTabFromPoint(event.clientX));
    }
    dragPointerId = null;
    dragMoved = false;
  }

  root?.addEventListener("pointerup", finishDrag);
  root?.addEventListener("pointercancel", finishDrag);

  const initialTab = buttons.find((button) => button.classList.contains("active"))?.dataset.tab ?? buttons[0]?.dataset.tab;
  if (initialTab) setActiveButton(initialTab);

  return { setActiveButton };
}
