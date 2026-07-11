const TOKEN_STORAGE_KEY = "meteoscope-early-access-token";
const ENDPOINT = "/api/public/early-access";

export async function validateEarlyAccess() {
  const token = readToken();
  if (!token) return inactiveState("シリアルコードを入力して認証してください。");
  try {
    const result = await requestAccess({ token });
    if (!result.active) throw new Error(result.error || "認証の有効期限が切れています。");
    return activeState(result);
  } catch (error) {
    removeToken();
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
  removeToken();
  return inactiveState("この端末のアーリーアクセスを解除しました。");
}

async function requestAccess(payload) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
      cache: "no-store"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || "認証サーバーへ接続できませんでした。");
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
    message: "アーリーアクセスが有効です。"
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
