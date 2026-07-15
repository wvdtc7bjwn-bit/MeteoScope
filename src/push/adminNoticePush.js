const STORAGE_KEY = "meteoscope.adminNoticePush.enabled";
const LEGACY_STORAGE_KEY = "meteoscope.locationWarningPush.enabled";
const LEGACY_ADVISORY_STORAGE_KEY = "meteoscope.locationWarningPush.notifyAdvisory";

export function createAdminNoticePush(options = {}) {
  let state = {
    supported: isSupported(),
    configured: null,
    enabled: isStoredAsEnabled(),
    subscribed: false,
    busy: false,
    permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    message: ""
  };
  let configPromise = null;

  async function initialize() {
    if (!state.supported) {
      updateState({ message: "このブラウザではWeb通知を利用できません。" });
      return state;
    }
    try {
      const config = await loadConfig({ force: true });
      await navigator.serviceWorker.register("/sw.js");
      const readyRegistration = await navigator.serviceWorker.ready;
      const subscription = await readyRegistration.pushManager.getSubscription();
      const configured = Boolean(config.enabled && config.publicKey);
      const subscribed = Boolean(subscription && Notification.permission === "granted");
      const enabled = configured && subscribed;

      if (enabled) {
        await postSubscription(subscription);
        storeEnabled();
      } else if (!subscribed) {
        clearStoredState();
      }

      updateState({
        configured,
        enabled,
        subscribed,
        permission: Notification.permission,
        message: configured
          ? enabled ? "管理者からのお知らせを受け取ります。" : ""
          : buildConfigurationMessage(config)
      });
      return state;
    } catch (error) {
      console.warn("[MeteoScope] admin notice push init failed", error);
      updateState({ configured: false, message: "通知機能を初期化できませんでした。" });
      return state;
    }
  }

  async function enable() {
    if (!state.supported) return initialize();

    updateState({ busy: true, message: "通知を設定しています..." });
    try {
      const config = await loadConfig({ force: true });
      if (!config.enabled || !config.publicKey) {
        clearStoredState();
        updateState({
          busy: false,
          enabled: false,
          subscribed: false,
          configured: false,
          message: buildConfigurationMessage(config)
        });
        return state;
      }

      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        clearStoredState();
        updateState({
          busy: false,
          enabled: false,
          subscribed: false,
          permission,
          message: "通知の利用が許可されていません。"
        });
        return state;
      }

      await navigator.serviceWorker.register("/sw.js");
      const readyRegistration = await navigator.serviceWorker.ready;
      const subscription = await getOrCreateSubscription(readyRegistration, config.publicKey);
      await postSubscription(subscription);
      storeEnabled();
      updateState({
        busy: false,
        enabled: true,
        subscribed: true,
        permission,
        configured: true,
        message: "管理者からのお知らせ通知を有効にしました。"
      });
      return state;
    } catch (error) {
      console.warn("[MeteoScope] admin notice push subscribe failed", error);
      clearStoredState();
      updateState({ busy: false, enabled: false, subscribed: false, message: buildSubscribeErrorMessage(error) });
      return state;
    }
  }

  async function disable() {
    updateState({ busy: true, message: "通知を解除しています..." });
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        });
        if (!response.ok) throw new Error(`unsubscribe failed: ${response.status}`);
        const unsubscribed = await subscription.unsubscribe();
        if (!unsubscribed) throw new Error("browser unsubscribe failed");
      }
      clearStoredState();
      updateState({ busy: false, enabled: false, subscribed: false, message: "お知らせ通知を解除しました。" });
      return state;
    } catch (error) {
      console.warn("[MeteoScope] admin notice push unsubscribe failed", error);
      updateState({ busy: false, message: "通知解除を完了できませんでした。もう一度お試しください。" });
      return state;
    }
  }

  function getState() {
    return { ...state };
  }

  function updateState(nextState) {
    state = { ...state, ...nextState };
    options.onChange?.(state);
  }

  function loadConfig(options = {}) {
    if (options.force) configPromise = null;
    if (!configPromise) {
      configPromise = fetch("/api/push/config", { cache: "no-store" })
        .then((response) => response.ok ? response.json() : { enabled: false, publicKey: "" })
        .catch(() => ({ enabled: false, publicKey: "" }));
    }
    return configPromise;
  }

  return { initialize, enable, disable, getState };
}

function isSupported() {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext;
}

function isStoredAsEnabled() {
  return localStorage.getItem(STORAGE_KEY) === "1" || localStorage.getItem(LEGACY_STORAGE_KEY) === "1";
}

function storeEnabled() {
  localStorage.setItem(STORAGE_KEY, "1");
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(LEGACY_ADVISORY_STORAGE_KEY);
}

function clearStoredState() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(LEGACY_STORAGE_KEY);
  localStorage.removeItem(LEGACY_ADVISORY_STORAGE_KEY);
}

async function getOrCreateSubscription(registration, publicKey) {
  const desiredApplicationServerKey = base64UrlToUint8Array(publicKey);
  const current = await registration.pushManager.getSubscription();
  if (current) {
    const currentKey = current.options?.applicationServerKey;
    if (!currentKey || areByteArraysEqual(currentKey, desiredApplicationServerKey)) return current;
    await current.unsubscribe().catch(() => false);
  }

  return registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: desiredApplicationServerKey
  });
}

async function postSubscription(subscription) {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ subscription: subscription.toJSON() })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `subscribe failed: ${response.status}`);
  }
  return response.json();
}

function buildConfigurationMessage(config = {}) {
  if (config?.setup?.d1 === false) return "通知保存用のD1が未設定です。";
  if (config?.setup?.vapid === false) return "通知サーバーの鍵を準備できませんでした。";
  return "通知サーバーの設定が未完了です。";
}

function buildSubscribeErrorMessage(error) {
  const message = String(error?.message || "");
  if (message.includes("VAPID") || message.includes("通知サーバー")) return message;
  if (message.includes("permission") || message.includes("denied")) return "通知の利用が許可されていません。";
  if (message.includes("subscription") || message.includes("subscribe")) return "ブラウザの通知購読を作成できませんでした。";
  return "通知設定に失敗しました。";
}

function areByteArraysEqual(a, b) {
  const left = a instanceof Uint8Array ? a : new Uint8Array(a);
  const right = b instanceof Uint8Array ? b : new Uint8Array(b);
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

function base64UrlToUint8Array(value) {
  const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}
