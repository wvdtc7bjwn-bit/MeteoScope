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
  pdfStatus: document.getElementById("pdf-status"),
  pdfInput: document.getElementById("pdf-input"),
  pdfOpenLink: document.getElementById("pdf-open-link"),
  deletePdfButton: document.getElementById("delete-pdf-button"),
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

  elements.pdfInput.addEventListener("change", () => {
    void uploadPdf();
  });

  elements.deletePdfButton.addEventListener("click", () => {
    void deletePdf();
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
  const [status, config, notices, pdf] = await Promise.all([
    requestJson("/status"),
    requestJson("/config"),
    requestJson("/notices"),
    requestJson("/disaster-map")
  ]);
  renderStatus(status);
  currentConfig = normalizeConfig(config.config);
  currentNotices = Array.isArray(notices.notices) ? notices.notices : [];
  renderConfig();
  renderNotices();
  renderPdfStatus(pdf);
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
      <label class="admin-notice-toggle">
        <input type="checkbox" data-notice-field="enabled" ${notice.enabled !== false ? "checked" : ""} />
        表示
      </label>
      <input type="text" data-notice-field="title" value="${escapeAttribute(notice.title || "")}" placeholder="タイトル" />
      <select data-notice-field="level">
        <option value="info" ${notice.level === "info" ? "selected" : ""}>通常</option>
        <option value="warning" ${notice.level === "warning" ? "selected" : ""}>注意</option>
        <option value="critical" ${notice.level === "critical" ? "selected" : ""}>重要</option>
      </select>
      <button class="admin-small-button danger" type="button" data-notice-remove>削除</button>
      <textarea data-notice-field="body" placeholder="本文">${escapeHtml(notice.body || "")}</textarea>
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

function renderPdfStatus(pdf) {
  if (pdf.hasFile) {
    elements.pdfStatus.textContent = `${pdf.meta?.name || "PDF"} を保存しています。`;
    elements.pdfOpenLink.hidden = false;
    elements.deletePdfButton.disabled = false;
  } else {
    elements.pdfStatus.textContent = "保存済みPDFはありません。";
    elements.pdfOpenLink.hidden = true;
    elements.deletePdfButton.disabled = true;
  }
}

async function uploadPdf() {
  const file = elements.pdfInput.files?.[0];
  if (!file) return;
  if (file.type && file.type !== "application/pdf") {
    setMessage(elements.dashboardMessage, "PDFファイルを選択してください。", "error");
    return;
  }
  const formData = new FormData();
  formData.append("file", file);
  setMessage(elements.dashboardMessage, "PDFをアップロード中...");
  const response = await fetch(`${API_BASE}/disaster-map`, {
    method: "POST",
    body: formData,
    credentials: "same-origin"
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    setMessage(elements.dashboardMessage, payload.error || "PDFを保存できませんでした。", "error");
    return;
  }
  renderPdfStatus(payload);
  elements.pdfInput.value = "";
  setMessage(elements.dashboardMessage, "PDFを保存しました。", "success");
}

async function deletePdf() {
  if (!confirm("保存済みPDFを削除しますか？")) return;
  const response = await requestJson("/disaster-map", { method: "DELETE" });
  renderPdfStatus(response);
  setMessage(elements.dashboardMessage, "PDFを削除しました。", "success");
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
    updatedAt: new Date().toISOString()
  };
}

function createEmptyNotice() {
  return {
    id: crypto.randomUUID(),
    title: "",
    body: "",
    level: "info",
    enabled: true
  };
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
