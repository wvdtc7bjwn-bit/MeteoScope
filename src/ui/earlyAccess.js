import { getMeteoScopeAccountSessionToken } from "../domain/quizRankingClient.js";

const ENDPOINT = globalThis.location?.hostname?.endsWith("github.io")
  ? "https://meteoscope.pages.dev/api/public/early-access"
  : "/api/public/early-access";

export function accountAuthHeaders() {
  const token = getMeteoScopeAccountSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function validateEarlyAccess() {
  if (import.meta.env?.DEV && ["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location?.hostname)) {
    return { status: "active", active: true, label: "ローカル開発", activeFaultSource: "jshis", message: "localhostでは先行機能を利用できます。" };
  }
  try {
    const result = await requestAccess("status");
    return { status: "active", active: true, label: "許可済み", activeFaultSource: result.activeFaultSource === "gsj" ? "gsj" : "jshis", message: "このアカウントはアーリーアクセスを利用できます。" };
  } catch (error) {
    return { status: "inactive", active: false, label: "", message: error.message || "認証状態を確認できませんでした。" };
  }
}

export async function fetchEarlyAccessActiveFaultSegments() {
  let data;
  if (import.meta.env?.DEV && ["localhost", "127.0.0.1", "[::1]"].includes(globalThis.location?.hostname)) {
    const response = await fetch("/api/local-active-fault", { cache: "no-store" });
    data = await response.json();
    if (!response.ok) throw new Error(data.error || "産総研活断層データを取得できませんでした。");
  } else {
    data = await requestAccess("active-fault", 20000);
  }
  if (data?.type !== "FeatureCollection" || !Array.isArray(data.features)) {
    throw new Error("産総研活断層データの形式が正しくありません。");
  }
  return data;
}

async function requestAccess(action, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...accountAuthHeaders() },
      body: JSON.stringify({ action }),
      credentials: "same-origin",
      signal: controller.signal,
      cache: "no-store"
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(result.error || "認証サーバーへ接続できませんでした。");
      error.status = response.status;
      throw error;
    }
    if (action === "status" && result.active !== true) throw new Error(result.error || "利用が許可されていません。");
    return result;
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("認証サーバーが応答しませんでした。");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
