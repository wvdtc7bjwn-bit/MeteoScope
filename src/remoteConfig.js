const PUBLIC_CONFIG_ENDPOINT = "/api/public/config";
const NOTICE_DISMISS_PREFIX = "weather-viewer.notice.dismissed.";
const MAX_DISMISSED_NOTICES = 200;
let tickerSequenceVersion = 0;

export function setupRemoteConfig() {
  void refreshRemoteConfig();
  window.addEventListener("focus", () => {
    void refreshRemoteConfig();
  });
}

async function refreshRemoteConfig() {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(PUBLIC_CONFIG_ENDPOINT, {
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) return;
    const config = await response.json();
    applyRemoteConfig(config);
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.debug("[MeteoScope] remote config unavailable", error);
    }
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function applyRemoteConfig(config) {
  renderMaintenance(config?.maintenance);
  renderNotices(Array.isArray(config?.notices) ? config.notices : []);
}

function renderMaintenance(maintenance) {
  const enabled = Boolean(maintenance?.enabled);
  let overlay = document.getElementById("remote-maintenance-overlay");
  if (!enabled) {
    overlay?.remove();
    return;
  }

  if (!overlay) {
    overlay = document.createElement("section");
    overlay.id = "remote-maintenance-overlay";
    overlay.className = "remote-maintenance-overlay";
    overlay.setAttribute("aria-live", "polite");
    overlay.innerHTML = `
      <div class="remote-maintenance-card">
        <span>Maintenance</span>
        <strong></strong>
      </div>
    `;
    document.body.appendChild(overlay);
  }
  const message = maintenance.message || "現在メンテナンス中です。";
  overlay.querySelector("strong").textContent = message;
}

function renderNotices(notices) {
  renderTickerNotices(notices);
  const cardNotices = notices.filter((notice) => !notice?.isTicker);
  let stack = document.getElementById("remote-notice-stack");
  if (!cardNotices.length) {
    stack?.remove();
    return;
  }
  if (!stack) {
    stack = document.createElement("section");
    stack.id = "remote-notice-stack";
    stack.className = "remote-notice-stack";
    stack.setAttribute("aria-label", "お知らせ");
    document.body.appendChild(stack);
  }

  const visibleNotices = cardNotices
    .filter((notice) => notice?.enabled !== false)
    .filter((notice) => !isNoticeDismissed(notice))
    .slice(0, 3);

  if (!visibleNotices.length) {
    stack.remove();
    return;
  }

  stack.innerHTML = "";
  visibleNotices.forEach((notice) => {
    const card = document.createElement("article");
    card.className = `remote-notice-card remote-notice-${notice.level || "info"}`;
    const title = document.createElement("strong");
    title.textContent = notice.title || "お知らせ";
    const body = document.createElement("p");
    body.textContent = notice.body || "";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "remote-notice-close";
    close.setAttribute("aria-label", "閉じる");
    close.textContent = "×";
    close.addEventListener("click", () => {
      dismissNotice(notice);
      card.remove();
      if (!stack.children.length) stack.remove();
    });
    card.append(title, body, close);
    stack.appendChild(card);
  });
}

function renderTickerNotices(notices) {
  const tickerNotices = notices
    .filter((notice) => notice?.enabled !== false && notice?.isTicker)
    .filter((notice) => !isNoticeDismissed(notice))
    .slice(0, 3);
  let ticker = document.getElementById("remote-notice-ticker");
  if (!tickerNotices.length) {
    tickerSequenceVersion += 1;
    ticker?.remove();
    document.body.classList.remove("has-remote-notice-ticker");
    return;
  }
  if (!ticker) {
    ticker = document.createElement("section");
    ticker.id = "remote-notice-ticker";
    ticker.className = "remote-notice-ticker";
    ticker.setAttribute("aria-label", "お知らせテロップ");
    document.body.appendChild(ticker);
  }
  const direction = tickerNotices[0]?.tickerDirection === "right" ? "right" : "left";
  document.body.classList.add("has-remote-notice-ticker");
  ticker.className = `remote-notice-ticker remote-notice-ticker-${direction}`;
  ticker.innerHTML = "";
  const header = document.createElement("div");
  header.className = "remote-notice-ticker-header";
  const label = document.createElement("span");
  label.className = "remote-notice-ticker-label";
  setTickerLabel(label, tickerNotices[0]);
  const viewport = document.createElement("div");
  viewport.className = "remote-notice-ticker-viewport";
  viewport.tabIndex = 0;
  viewport.setAttribute("role", "button");
  viewport.setAttribute("aria-label", "お知らせのスクロールを一時停止");
  const track = document.createElement("div");
  track.className = "remote-notice-ticker-track";
  const message = document.createElement("span");
  track.appendChild(message);
  viewport.appendChild(track);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "remote-notice-ticker-close";
  close.setAttribute("aria-label", "閉じる");
  close.innerHTML = "<span aria-hidden=\"true\"></span>";
  close.addEventListener("click", () => {
    tickerNotices.forEach((notice) => {
      dismissNotice(notice);
    });
    tickerSequenceVersion += 1;
    ticker.remove();
    document.body.classList.remove("has-remote-notice-ticker");
  });
  const toggleTickerPause = () => {
    const paused = ticker.classList.toggle("is-paused");
    viewport.setAttribute(
      "aria-label",
      paused ? "お知らせのスクロールを再開" : "お知らせのスクロールを一時停止"
    );
  };
  viewport.addEventListener("click", toggleTickerPause);
  viewport.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleTickerPause();
  });
  header.append(label, close);
  ticker.append(header, viewport);
  const sequenceVersion = ++tickerSequenceVersion;
  startTickerNoticeSequence({ ticker, track, label, message, notices: tickerNotices, sequenceVersion });
}

function startTickerNoticeSequence({ ticker, track, label, message, notices, sequenceVersion }) {
  if (!Array.isArray(notices) || !notices.length) return;
  let index = 0;
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches === true;
  const showNotice = () => {
    if (sequenceVersion !== tickerSequenceVersion || !ticker.isConnected) return;
    const notice = notices[index];
    const text = buildTickerBodyText(notice) || "お知らせがあります。";
    setTickerLabel(label, notice);
    message.textContent = text;
    ticker.style.setProperty("--ticker-duration", `${tickerDuration([notice], text)}s`);
    if (reducedMotion) return;
    track.classList.remove("is-running");
    void track.offsetWidth;
    track.classList.add("is-running");
  };
  track.addEventListener("animationend", (event) => {
    if (event.target !== track || sequenceVersion !== tickerSequenceVersion) return;
    index = (index + 1) % notices.length;
    showNotice();
  });
  showNotice();
}

function noticeDismissKey(notice) {
  return `${NOTICE_DISMISS_PREFIX}${notice?.id || notice?.title || "notice"}`;
}

function isNoticeDismissed(notice) {
  try {
    return localStorage.getItem(noticeDismissKey(notice)) !== null;
  } catch {
    return false;
  }
}

function dismissNotice(notice) {
  try {
    localStorage.setItem(noticeDismissKey(notice), String(Date.now()));
    pruneDismissedNotices();
  } catch {
    // Storage can be unavailable in private or restricted browsing modes.
  }
}

function pruneDismissedNotices() {
  const dismissed = [];
  for (let index = 0; index < localStorage.length; index += 1) {
    const key = localStorage.key(index);
    if (!key?.startsWith(NOTICE_DISMISS_PREFIX)) continue;
    const dismissedAt = Number(localStorage.getItem(key));
    dismissed.push({ key, dismissedAt: Number.isFinite(dismissedAt) ? dismissedAt : 0 });
  }
  if (dismissed.length <= MAX_DISMISSED_NOTICES) return;
  dismissed
    .sort((left, right) => left.dismissedAt - right.dismissedAt)
    .slice(0, dismissed.length - MAX_DISMISSED_NOTICES)
    .forEach(({ key }) => localStorage.removeItem(key));
}

function setTickerLabel(label, notice) {
  const labelText = buildTickerLabelText(notice);
  const level = ["info", "warning", "critical"].includes(notice?.level) ? notice.level : "info";
  label.className = `remote-notice-ticker-label remote-notice-ticker-label-${level}`;
  label.textContent = labelText;
  label.title = labelText;
}

function buildTickerLabelText(notice) {
  return String(notice?.title || "お知らせ").trim() || "お知らせ";
}

function buildTickerBodyText(notice) {
  const title = String(notice?.title || "").trim();
  const body = String(notice?.body || "").trim();
  return body || title;
}

function tickerDuration(notices, text = "") {
  const speed = notices.find((notice) => notice?.tickerSpeed)?.tickerSpeed || "normal";
  const charactersPerSecond = speed === "slow" ? 3.5 : speed === "fast" ? 7 : 5;
  return Math.max(18, Math.min(60, Math.round(String(text).length / charactersPerSecond + 10)));
}
