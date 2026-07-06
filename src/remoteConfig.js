const PUBLIC_CONFIG_ENDPOINT = "/api/public/config";
const NOTICE_DISMISS_PREFIX = "weather-viewer.notice.dismissed.";

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
      console.debug("[Weather Viewer] remote config unavailable", error);
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
  let stack = document.getElementById("remote-notice-stack");
  if (!notices.length) {
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

  const visibleNotices = notices
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
