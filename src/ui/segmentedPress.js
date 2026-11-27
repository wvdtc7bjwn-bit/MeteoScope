export const SEGMENTED_PRESS_SELECTOR = "#main-tabs, .mobile-dock-segmented, .amedas-chart-period-toggle, .amedas-ranking-slider";

// Selected segments are sometimes disabled to prevent redundant data requests.
// Pointer/touch feedback belongs to their shared lens, independently of clicks.
export function setupSegmentedPressFeedback(doc = document) {
  const view = doc.defaultView;
  if (!view || doc.documentElement.dataset.segmentedPressReady) return;
  doc.documentElement.dataset.segmentedPressReady = "true";
  let press = null, timer = null, observer = null;
  const roots = scope => [ ...(scope.matches(SEGMENTED_PRESS_SELECTOR) ? [scope] : []), ...scope.querySelectorAll(SEGMENTED_PRESS_SELECTOR) ];
  const clear = () => {
    if (timer !== null) view.clearTimeout(timer);
    timer = null;
    observer?.disconnect(); observer = null;
    press?.element.removeAttribute("data-segmented-press");
    press = null;
  };
  const start = (target, kind) => {
    const button = target?.closest?.("button");
    const element = button?.closest(SEGMENTED_PRESS_SELECTOR);
    if (!element || (button.disabled && !button.matches('.active, [aria-pressed="true"], [aria-selected="true"]'))) return;
    if (press?.element === element && press.down) return;
    clear();
    const scope = element.closest("#main-tabs, #mobile-context-dock, #sidebar") ?? element.parentElement;
    const index = roots(scope).indexOf(element);
    press = { element, scope, index, kind, down: true, started: view.performance.now() };
    element.setAttribute("data-segmented-press", "");
    // A tap can rebuild the dock. Carry the brief feedback to the same row in
    // the replacement DOM instead of dropping it before the user can see it.
    if (view.MutationObserver) {
      observer = new view.MutationObserver(() => {
        if (!press || press.element.isConnected) return;
        const replacement = roots(press.scope)[press.index];
        if (replacement) {
          press.element.removeAttribute("data-segmented-press");
          press.element = replacement;
          replacement.setAttribute("data-segmented-press", "");
        }
      });
      observer.observe(scope, { childList: true, subtree: true });
    }
  };
  const release = () => {
    if (!press || !press.down) return;
    press.down = false;
    timer = view.setTimeout(clear, Math.max(0, 180 - (view.performance.now() - press.started)));
  };
  doc.addEventListener("pointerdown", event => {
    if (event.isPrimary === false || (event.pointerType === "mouse" && event.button !== 0)) return;
    start(event.target, "pointer");
  }, true);
  doc.addEventListener("pointerup", release, true);
  doc.addEventListener("pointercancel", clear, true);
  // Touch events also reach disabled selected controls on iOS Safari.
  doc.addEventListener("touchstart", event => {
    if (event.touches.length !== 1) { clear(); return; }
    start(event.target, "touch");
  }, { capture: true, passive: true });
  doc.addEventListener("touchend", release, true);
  doc.addEventListener("touchcancel", clear, true);
  doc.addEventListener("keydown", event => {
    if (!event.repeat && [" ", "Enter"].includes(event.key)) start(event.target, "keyboard");
  }, true);
  doc.addEventListener("keyup", event => { if ([" ", "Enter"].includes(event.key)) release(); }, true);
  view.addEventListener("blur", clear);
  doc.addEventListener("visibilitychange", () => { if (doc.hidden) clear(); });
}
