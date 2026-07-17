const API_BASE = "/api/admin";
const DEFAULT_CONFIG = {
  maintenance: {
    enabled: false,
    message: ""
  }
};

let currentConfig = structuredClone(DEFAULT_CONFIG);
let currentNotices = [];
let currentFeedback = [];
let currentEarlyAccessCodes = [];
let currentPushBroadcasts = [];
let currentAccounts = [];
let currentAccountTotal = 0;
let nextAccountOffset = null;

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
  quizMetricsList: document.getElementById("quiz-metrics-list"),
  accountList: document.getElementById("admin-account-list"),
  accountCount: document.getElementById("admin-account-count"),
  refreshAccountsButton: document.getElementById("refresh-accounts-button"),
  loadMoreAccountsButton: document.getElementById("load-more-accounts-button"),
  maintenanceEnabled: document.getElementById("maintenance-enabled"),
  maintenanceMessage: document.getElementById("maintenance-message"),
  saveConfigButton: document.getElementById("save-config-button"),
  noticeList: document.getElementById("notice-list"),
  addNoticeButton: document.getElementById("add-notice-button"),
  saveNoticesButton: document.getElementById("save-notices-button"),
  feedbackList: document.getElementById("feedback-list"),
  refreshFeedbackButton: document.getElementById("refresh-feedback-button"),
  purgeCacheButton: document.getElementById("purge-cache-button"),
  earlyAccessForm: document.getElementById("early-access-form"),
  earlyAccessSubmit: document.querySelector("#early-access-form button[type='submit']"),
  earlyAccessLabel: document.getElementById("early-access-label"),
  earlyAccessExpires: document.getElementById("early-access-expires"),
  earlyAccessMaxUses: document.getElementById("early-access-max-uses"),
  earlyAccessGenerated: document.getElementById("early-access-generated"),
  earlyAccessSerial: document.getElementById("early-access-serial"),
  copyEarlyAccessSerial: document.getElementById("copy-early-access-serial"),
  earlyAccessCodeList: document.getElementById("early-access-code-list"),
  pushForm: document.getElementById("admin-push-form"),
  pushTitle: document.getElementById("admin-push-title"),
  pushBody: document.getElementById("admin-push-body"),
  pushUrl: document.getElementById("admin-push-url"),
  pushSubmit: document.getElementById("admin-push-submit"),
  pushHistory: document.getElementById("admin-push-history")
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

  elements.refreshFeedbackButton.addEventListener("click", () => {
    void refreshFeedback();
  });

  elements.purgeCacheButton.addEventListener("click", () => {
    void purgeCache();
  });
  elements.earlyAccessForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void generateEarlyAccessCode();
  });
  elements.copyEarlyAccessSerial?.addEventListener("click", () => {
    void navigator.clipboard.writeText(elements.earlyAccessSerial.textContent || "");
  });
  elements.earlyAccessCodeList?.addEventListener("click", (event) => {
    const resetButton = event.target.closest("[data-reset-early-access]");
    if (resetButton) {
      void resetEarlyAccessActivations(resetButton.dataset.resetEarlyAccess);
      return;
    }
    const revokeButton = event.target.closest("[data-revoke-early-access]");
    if (revokeButton) void revokeEarlyAccessCode(revokeButton.dataset.revokeEarlyAccess);
  });
  elements.pushForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void sendAdminPushBroadcast();
  });
  elements.pushHistory?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-push-broadcast]");
    if (button) void deletePushBroadcast(button.dataset.deletePushBroadcast, button);
  });
  elements.refreshAccountsButton?.addEventListener("click", () => {
    void refreshAccounts({ reset: true });
  });
  elements.loadMoreAccountsButton?.addEventListener("click", () => {
    void refreshAccounts({ reset: false });
  });
  elements.accountList?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-delete-account]");
    if (button) void deleteAccount(button.dataset.deleteAccount, button);
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
  const [status, config, notices, feedback, earlyAccess, pushBroadcasts, accounts] = await Promise.all([
    requestJson("/status"),
    requestJson("/config"),
    requestJson("/notices"),
    requestJson("/feedback"),
    requestJson("/early-access/codes"),
    requestJson("/push/broadcasts"),
    requestJson("/accounts?limit=100&offset=0")
  ]);
  renderStatus(status);
  currentConfig = normalizeConfig(config.config);
  currentNotices = Array.isArray(notices.notices) ? notices.notices : [];
  currentFeedback = Array.isArray(feedback.feedback) ? feedback.feedback : [];
  currentEarlyAccessCodes = Array.isArray(earlyAccess.codes) ? earlyAccess.codes : [];
  currentPushBroadcasts = Array.isArray(pushBroadcasts.broadcasts) ? pushBroadcasts.broadcasts : [];
  applyAccountPage(accounts, { append: false });
  renderConfig();
  renderNotices();
  renderFeedback();
  renderEarlyAccessCodes();
  renderPushBroadcasts();
  renderAccounts();
  setMessage(elements.dashboardMessage, "読み込みました。", "success");
}

async function refreshAccounts({ reset }) {
  const offset = reset ? 0 : nextAccountOffset;
  if (offset === null) return;
  const button = reset ? elements.refreshAccountsButton : elements.loadMoreAccountsButton;
  if (button?.disabled) return;
  if (button) button.disabled = true;
  setMessage(elements.dashboardMessage, "アカウントを読み込み中...");
  try {
    const response = await requestJson(`/accounts?limit=100&offset=${encodeURIComponent(offset)}`);
    applyAccountPage(response, { append: !reset });
    renderAccounts();
    setMessage(elements.dashboardMessage, "アカウント一覧を更新しました。", "success");
  } catch (error) {
    setMessage(elements.dashboardMessage, error.message || "アカウント一覧を取得できませんでした。", "error");
  } finally {
    if (button) button.disabled = false;
  }
}

function applyAccountPage(page, { append }) {
  const incoming = Array.isArray(page?.accounts) ? page.accounts : [];
  if (append) {
    const byID = new Map(currentAccounts.map((account) => [account.id, account]));
    incoming.forEach((account) => byID.set(account.id, account));
    currentAccounts = [...byID.values()];
  } else {
    currentAccounts = incoming;
  }
  currentAccountTotal = Math.max(0, Number(page?.total || 0));
  nextAccountOffset = Number.isInteger(page?.nextOffset) ? page.nextOffset : null;
}

function renderAccounts() {
  if (!elements.accountList) return;
  if (elements.accountCount) elements.accountCount.textContent = `${formatInteger(currentAccountTotal)}件`;
  if (!currentAccounts.length) {
    elements.accountList.innerHTML = `<p class="admin-muted">登録済みアカウントはありません。</p>`;
  } else {
    elements.accountList.innerHTML = currentAccounts.map((account) => `
      <article class="admin-account-item">
        <div class="admin-account-name">
          <strong>${escapeHtml(account.displayName || "名称未設定")}</strong>
          <span>ログインID：${escapeHtml(account.username || "--")}</span>
        </div>
        <div class="admin-account-meta">
          <span>作成 ${escapeHtml(formatAdminDate(account.createdAt))}</span>
          <small>ID ${escapeHtml(account.id || "--")}</small>
        </div>
        <button class="admin-danger-button" type="button" data-delete-account="${escapeAttribute(account.id || "")}">完全に削除</button>
      </article>
    `).join("");
  }
  if (elements.loadMoreAccountsButton) {
    elements.loadMoreAccountsButton.hidden = nextAccountOffset === null;
    elements.loadMoreAccountsButton.textContent = `さらに表示（${formatInteger(currentAccounts.length)} / ${formatInteger(currentAccountTotal)}件）`;
  }
}

async function deleteAccount(accountID, button) {
  const account = currentAccounts.find((item) => item.id === accountID);
  if (!account) return;
  const confirmed = confirm(
    `${account.displayName}（${account.username}）を完全に削除しますか？\n\nD1のセッション、クイズ記録、ランキング、現在地投稿、通報、アーリーアクセス紐付けも削除され、元に戻せません。`
  );
  if (!confirmed) return;
  button.disabled = true;
  setMessage(elements.dashboardMessage, "アカウントと関連データを削除中...");
  try {
    await requestJson(`/accounts/${encodeURIComponent(accountID)}`, { method: "DELETE" });
    await refreshAccounts({ reset: true });
    renderStatus(await requestJson("/status"));
    setMessage(elements.dashboardMessage, `${account.displayName} と関連するD1データを削除しました。`, "success");
  } catch (error) {
    button.disabled = false;
    setMessage(elements.dashboardMessage, error.message || "アカウントを削除できませんでした。", "error");
  }
}

async function sendAdminPushBroadcast() {
  const title = elements.pushTitle?.value.trim() || "";
  const body = elements.pushBody?.value.trim() || "";
  const url = elements.pushUrl?.value || "/";
  if (!title || !body) {
    setMessage(elements.dashboardMessage, "通知タイトルと本文を入力してください。", "error");
    return;
  }
  if (!confirm(`「${title}」を通知購読端末へ配信予約しますか？`)) return;

  setMessage(elements.dashboardMessage, "プッシュ通知を予約中...");
  if (elements.pushSubmit) elements.pushSubmit.disabled = true;
  try {
    const response = await requestJson("/push/broadcasts", {
      method: "POST",
      body: { title, body, url }
    });
    currentPushBroadcasts = Array.isArray(response.broadcasts) ? response.broadcasts : [];
    renderPushBroadcasts();
    if (elements.pushTitle) elements.pushTitle.value = "";
    if (elements.pushBody) elements.pushBody.value = "";
    if (elements.pushUrl) elements.pushUrl.value = "/";
    const total = Number(response.broadcast?.total || 0);
    setMessage(
      elements.dashboardMessage,
      total ? `${total}端末への通知を予約しました。` : "配信対象の通知購読端末はありませんでした。",
      total ? "success" : ""
    );
  } catch (error) {
    setMessage(elements.dashboardMessage, error.message || "プッシュ通知を予約できませんでした。", "error");
  } finally {
    if (elements.pushSubmit) elements.pushSubmit.disabled = false;
  }
}

function renderPushBroadcasts() {
  if (!elements.pushHistory) return;
  if (!currentPushBroadcasts.length) {
    elements.pushHistory.innerHTML = `<p class="admin-muted">配信履歴はありません。</p>`;
    return;
  }
  elements.pushHistory.innerHTML = currentPushBroadcasts.map((broadcast) => `
    <article class="admin-push-history-item">
      <div class="admin-push-history-head">
        <strong>${escapeHtml(broadcast.title || "通知")}</strong>
        <div class="admin-push-history-actions">
          <span data-status="${escapeAttribute(broadcast.status || "queued")}">${escapeHtml(pushBroadcastStatusLabel(broadcast.status))}</span>
          ${broadcast.status === "completed" ? `<button class="admin-danger-button" type="button" data-delete-push-broadcast="${escapeAttribute(broadcast.id || "")}">履歴を削除</button>` : ""}
        </div>
      </div>
      <p>${escapeHtml(broadcast.body || "")}</p>
      <div class="admin-push-counts">
        <span>対象 ${Number(broadcast.total || 0)}</span>
        <span>配信 ${Number(broadcast.sent || 0)}</span>
        <span>失効 ${Number(broadcast.removed || 0)}</span>
        <span>失敗 ${Number(broadcast.failed || 0)}</span>
      </div>
      <small>${escapeHtml(formatAdminDate(broadcast.createdAt))}</small>
    </article>
  `).join("");
}

async function deletePushBroadcast(broadcastID, button) {
  const broadcast = currentPushBroadcasts.find((item) => item.id === broadcastID);
  if (!broadcast || !confirm(`「${broadcast.title || "通知"}」の配信履歴をD1から削除しますか？`)) return;
  button.disabled = true;
  setMessage(elements.dashboardMessage, "通知履歴を削除中...");
  try {
    const response = await requestJson(`/push/broadcasts/${encodeURIComponent(broadcastID)}`, { method: "DELETE" });
    currentPushBroadcasts = Array.isArray(response.broadcasts) ? response.broadcasts : [];
    renderPushBroadcasts();
    setMessage(elements.dashboardMessage, "通知履歴と関連するD1データを削除しました。", "success");
  } catch (error) {
    button.disabled = false;
    setMessage(elements.dashboardMessage, error.message || "通知履歴を削除できませんでした。", "error");
  }
}

function pushBroadcastStatusLabel(status) {
  return {
    queued: "配信待ち",
    sending: "配信中",
    completed: "完了"
  }[status] || "配信待ち";
}

async function generateEarlyAccessCode() {
  if (elements.earlyAccessSubmit?.disabled) return;
  setMessage(elements.dashboardMessage, "シリアルコードを発行中...");
  if (elements.earlyAccessSubmit) elements.earlyAccessSubmit.disabled = true;
  try {
    const expiresAt = parseEarlyAccessExpiration(elements.earlyAccessExpires.value);
    const response = await requestJson("/early-access/codes", {
      method: "POST",
      body: {
        label: elements.earlyAccessLabel.value.trim(),
        expiresAt,
        maxUses: Number(elements.earlyAccessMaxUses.value) || 1
      }
    });
    if (!response.serial) throw new Error("シリアルコードが返されませんでした。");
    currentEarlyAccessCodes = Array.isArray(response.codes) ? response.codes : [];
    elements.earlyAccessSerial.textContent = response.serial;
    elements.earlyAccessGenerated.hidden = false;
    renderEarlyAccessCodes();
    setMessage(elements.dashboardMessage, "シリアルコードを発行しました。", "success");
  } catch (error) {
    console.error("[MeteoScope Admin] serial generation failed", error);
    setMessage(elements.dashboardMessage, error.message || "シリアルコードを発行できませんでした。", "error");
  } finally {
    if (elements.earlyAccessSubmit) elements.earlyAccessSubmit.disabled = false;
  }
}

function parseEarlyAccessExpiration(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("有効期限を正しく入力してください。");
  return date.toISOString();
}

async function revokeEarlyAccessCode(id) {
  if (!id || !confirm("このコードを失効しますか？認証済み端末でも利用できなくなります。")) return;
  const response = await requestJson(`/early-access/codes/${encodeURIComponent(id)}`, { method: "DELETE" });
  currentEarlyAccessCodes = Array.isArray(response.codes) ? response.codes : [];
  renderEarlyAccessCodes();
  setMessage(elements.dashboardMessage, "シリアルコードを失効しました。", "success");
}

async function resetEarlyAccessActivations(id) {
  if (!id || !confirm("このコードを使用中の全端末を解除し、利用数を0台に戻しますか？各端末ではシリアルコードの再入力が必要です。")) return;
  const response = await requestJson(`/early-access/codes/${encodeURIComponent(id)}/activations`, { method: "DELETE" });
  currentEarlyAccessCodes = Array.isArray(response.codes) ? response.codes : [];
  renderEarlyAccessCodes();
  setMessage(elements.dashboardMessage, `${Number(response.removedActivations || 0)}台分の認証枠をリセットしました。`, "success");
}

function renderEarlyAccessCodes() {
  if (!currentEarlyAccessCodes.length) {
    elements.earlyAccessCodeList.innerHTML = `<p class="admin-muted">発行済みコードはありません。</p>`;
    return;
  }
  elements.earlyAccessCodeList.innerHTML = currentEarlyAccessCodes.map((entry) => `
    <article class="admin-serial-item"><div>
      <strong>${escapeHtml(entry.label || "アーリーアクセス")}</strong>
      <span>${escapeHtml(formatAdminDate(entry.createdAt))} 発行</span>
      <small>利用 ${Number(entry.uses || 0)} / ${Number(entry.maxUses || 1)}台${entry.expiresAt ? ` ・ ${escapeHtml(formatAdminDate(entry.expiresAt))}まで` : " ・ 期限なし"}</small>
    </div><div class="admin-serial-actions">
      <button class="admin-secondary-button" type="button" data-reset-early-access="${escapeHtml(entry.id)}">利用枠をリセット</button>
      <button class="admin-danger-button" type="button" data-revoke-early-access="${escapeHtml(entry.id)}">失効</button>
    </div></article>
  `).join("");
}

function formatAdminDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function renderStatus(status) {
  const warningCron = status.warningCron || {};
  const notificationResult = warningCron.lastNotificationResult || {};
  const rows = [
    ["D1", status.bindings?.d1 ? "利用可能" : "未設定"],
    ["R2", status.bindings?.r2 ? "利用可能" : "未設定"],
    ["キャッシュ削除", status.bindings?.cachePurge ? "設定済み" : "未設定"],
    ["現在時刻", status.nowJst || "--"],
    ["設定更新", status.configUpdatedAt || "--"],
    ["警報取得フェーズ", warningCron.phase === "notify" ? "通知判定" : warningCron.phase === "fetch" ? "官署取得" : "未実行"],
    ["全国取得完了", formatAdminDate(warningCron.lastCycleCompletedAt)],
    ["全官署の最終成功", formatAdminDate(warningCron.lastFullySuccessfulAt)],
    ["取得失敗官署", `${Number(warningCron.failedOfficeCount || 0)}件`],
    ["通知処理結果", notificationResult.completedAt
      ? `送信 ${Number(notificationResult.notified || 0)}・失敗 ${Number(notificationResult.failed || 0)}・保留 ${Number(notificationResult.staleSkipped || 0)}`
      : "処理中または未実行"],
    ["全国収集の目安", `最大約${Number(warningCron.maximumCollectionDelayMinutes || 4)}分＋通知キュー時間`]
  ];
  elements.statusList.innerHTML = rows.map(([label, value]) => `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${escapeHtml(value)}</dd>
    </div>
  `).join("");
  renderQuizMetrics(status.quiz || {}, status.d1Usage || {});
}

function renderQuizMetrics(quiz, usage) {
  if (!elements.quizMetricsList) return;
  if (quiz.migrationRequired) {
    elements.quizMetricsList.innerHTML = statusRow("状態", "D1 migration 0007までの適用が必要です");
    return;
  }
  const rows = [
    ["アカウント数", quiz.configured ? `${formatInteger(quiz.accountCount)}件` : "未設定"],
    ["DAU（UTC当日）", quiz.configured ? `${formatInteger(quiz.dailyActiveAccounts)}人` : "--"],
    ["クイズ完了（24時間）", quiz.configured ? `${formatInteger(quiz.attempts24h)}回` : "--"],
    ["本日のランキング記録", quiz.configured ? `${formatInteger(quiz.dailyScoreRows)}件` : "--"],
    ["詳細挑戦履歴", quiz.configured ? `${formatInteger(quiz.attemptRows)}件` : "--"],
    ["挑戦履歴の保持", quiz.configured ? `${Number(quiz.attemptRetentionDays || 15)}日` : "--"],
    ["最終自動整理", formatAdminDate(quiz.maintenance?.completedAt)],
    ["D1読取（UTC当日）", formatD1Quota(usage.rowsRead, 5_000_000, usage)],
    ["D1書込（UTC当日）", formatD1Quota(usage.rowsWritten, 100_000, usage)],
    ["D1保存容量", formatStorageQuota(usage.storageBytes, 500 * 1024 * 1024, usage)]
  ];
  elements.quizMetricsList.innerHTML = rows.map(([label, value]) => statusRow(label, value)).join("");
}

function statusRow(label, value) {
  return `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
}

function formatInteger(value) {
  return new Intl.NumberFormat("ja-JP").format(Number(value || 0));
}

function formatD1Quota(value, limit, usage) {
  if (value === null || value === undefined) return usage.configured ? "取得不可" : "Analytics未設定";
  const amount = Number(value);
  return `${formatInteger(amount)}行 / ${formatInteger(limit)}行（${formatPercent(amount, limit)}）`;
}

function formatStorageQuota(value, limit, usage) {
  if (value === null || value === undefined) return usage.configured ? "取得不可" : "Analytics未設定";
  const amount = Number(value);
  return `${formatBytes(amount)} / ${formatBytes(limit)}（${formatPercent(amount, limit)}）`;
}

function formatPercent(value, limit) {
  return `${Math.min(999, Math.max(0, value / limit * 100)).toFixed(2)}%`;
}

function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return "--";
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
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

async function refreshFeedback() {
  setMessage(elements.dashboardMessage, "利用者意見を読み込み中...");
  const response = await requestJson("/feedback");
  currentFeedback = Array.isArray(response.feedback) ? response.feedback : [];
  renderFeedback();
  setMessage(elements.dashboardMessage, "利用者意見を更新しました。", "success");
}

function renderFeedback() {
  if (!elements.feedbackList) return;
  if (!currentFeedback.length) {
    elements.feedbackList.innerHTML = `<p class="admin-muted">利用者意見はまだありません。</p>`;
    return;
  }

  elements.feedbackList.innerHTML = currentFeedback.map((item) => `
    <article class="admin-feedback-item">
      <div class="admin-feedback-meta">
        <span>${escapeHtml(feedbackCategoryLabel(item.category))}</span>
        <time>${escapeHtml(formatDateTime(item.createdAt))}</time>
      </div>
      <p>${escapeHtml(item.message || "")}</p>
      <small>${escapeHtml(item.page || "/")}</small>
    </article>
  `).join("");
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

function feedbackCategoryLabel(category) {
  return {
    request: "改善要望",
    bug: "不具合",
    design: "デザイン",
    other: "その他"
  }[category] || "その他";
}

function formatDateTime(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
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
