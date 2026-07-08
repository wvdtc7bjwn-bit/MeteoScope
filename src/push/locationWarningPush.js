const STORAGE_KEY = "meteoscope.locationWarningPush.enabled";
const ADVISORY_STORAGE_KEY = "meteoscope.locationWarningPush.notifyAdvisory";

export function createLocationWarningPush(options = {}) {
  let state = {
    supported: isSupported(),
    configured: null,
    enabled: localStorage.getItem(STORAGE_KEY) === "1",
    notifyAdvisory: localStorage.getItem(ADVISORY_STORAGE_KEY) === "1",
    subscribed: false,
    busy: false,
    permission: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
    areaCode: "",
    areaName: "",
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
      updateState({
        configured,
        subscribed: Boolean(subscription),
        permission: Notification.permission,
        message: configured ? "" : buildConfigurationMessage(config)
      });
      return state;
    } catch (error) {
      console.warn("[MeteoScope] push notification init failed", error);
      updateState({ configured: false, message: "通知機能を初期化できませんでした。" });
      return state;
    }
  }

  async function enable(currentLocation) {
    if (!isLocationReady(currentLocation)) {
      updateState({ message: "現在地を取得してから通知を有効にしてください。" });
      return state;
    }
    if (!state.supported) return initialize();

    updateState({ busy: true, message: "通知を設定しています..." });
    try {
      const config = await loadConfig({ force: true });
      if (!config.enabled || !config.publicKey) {
        localStorage.removeItem(STORAGE_KEY);
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
        localStorage.removeItem(STORAGE_KEY);
        updateState({ busy: false, enabled: false, subscribed: false, permission, message: "通知の利用が許可されていません。" });
        return state;
      }

      await navigator.serviceWorker.register("/sw.js");
      const readyRegistration = await navigator.serviceWorker.ready;
      const subscription = await getOrCreateSubscription(readyRegistration, config.publicKey);
      await postSubscription(subscription, currentLocation);
      localStorage.setItem(STORAGE_KEY, "1");
      updateState({
        busy: false,
        enabled: true,
        subscribed: true,
        permission,
        configured: true,
        areaCode: currentLocation.areaCode,
        areaName: currentLocation.areaName,
        message: `${currentLocation.areaName}の警報通知を有効にしました。`
      });
      return state;
    } catch (error) {
      console.warn("[MeteoScope] push notification subscribe failed", error);
      localStorage.removeItem(STORAGE_KEY);
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
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint })
        }).catch(() => null);
        await subscription.unsubscribe().catch(() => false);
      }
      localStorage.removeItem(STORAGE_KEY);
      updateState({ busy: false, enabled: false, subscribed: false, areaCode: "", areaName: "", message: "通知を解除しました。" });
      return state;
    } catch (error) {
      console.warn("[MeteoScope] push notification unsubscribe failed", error);
      localStorage.removeItem(STORAGE_KEY);
      updateState({ busy: false, enabled: false, subscribed: false, message: "通知解除を完了できませんでした。" });
      return state;
    }
  }

  async function sync(currentLocation) {
    if (!state.enabled || !isLocationReady(currentLocation) || !state.supported) return state;
    try {
      const config = await loadConfig();
      if (!config.enabled || !config.publicKey || Notification.permission !== "granted") return state;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return state;
      await postSubscription(subscription, currentLocation);
      updateState({
        subscribed: true,
        permission: Notification.permission,
        areaCode: currentLocation.areaCode,
        areaName: currentLocation.areaName,
        message: `${currentLocation.areaName}の警報通知を監視中です。`
      });
    } catch (error) {
      console.warn("[MeteoScope] push notification sync failed", error);
      updateState({ message: "通知対象の更新に失敗しました。" });
    }
    return state;
  }

  async function setNotifyAdvisory(value, currentLocation) {
    const notifyAdvisory = Boolean(value);
    if (notifyAdvisory) localStorage.setItem(ADVISORY_STORAGE_KEY, "1");
    else localStorage.removeItem(ADVISORY_STORAGE_KEY);
    updateState({ notifyAdvisory });
    if (state.enabled && isLocationReady(currentLocation)) {
      await sync(currentLocation);
    }
    return state;
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

  return {
    initialize,
    enable,
    disable,
    sync,
    setNotifyAdvisory,
    getState
  };
}

function isSupported() {
  return typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window &&
    window.isSecureContext;
}

function isLocationReady(currentLocation) {
  return currentLocation?.status === "found" && currentLocation?.areaCode;
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

async function postSubscription(subscription, currentLocation) {
  const response = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      subscription: subscription.toJSON(),
      area: {
        areaCode: currentLocation.areaCode,
        areaName: currentLocation.areaName,
        prefecture: currentLocation.prefecture
      },
      warningState: buildWarningState(currentLocation.warnings),
      preferences: {
        notifyAdvisory: state.notifyAdvisory
      }
    })
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `subscribe failed: ${response.status}`);
  }
  return response.json();
}

function buildWarningState(warnings = []) {
  return {
    warnings: (Array.isArray(warnings) ? warnings : []).map((warning) => ({
      code: warning.code,
      rawLabel: warning.rawLabel,
      label: warning.label,
      level: warning.level,
      levelNumber: warning.levelNumber
    }))
  };
}

function buildConfigurationMessage(config = {}) {
  if (config?.setup?.kv === false) return "通知保存用のKVが未設定です。";
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
