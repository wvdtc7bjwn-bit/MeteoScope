// Decorative only: no sensor access until the user enables it, no idle animation loop.
export function setupAccountCardMotion(card, { toggle, status, root } = {}) {
  if (!card) return;
  const document = card.ownerDocument;
  const view = document.defaultView;
  const reducedMotion = view.matchMedia("(prefers-reduced-motion: reduce)");
  const touchDevice = view.matchMedia("(pointer: coarse)");
  const orientation = view.DeviceOrientationEvent;
  let visible = false;
  let intersecting = true;
  let enabled = false;
  let listening = false;
  let pendingPermission = false;
  let disposed = false;
  let frame = null;
  let bounds = null;
  let baseline = null;
  let pendingPosition = null;
  let pointerId = null;

  const clamp = value => Math.max(-1, Math.min(1, value));
  function reset() {
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = null;
    bounds = null;
    baseline = null;
    pendingPosition = null;
    pointerId = null;
    card.classList.remove("is-motion-active");
    for (const name of ["--card-rotate-x", "--card-rotate-y", "--card-light-x", "--card-light-y"]) {
      card.style.removeProperty(name);
    }
  }

  function move(x, y) {
    if (!visible) return;
    pendingPosition = { x: clamp(x), y: clamp(y) };
    if (frame !== null) return;
    frame = view.requestAnimationFrame(() => {
      frame = null;
      if (!visible || !pendingPosition) return;
      const { x, y } = pendingPosition;
      card.style.setProperty("--card-rotate-x", `${(-y * 2).toFixed(2)}deg`);
      card.style.setProperty("--card-rotate-y", `${(x * 2.5).toFixed(2)}deg`);
      card.style.setProperty("--card-light-x", `${50 + x * 32}%`);
      card.style.setProperty("--card-light-y", `${50 + y * 32}%`);
      card.classList.add("is-motion-active");
    });
  }

  function onPointer(event) {
    if (!visible || (event.pointerType === "touch" && event.type === "pointermove" && pointerId !== event.pointerId)) return;
    if (event.isPrimary === false) return;
    if (event.type === "pointerdown") pointerId = event.pointerId;
    bounds ??= card.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    move((event.clientX - bounds.left) / bounds.width * 2 - 1,
      (event.clientY - bounds.top) / bounds.height * 2 - 1);
  }

  function onOrientation(event) {
    if (!visible || pointerId !== null || !Number.isFinite(event.beta) || !Number.isFinite(event.gamma)) return;
    baseline ??= { beta: event.beta, gamma: event.gamma };
    const delta = (angle, origin) => ((angle - origin + 540) % 360) - 180;
    const x = delta(event.gamma, baseline.gamma) / 18;
    const y = delta(event.beta, baseline.beta) / 18;
    const angle = (view.screen.orientation?.angle ?? 0) * Math.PI / 180;
    move(x * Math.cos(angle) + y * Math.sin(angle), y * Math.cos(angle) - x * Math.sin(angle));
  }

  function sync() {
    if (disposed) return;
    visible = !document.hidden && !reducedMotion.matches && intersecting
      && !card.closest("[hidden]") && card.getClientRects().length > 0;
    if (!visible) reset();
    const shouldListen = visible && enabled;
    if (shouldListen !== listening) {
      listening = shouldListen;
      baseline = null;
      if (listening) view.addEventListener("deviceorientation", onOrientation, { passive: true });
      else view.removeEventListener("deviceorientation", onOrientation);
    }
    if (toggle) {
      toggle.hidden = card.hidden || !orientation || !view.isSecureContext || !touchDevice.matches || reducedMotion.matches;
      toggle.disabled = pendingPermission;
      toggle.setAttribute("aria-pressed", String(enabled));
    }
    if (status) status.hidden = card.hidden || reducedMotion.matches || !status.textContent;
  }

  async function toggleOrientation() {
    if (pendingPermission || !visible || !orientation || !view.isSecureContext) return;
    if (enabled) {
      enabled = false;
      if (status) status.textContent = "";
      reset();
      sync();
      return;
    }
    pendingPermission = true;
    sync();
    try {
      const permission = typeof orientation.requestPermission === "function"
        ? await orientation.requestPermission() : "granted";
      if (disposed) return;
      enabled = permission === "granted";
      if (status) status.textContent = enabled ? "" : "傾きの利用が許可されませんでした。指でなぞって光を動かせます。";
    } catch {
      if (!disposed && status) status.textContent = "端末の傾きを利用できません。指でなぞって光を動かせます。";
    } finally {
      pendingPermission = false;
      sync();
    }
  }

  const onScroll = () => { bounds = null; };
  for (const type of ["pointerenter", "pointerdown", "pointermove"]) card.addEventListener(type, onPointer, { passive: true });
  for (const type of ["pointerleave", "pointerup", "pointercancel"]) card.addEventListener(type, reset, { passive: true });
  toggle?.addEventListener("click", toggleOrientation);
  reducedMotion.addEventListener("change", sync);
  touchDevice.addEventListener("change", sync);
  document.addEventListener("visibilitychange", sync);
  view.addEventListener("scroll", onScroll, { capture: true, passive: true });
  view.addEventListener("resize", reset, { passive: true });
  view.screen.orientation?.addEventListener("change", reset);
  const visibilityObserver = new view.MutationObserver(records => {
    if (records.some(({ target }) => target === card || target.contains(card))) sync();
  });
  visibilityObserver.observe(root ?? card, { attributes: true, subtree: true, attributeFilter: ["hidden"] });
  const intersectionObserver = view.IntersectionObserver ? new view.IntersectionObserver(entries => {
    intersecting = entries[0]?.isIntersecting === true;
    sync();
  }) : null;
  intersectionObserver?.observe(card);
  sync();

  return () => {
    disposed = true;
    reset();
    view.removeEventListener("deviceorientation", onOrientation);
    for (const type of ["pointerenter", "pointerdown", "pointermove"]) card.removeEventListener(type, onPointer);
    for (const type of ["pointerleave", "pointerup", "pointercancel"]) card.removeEventListener(type, reset);
    toggle?.removeEventListener("click", toggleOrientation);
    reducedMotion.removeEventListener("change", sync);
    touchDevice.removeEventListener("change", sync);
    document.removeEventListener("visibilitychange", sync);
    view.removeEventListener("scroll", onScroll, true);
    view.removeEventListener("resize", reset);
    view.screen.orientation?.removeEventListener("change", reset);
    visibilityObserver.disconnect();
    intersectionObserver?.disconnect();
  };
}
