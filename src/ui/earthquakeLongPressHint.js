const STORAGE_KEY = "meteoscope-earthquake-long-press-hint-v4";
const SHOW_DELAY_MS = 700;
const AUTO_DISMISS_MS = 15000;

export function setupEarthquakeLongPressHint(button) {
  if (!button) {
    return {
      showFirstRun() {},
      dismiss() {}
    };
  }

  let hint = null;
  let showTimer = null;
  let dismissTimer = null;
  let modalObserver = null;
  let positionFrame = null;

  function hasBeenShown() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "shown";
    } catch {
      return true;
    }
  }

  function rememberShown() {
    try {
      localStorage.setItem(STORAGE_KEY, "shown");
    } catch {
      // Storage can be unavailable in private browsing. Do not block the app.
    }
  }

  function stopWaitingForModals() {
    modalObserver?.disconnect();
    modalObserver = null;
  }

  function updatePosition() {
    if (!hint) return;
    const buttonRect = button.getBoundingClientRect();
    const hintRect = hint.getBoundingClientRect();
    const mainTabs = button.closest("#main-tabs");
    const isHorizontal = mainTabs
      ? getComputedStyle(mainTabs).flexDirection === "row"
      : window.innerWidth <= 900;
    const margin = 10;

    if (isHorizontal) {
      const desiredLeft = buttonRect.left + (buttonRect.width / 2) - (hintRect.width / 2);
      const left = Math.max(margin, Math.min(window.innerWidth - hintRect.width - margin, desiredLeft));
      const top = Math.max(margin, buttonRect.top - hintRect.height - 12);
      hint.dataset.placement = "above";
      hint.style.left = `${left}px`;
      hint.style.top = `${top}px`;
      hint.style.setProperty("--hint-arrow-offset", `${Math.max(18, Math.min(hintRect.width - 18, (buttonRect.left + buttonRect.width / 2) - left))}px`);
      return;
    }

    const left = Math.min(window.innerWidth - hintRect.width - margin, buttonRect.right + 12);
    const desiredTop = buttonRect.top + (buttonRect.height / 2) - (hintRect.height / 2);
    const top = Math.max(margin, Math.min(window.innerHeight - hintRect.height - margin, desiredTop));
    hint.dataset.placement = "side";
    hint.style.left = `${Math.max(margin, left)}px`;
    hint.style.top = `${top}px`;
    hint.style.setProperty("--hint-arrow-offset", `${Math.max(18, Math.min(hintRect.height - 18, (buttonRect.top + buttonRect.height / 2) - top))}px`);
  }

  function schedulePosition() {
    if (positionFrame !== null) cancelAnimationFrame(positionFrame);
    positionFrame = requestAnimationFrame(() => {
      positionFrame = null;
      updatePosition();
    });
  }

  function dismiss() {
    if (showTimer !== null) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (dismissTimer !== null) {
      clearTimeout(dismissTimer);
      dismissTimer = null;
    }
    if (positionFrame !== null) {
      cancelAnimationFrame(positionFrame);
      positionFrame = null;
    }
    stopWaitingForModals();
    window.removeEventListener("resize", schedulePosition);
    window.removeEventListener("orientationchange", schedulePosition);
    hint?.remove();
    hint = null;
  }

  function show() {
    if (hint || hasBeenShown()) return;
    rememberShown();
    hint = document.createElement("aside");
    hint.className = "earthquake-long-press-hint";
    hint.setAttribute("role", "status");
    hint.setAttribute("aria-label", "地震ボタンを長押しすると火山情報へ切り替えられます");
    hint.innerHTML = `
      <div>
        <strong>地震ボタンを長押し</strong>
        <span>火山情報へ切り替えられます</span>
      </div>
      <button type="button" aria-label="案内を閉じる">×</button>
    `;
    hint.querySelector("button")?.addEventListener("click", dismiss);
    document.body.append(hint);
    updatePosition();
    hint.classList.add("is-visible");
    window.addEventListener("resize", schedulePosition);
    window.addEventListener("orientationchange", schedulePosition);
    dismissTimer = window.setTimeout(dismiss, AUTO_DISMISS_MS);
  }

  function showWhenUnblocked() {
    const isMapLoading = document.documentElement.classList.contains("app-initializing");
    const hasOpenModal = Boolean(document.querySelector(".warning-modal:not([hidden])"));
    if (!isMapLoading && !hasOpenModal) {
      stopWaitingForModals();
      show();
      return;
    }
    if (modalObserver) return;
    modalObserver = new MutationObserver(showWhenUnblocked);
    modalObserver.observe(document.body, {
      attributes: true,
      subtree: true,
      attributeFilter: ["hidden"]
    });
    modalObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"]
    });
  }

  function showFirstRun() {
    if (hasBeenShown() || showTimer !== null || hint) return;
    showTimer = window.setTimeout(() => {
      showTimer = null;
      showWhenUnblocked();
    }, SHOW_DELAY_MS);
  }

  return { showFirstRun, dismiss };
}
