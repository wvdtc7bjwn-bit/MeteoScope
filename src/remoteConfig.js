const PUBLIC_CONFIG_ENDPOINT = "/api/public/config";
const NOTICE_DISMISS_PREFIX = "weather-viewer.notice.dismissed.";
let tickerLabelTimer = null;

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
    .filter((notice) => !sessionStorage.getItem(`${NOTICE_DISMISS_PREFIX}${notice.id || notice.title}`))
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
      sessionStorage.setItem(`${NOTICE_DISMISS_PREFIX}${notice.id || notice.title}`, "1");
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
    .filter((notice) => !sessionStorage.getItem(`${NOTICE_DISMISS_PREFIX}${notice.id || notice.title}`))
    .slice(0, 3);
  let ticker = document.getElementById("remote-notice-ticker");
  if (!tickerNotices.length) {
    clearTickerLabelTimer();
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
  const duration = tickerDuration(tickerNotices);
  const direction = tickerNotices[0]?.tickerDirection === "right" ? "right" : "left";
  const text = tickerNotices.map(buildTickerBodyText).filter(Boolean).join("　　");
  document.body.classList.add("has-remote-notice-ticker");
  ticker.className = `remote-notice-ticker remote-notice-ticker-${direction}`;
  ticker.style.setProperty("--ticker-duration", `${duration}s`);
  ticker.innerHTML = "";
  const label = document.createElement("span");
  label.className = "remote-notice-ticker-label";
  setTickerLabel(label, tickerNotices[0]);
  const viewport = document.createElement("div");
  viewport.className = "remote-notice-ticker-viewport";
  const track = document.createElement("div");
  track.className = "remote-notice-ticker-track";
  const first = document.createElement("span");
  const second = document.createElement("span");
  first.textContent = text || "お知らせがあります。";
  second.textContent = text || "お知らせがあります。";
  track.append(first, second);
  viewport.appendChild(track);
  const close = document.createElement("button");
  close.type = "button";
  close.className = "remote-notice-ticker-close";
  close.setAttribute("aria-label", "閉じる");
  close.textContent = "×";
  close.addEventListener("click", () => {
    tickerNotices.forEach((notice) => {
      sessionStorage.setItem(`${NOTICE_DISMISS_PREFIX}${notice.id || notice.title}`, "1");
    });
    clearTickerLabelTimer();
    ticker.remove();
    document.body.classList.remove("has-remote-notice-ticker");
  });
  ticker.append(label, viewport, close);
  startTickerLabelRotation(label, tickerNotices, duration);
}

function startTickerLabelRotation(label, notices, duration) {
  clearTickerLabelTimer();
  if (!Array.isArray(notices) || notices.length <= 1) return;
  let index = 0;
  const interval = Math.max(3500, Math.round((duration * 1000) / notices.length));
  tickerLabelTimer = window.setInterval(() => {
    index = (index + 1) % notices.length;
    setTickerLabel(label, notices[index]);
  }, interval);
}

function clearTickerLabelTimer() {
  if (!tickerLabelTimer) return;
  window.clearInterval(tickerLabelTimer);
  tickerLabelTimer = null;
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

function tickerDuration(notices) {
  const speed = notices.find((notice) => notice?.tickerSpeed)?.tickerSpeed || "normal";
  if (speed === "slow") return 36;
  if (speed === "fast") return 18;
  return 26;
}
