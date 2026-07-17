const TOKEN_STORAGE_KEY = "meteoscope-early-access-token";
const PENDING_RELEASE_STORAGE_KEY = "meteoscope-early-access-pending-release";
const ENDPOINT = globalThis.location?.hostname?.endsWith("github.io")
  ? "https://meteoscope.pages.dev/api/public/early-access"
  : "/api/public/early-access";

export async function validateEarlyAccess() {
  await flushPendingRelease();
  const token = readToken();
  if (!token) return inactiveState("シリアルコードを入力して認証してください。");
  try {
    const result = await requestAccess({ token });
    if (!result.active) throw new Error(result.error || "認証の有効期限が切れています。");
    return activeState(result);
  } catch (error) {
    if (Number(error?.status) === 401) removeToken();
    return inactiveState(error.message || "認証状態を確認できませんでした。");
  }
}

export async function activateEarlyAccess(serial) {
  const code = String(serial || "").trim();
  if (!code) return inactiveState("シリアルコードを入力してください。");
  try {
    const result = await requestAccess({ code });
    if (!result.active || !result.token) throw new Error(result.error || "シリアルコードを認証できませんでした。");
    writeToken(result.token);
    return activeState(result);
  } catch (error) {
    return inactiveState(error.message || "シリアルコードを認証できませんでした。");
  }
}

export function deactivateEarlyAccess() {
  const token = readToken();
  removeToken();
  if (token) {
    writePendingRelease(token);
    void releasePendingToken(token);
  }
  return inactiveState("この端末のアーリーアクセスを解除しました。通信できなかった場合は次回起動時に再送します。Webアプリを削除する場合は先に解除してください。");
}

export function getEarlyAccessToken() {
  return readToken();
}

async function flushPendingRelease() {
  const token = readPendingRelease();
  if (!token) return;
  await releasePendingToken(token);
}

async function releasePendingToken(token) {
  try {
    await requestAccess({ action: "deactivate", token }, { keepalive: true });
    if (readPendingRelease() === token) removePendingRelease();
  } catch {
    // Keep the token and retry the release when the app starts again.
  }
}

async function requestAccess(payload, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store",
      keepalive: Boolean(options.keepalive)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || "認証サーバーへ接続できませんでした。");
      error.status = response.status;
      throw error;
    }
    return result;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("認証サーバーが応答しませんでした。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function activeState(result) {
  return {
    status: "active",
    active: true,
    label: String(result.label || "アーリーアクセス"),
    expiresAt: result.expiresAt || null,
    message: "アーリーアクセスが有効です。Webアプリを削除する場合は、先に設定から解除してください。"
  };
}

function inactiveState(message) {
  return { status: "inactive", active: false, label: "", expiresAt: null, message };
}

function readToken() {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY) || ""; } catch { return ""; }
}

function writeToken(token) {
  try { localStorage.setItem(TOKEN_STORAGE_KEY, token); } catch { /* Session remains active until reload. */ }
}

function removeToken() {
  try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch { /* Ignore blocked storage. */ }
}

function readPendingRelease() {
  try { return localStorage.getItem(PENDING_RELEASE_STORAGE_KEY) || ""; } catch { return ""; }
}

function writePendingRelease(token) {
  try { localStorage.setItem(PENDING_RELEASE_STORAGE_KEY, token); } catch { /* Best-effort release still runs immediately. */ }
}

function removePendingRelease() {
  try { localStorage.removeItem(PENDING_RELEASE_STORAGE_KEY); } catch { /* Ignore blocked storage. */ }
}
