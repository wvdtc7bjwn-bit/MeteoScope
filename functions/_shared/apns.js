const TOKEN_TTL_SECONDS = 50 * 60;
let cachedProviderToken = null;

export function isAPNSConfigured(env) {
  return Boolean(
    env.NOTIFICATIONS_DB
    && env.APNS_KEY_ID
    && env.APNS_TEAM_ID
    && env.APNS_PRIVATE_KEY
    && env.APNS_BUNDLE_ID
  );
}

export function normalizeIOSSubscription(payload) {
  const deviceToken = String(payload?.deviceToken || "").trim().toLowerCase();
  if (!/^[a-f0-9]{32,200}$/u.test(deviceToken) || deviceToken.length % 2 !== 0) return null;
  const environment = payload?.environment === "production" ? "production" : "sandbox";
  const areaCode = String(payload?.area?.areaCode || "").trim();
  if (!areaCode) return null;
  return {
    deviceToken,
    environment,
    areaCode,
    areaName: String(payload?.area?.areaName || ""),
    prefecture: String(payload?.area?.prefecture || ""),
    preferences: {
      notifyAdvisory: Boolean(payload?.preferences?.notifyAdvisory),
      adminBroadcast: payload?.preferences?.adminBroadcast !== false
    },
    warningState: payload?.warningState && typeof payload.warningState === "object"
      ? payload.warningState
      : null,
    createdAt: String(payload?.createdAt || new Date().toISOString()),
    updatedAt: new Date().toISOString()
  };
}

export async function listIOSSubscriptions(env) {
  const result = await env.NOTIFICATIONS_DB.prepare(
    "SELECT id, data FROM ios_push_subscriptions ORDER BY updated_at DESC"
  ).all();
  return (result.results || []).flatMap((row) => {
    try {
      const value = JSON.parse(row.data);
      return value?.deviceToken ? [{ ...value, id: row.id }] : [];
    } catch {
      return [];
    }
  });
}

export async function saveIOSSubscription(env, subscription) {
  const id = subscription.id || await iosSubscriptionID(subscription.deviceToken);
  const existingRow = await env.NOTIFICATIONS_DB.prepare(
    "SELECT data FROM ios_push_subscriptions WHERE id = ?"
  ).bind(id).first();
  let existing = null;
  try { existing = existingRow?.data ? JSON.parse(existingRow.data) : null; } catch { existing = null; }
  const record = {
    ...existing,
    ...subscription,
    id,
    warningState: subscription.warningState ?? existing?.warningState ?? null,
    createdAt: existing?.createdAt || subscription.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  await env.NOTIFICATIONS_DB.prepare(
    `INSERT INTO ios_push_subscriptions (id, data, environment, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       data = excluded.data,
       environment = excluded.environment,
       updated_at = excluded.updated_at`
  ).bind(id, JSON.stringify(record), record.environment, record.updatedAt).run();
  return record;
}

export async function deleteIOSSubscription(env, deviceTokenOrID) {
  const value = String(deviceTokenOrID || "");
  if (!value) return;
  const looksLikeToken = /^[a-f0-9]{32,200}$/u.test(value) && value.length % 2 === 0;
  const id = looksLikeToken ? await iosSubscriptionID(value) : value;
  await env.NOTIFICATIONS_DB.prepare(
    "DELETE FROM ios_push_subscriptions WHERE id = ?"
  ).bind(id).run();
}

export async function sendAPNSNotification(env, subscription, message) {
  if (!isAPNSConfigured(env)) {
    return { ok: false, status: 503, reason: "APNsNotConfigured" };
  }
  const providerToken = await getProviderToken(env);
  const host = subscription.environment === "production"
    ? "api.push.apple.com"
    : "api.sandbox.push.apple.com";
  const response = await fetch(`https://${host}/3/device/${subscription.deviceToken}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${providerToken}`,
      "content-type": "application/json",
      "apns-topic": env.APNS_BUNDLE_ID,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(Date.now() / 1000) + 60 * 60),
      "apns-collapse-id": String(message?.tag || "meteoscope-warning").slice(0, 64)
    },
    body: JSON.stringify({
      aps: {
        alert: {
          title: String(message?.title || "MeteoScope"),
          body: String(message?.body || "気象情報が更新されました。")
        },
        sound: "default",
        "thread-id": "weather-warning"
      },
      url: String(message?.url || "/?tab=warnings"),
      areaCode: String(message?.areaCode || subscription.areaCode || ""),
      messageID: String(message?.id || crypto.randomUUID())
    })
  });
  let reason = response.statusText || "APNsRequestFailed";
  try {
    reason = (await response.json())?.reason || reason;
  } catch {
    // Successful APNs responses have no body.
  }
  return {
    ok: response.ok,
    status: response.status,
    reason,
    apnsID: response.headers.get("apns-id") || ""
  };
}

export function shouldRemoveIOSSubscription(result) {
  return result?.status === 410
    || (result?.status === 400 && ["BadDeviceToken", "DeviceTokenNotForTopic"].includes(result.reason));
}

async function getProviderToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const configurationID = `${env.APNS_KEY_ID}:${env.APNS_TEAM_ID}`;
  if (
    cachedProviderToken?.configurationID === configurationID
    && now - cachedProviderToken.issuedAt < TOKEN_TTL_SECONDS
  ) {
    return cachedProviderToken.value;
  }

  const header = base64UrlEncode(JSON.stringify({ alg: "ES256", kid: env.APNS_KEY_ID }));
  const claims = base64UrlEncode(JSON.stringify({ iss: env.APNS_TEAM_ID, iat: now }));
  const signingInput = `${header}.${claims}`;
  const privateKey = await importAPNSPrivateKey(env.APNS_PRIVATE_KEY);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    new TextEncoder().encode(signingInput)
  );
  const value = `${signingInput}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
  cachedProviderToken = { configurationID, issuedAt: now, value };
  return value;
}

async function importAPNSPrivateKey(pem) {
  const base64 = String(pem || "")
    .replace(/\\n/gu, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/gu, "")
    .replace(/-----END PRIVATE KEY-----/gu, "")
    .replace(/\s+/gu, "");
  if (!base64) throw new Error("APNS_PRIVATE_KEY is empty");
  const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
  return crypto.subtle.importKey(
    "pkcs8",
    bytes,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"]
  );
}

async function iosSubscriptionID(deviceToken) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`apns:${deviceToken}`)
  );
  return base64UrlEncodeBytes(new Uint8Array(digest)).slice(0, 32);
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/gu, "");
}
