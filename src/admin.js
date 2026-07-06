const API_BASE = "/api/admin";
const DEFAULT_CONFIG = {
  maintenance: {
    enabled: false,
    message: ""
  }
};

let currentConfig = structuredClone(DEFAULT_CONFIG);
let currentNotices = [];

const elements = {
  loginView: document.getElementById("login-view"),
  dashboardView: document.getElementById("dashboard-view"),
  loginForm: document.getElementById("login-form"),
  password: document.getElementById("admin-password"),
  loginMessage: document.getElementById("login-message"),
  dashboardMessage: document.getElementById("dashboard-message"),
  logoutButton: document.getElementById("logout-button"),
  refreshStatusButton: document.getElementById("refresh-status-button"),
  statusList: document.getElementById("status-list"),
  maintenanceEnabled: document.getElementById("maintenance-enabled"),
  maintenanceMessage: document.getElementById("maintenance-message"),
  saveConfigButton: document.getElementById("save-config-button"),
  noticeList: document.getElementById("notice-list"),
  addNoticeButton: document.getElementById("add-notice-button"),
  saveNoticesButton: document.getElementById("save-notices-button"),
  purgeCacheButton: document.getElementById("purge-cache-button")
};

void initialize();

async function initialize() {
  bindEvents();
  const session = await requestJson("/session", { ignoreUnauthorized: true });
  if (session?.authenticated) {
    showDashboard();
    await refreshDashboard();
  } else {
    showLogin();
    if (session?.setup?.passwordConfigured === false) {
      setMessage(elements.loginMessage, "Cloudflare の環境変数 ADMIN_PASSWORD を設定してください。", "error");
    }
  }
}

function bindEvents() {
  elements.loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage(elements.loginMessage, "確認中...");
    try {
      await requestJson("/login", {
        method: "POST",
        body: { password: elements.password.value }
      });
      elements.password.value = "";
      showDashboard();
      await refreshDashboard();
    } catch (error) {
      setMessage(elements.loginMessage, error.message || "ログインできませんでした。", "error");
    }
  });

  elements.logoutButton.addEventListener("click", async () => {
    await requestJson("/logout", { method: "POST" }).catch(() => null);
    showLogin();
  });

  elements.refreshStatusButton.addEventListener("click", () => {
    void refreshDashboard();
  });

  elements.saveConfigButton.addEventListener("click", () => {
    void saveConfig();
  });

  elements.addNoticeButton.addEventListener("click", () => {
    currentNotices.push(createEmptyNotice());
    renderNotices();
  });

  elements.saveNoticesButton.addEventListener("click", () => {
    void saveNotices();
  });

  elements.purgeCacheButton.addEventListener("click", () => {
    void purgeCache();
  });
}

function showLogin() {
  elements.loginView.hidden = false;
  elements.dashboardView.hidden = true;
  elements.password.focus();
}

function showDashboard() {
  elements.loginView.hidden = true;
  elements.dashboardView.hidden = false;
  setMessage(elements.loginMessage, "");
}

async function refreshDashboard() {
  setMessage(elements.dashboardMessage, "読み込み中...");
  const [status, config, notices] = await Promise.all([
    requestJson("/status"),
    requestJson("/config"),
    requestJson("/notices")
  ]);
  renderStatus(status);
  currentConfig = normalizeConfig(config.config);
  currentNotices = Array.isArray(notices.notices) ? notices.notices : [];
  renderConfig();
  renderNotices();
  setMessage(elements.dashboardMessage, "読み込みました。", "success");
}

function renderStatus(status) {
  const rows = [
    ["KV", status.bindings?.kv ? "利用可能" : "未設定"],
    ["R2", status.bindings?.r2 ? "利用可能" : "未設定"],
    ["キャッシュ削除", status.bindings?.cachePurge ? "設定済み" : "未設定"],
    ["現在時刻", status.nowJst || "--"],
    ["設定更新", status.configUpdatedAt || "--"]
  ];
  elements.statusList.innerHTML = rows.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
}

function renderConfig() {
  elements.maintenanceEnabled.checked = Boolean(currentConfig.maintenance?.enabled);
  elements.maintenanceMessage.value = currentConfig.maintenance?.message || "";
}

async function saveConfig() {
  currentConfig.maintenance = {
    enabled: elements.maintenanceEnabled.checked,
    message: elements.maintenanceMessage.value.trim()
  };
  setMessage(elements.dashboardMessage, "設定を保存中...");
  const response = await requestJson("/config", {
    method: "PUT",
    body: { config: currentConfig }
  });
  currentConfig = normalizeConfig(response.config);
  renderConfig();
  setMessage(elements.dashboardMessage, "設定を保存しました。", "success");
}

function renderNotices() {
  if (!currentNotices.length) {
    elements.noticeList.innerHTML = `<p class="admin-muted">お知らせはありません。</p>`;
    return;
  }

  elements.noticeList.innerHTML = "";
  currentNotices.forEach((notice, index) => {
    const editor = document.createElement("article");
    editor.className = "admin-notice-editor";
    editor.innerHTML = `
      <div class="admin-notice-top">
        <label class="admin-notice-toggle">
          <input type="checkbox" data-notice-field="enabled" ${notice.enabled !== false ? "checked" : ""} />
          表示
        </label>
        <label class="admin-notice-toggle">
          <input type="checkbox" data-notice-field="isTicker" ${notice.isTicker ? "checked" : ""} />
          テロップ
        </label>
        <button class="admin-small-button danger" type="button" data-notice-remove>削除</button>
      </div>
      <div class="admin-notice-fields">
        <input type="text" data-notice-field="title" value="${escapeAttribute(notice.title || "")}" placeholder="タイトル" />
        <select data-notice-field="level">
          <option value="info" ${notice.level === "info" ? "selected" : ""}>通常</option>
          <option value="warning" ${notice.level === "warning" ? "selected" : ""}>注意</option>
          <option value="critical" ${notice.level === "critical" ? "selected" : ""}>重要</option>
        </select>
        <select data-notice-field="tickerSpeed">
          <option value="slow" ${notice.tickerSpeed === "slow" ? "selected" : ""}>ゆっくり</option>
          <option value="normal" ${!notice.tickerSpeed || notice.tickerSpeed === "normal" ? "selected" : ""}>標準</option>
          <option value="fast" ${notice.tickerSpeed === "fast" ? "selected" : ""}>速い</option>
        </select>
        <select data-notice-field="tickerDirection">
          <option value="left" ${notice.tickerDirection !== "right" ? "selected" : ""}>右から左</option>
          <option value="right" ${notice.tickerDirection === "right" ? "selected" : ""}>左から右</option>
        </select>
      </div>
      <textarea data-notice-field="body" placeholder="本文。テロップ表示ではこの文章が横に流れます。">${escapeHtml(notice.body || "")}</textarea>
      <div class="admin-ticker-preview ${notice.isTicker ? "" : "is-card"}">
        <span>${escapeHtml(notice.isTicker ? "テロップ表示" : "通常カード表示")}</span>
        <strong>${escapeHtml(buildNoticePreviewText(notice))}</strong>
      </div>
    `;

    editor.querySelectorAll("[data-notice-field]").forEach((input) => {
      input.addEventListener("input", () => updateNoticeFromEditor(index, editor));
      input.addEventListener("change", () => updateNoticeFromEditor(index, editor));
    });
    editor.querySelector("[data-notice-remove]").addEventListener("click", () => {
      currentNotices.splice(index, 1);
      renderNotices();
    });
    elements.noticeList.appendChild(editor);
  });
}

function updateNoticeFromEditor(index, editor) {
  const notice = currentNotices[index];
  if (!notice) return;
  editor.querySelectorAll("[data-notice-field]").forEach((field) => {
    const key = field.dataset.noticeField;
    notice[key] = field.type === "checkbox" ? field.checked : field.value;
  });
  const preview = editor.querySelector(".admin-ticker-preview");
  if (preview) {
    preview.classList.toggle("is-card", !notice.isTicker);
    preview.querySelector("span").textContent = notice.isTicker ? "テロップ表示" : "通常カード表示";
    preview.querySelector("strong").textContent = buildNoticePreviewText(notice);
  }
}

async function saveNotices() {
  setMessage(elements.dashboardMessage, "お知らせを保存中...");
  const response = await requestJson("/notices", {
    method: "PUT",
    body: { notices: currentNotices.map(normalizeNotice) }
  });
  currentNotices = response.notices || [];
  renderNotices();
  setMessage(elements.dashboardMessage, "お知らせを保存しました。", "success");
}

async function purgeCache() {
  setMessage(elements.dashboardMessage, "キャッシュ削除APIを実行中...");
  const response = await requestJson("/cache/purge", { method: "POST" });
  setMessage(elements.dashboardMessage, response.message || "完了しました。", response.ok ? "success" : "error");
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined,
    credentials: "same-origin"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !options.ignoreUnauthorized) showLogin();
    if (response.status === 401 && options.ignoreUnauthorized) return payload;
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

function normalizeConfig(config) {
  return {
    ...structuredClone(DEFAULT_CONFIG),
    ...(config || {}),
    maintenance: {
      ...DEFAULT_CONFIG.maintenance,
      ...(config?.maintenance || {})
    }
  };
}

function normalizeNotice(notice) {
  return {
    id: notice.id || crypto.randomUUID(),
    title: String(notice.title || "").trim() || "お知らせ",
    body: String(notice.body || "").trim(),
    level: ["info", "warning", "critical"].includes(notice.level) ? notice.level : "info",
    enabled: notice.enabled !== false,
    isTicker: Boolean(notice.isTicker),
    tickerSpeed: ["slow", "normal", "fast"].includes(notice.tickerSpeed) ? notice.tickerSpeed : "normal",
    tickerDirection: notice.tickerDirection === "right" ? "right" : "left",
    updatedAt: new Date().toISOString()
  };
}

function createEmptyNotice() {
  return {
    id: crypto.randomUUID(),
    title: "",
    body: "",
    level: "info",
    enabled: true,
    isTicker: true,
    tickerSpeed: "normal",
    tickerDirection: "left"
  };
}

function buildNoticePreviewText(notice) {
  const title = String(notice.title || "").trim();
  const body = String(notice.body || "").trim();
  if (title && body) return `${title}：${body}`;
  return body || title || "お知らせ本文を入力してください。";
}

function setMessage(element, text, type = "") {
  element.textContent = text;
  element.className = `admin-message ${type}`.trim();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
