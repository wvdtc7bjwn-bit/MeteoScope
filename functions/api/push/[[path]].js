import {
  applyWarningKinds,
  getWarningPhenomenon,
  severityValue
} from "../../../src/jma/warningCore.js";
import { JMA_WARNING_OFFICE_CODES } from "../../../src/jma/warningOfficeCodes.js";

const SUBSCRIPTION_INDEX_KEY = "push:warning-subscriptions:index";
const SUBSCRIPTION_KEY_PREFIX = "push:warning-subscription:";
const PENDING_KEY_PREFIX = "push:pending:";
const VAPID_KEYS_KEY = "push:vapid-keys";
const JMA_WARNING_BASE = "https://www.jma.go.jp/bosai/warning/data/r8";
const PUSH_TTL_SECONDS = 60;
const MAX_PENDING_MESSAGES = 6;

export async function onRequest({ request, env }) {
  try {
    const url = new URL(request.url);
    const route = url.pathname.replace(/^\/api\/push\/?/, "");
    const method = request.method.toUpperCase();

    if ((route === "" || route === "config") && method === "GET") return await getPushConfig(env);
    if (route === "subscribe" && method === "POST") return subscribe(request, env);
    if (route === "unsubscribe" && method === "POST") return unsubscribe(request, env);
    if (route === "pending" && method === "POST") return pending(request, env);
    if (route === "check" && (method === "GET" || method === "POST")) return check(request, env);

    return json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[Push API]", error);
    return json({ error: "通知APIでエラーが発生しました。" }, { status: 500 });
  }
}

export async function runWarningPushCheck(env) {
  const kv = requireKv(env);
  const ids = await readJson(kv, SUBSCRIPTION_INDEX_KEY, []);
  const uniqueIds = [...new Set(Array.isArray(ids) ? ids.map(String).filter(Boolean) : [])];
  if (!uniqueIds.length) return { checked: 0, notified: 0, removed: 0 };

  const warningAreas = await fetchActiveWarningAreas();
  let notified = 0;
  let removed = 0;

  for (const id of uniqueIds) {
    const key = subscriptionKey(id);
    const subscription = await readJson(kv, key, null);
    if (!subscription?.endpoint || !subscription?.pushSubscription?.endpoint) {
      await kv.delete(key);
      removed += 1;
      continue;
    }

    const currentArea = warningAreas.get(String(subscription.areaCode));
    const currentWarnings = currentArea?.warnings ?? [];
    const result = buildNotificationMessage(subscription, currentArea, currentWarnings);
    const nextSubscription = {
      ...subscription,
      areaName: currentArea?.areaName ?? subscription.areaName,
      prefecture: currentArea?.prefecture ?? subscription.prefecture,
      warningState: buildWarningState(currentWarnings),
      checkedAt: new Date().toISOString()
    };

    if (result) {
      await enqueuePendingMessage(kv, id, result);
      const pushResult = await sendEmptyPush(subscription.pushSubscription, env);
      if (pushResult.ok) {
        notified += 1;
        nextSubscription.lastNotifiedAt = new Date().toISOString();
      } else if (pushResult.status === 404 || pushResult.status === 410) {
        await kv.delete(key);
        await kv.delete(pendingKey(id));
        await removeSubscriptionId(kv, id);
        removed += 1;
        continue;
      } else {
        console.warn("[Push API] web push failed", pushResult.status, pushResult.statusText);
      }
    }

    await kv.put(key, JSON.stringify(nextSubscription));
  }

  return { checked: uniqueIds.length, notified, removed };
}

async function getPushConfig(env) {
  const vapidKeys = await getVapidKeys(env, { create: true });
  const enabled = Boolean(env.ADMIN_KV && vapidKeys?.publicKey && vapidKeys?.privateKey);
  return json({
    enabled,
    publicKey: enabled ? vapidKeys.publicKey : "",
    minCronIntervalSeconds: 60,
    setup: {
      kv: Boolean(env.ADMIN_KV),
      vapid: Boolean(vapidKeys?.publicKey && vapidKeys?.privateKey),
      source: vapidKeys?.source || "missing"
    }
  });
}

async function subscribe(request, env) {
  const kv = requireKv(env);
  const vapidKeys = await getVapidKeys(env, { create: true });
  if (!vapidKeys?.publicKey || !vapidKeys?.privateKey) {
    return json({ error: "通知サーバーのVAPIDキーを準備できませんでした。" }, { status: 503 });
  }

  const payload = await request.json().catch(() => ({}));
  const pushSubscription = normalizePushSubscription(payload.subscription);
  const area = normalizeArea(payload.area);
  const preferences = normalizePreferences(payload.preferences);
  if (!pushSubscription || !area.areaCode) {
    return json({ error: "通知設定に必要な現在地情報が不足しています。" }, { status: 400 });
  }

  const id = await subscriptionId(pushSubscription.endpoint);
  const record = {
    id,
    endpoint: pushSubscription.endpoint,
    pushSubscription,
    areaCode: area.areaCode,
    areaName: area.areaName,
    prefecture: area.prefecture,
    preferences,
    warningState: payload.warningState && typeof payload.warningState === "object" ? payload.warningState : null,
    createdAt: payload.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await kv.put(subscriptionKey(id), JSON.stringify(record));
  await addSubscriptionId(kv, id);
  return json({ subscribed: true, id, area });
}

async function unsubscribe(request, env) {
  const kv = requireKv(env);
  const payload = await request.json().catch(() => ({}));
  const endpoint = String(payload.endpoint || "");
  if (!endpoint) return json({ subscribed: false });

  const id = await subscriptionId(endpoint);
  await kv.delete(subscriptionKey(id));
  await kv.delete(pendingKey(id));
  await removeSubscriptionId(kv, id);
  return json({ subscribed: false });
}

async function pending(request, env) {
  const kv = requireKv(env);
  const payload = await request.json().catch(() => ({}));
  const endpoint = String(payload.endpoint || "");
  if (!endpoint) return json({ messages: [] });

  const id = await subscriptionId(endpoint);
  const key = pendingKey(id);
  const messages = await readJson(kv, key, []);
  await kv.delete(key);
  return json({ messages: Array.isArray(messages) ? messages : [] });
}

async function check(request, env) {
  if (env.PUSH_CHECK_TOKEN) {
    const url = new URL(request.url);
    const token = request.headers.get("X-Push-Check-Token") || url.searchParams.get("token");
    if (token !== env.PUSH_CHECK_TOKEN) {
      return json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const result = await runWarningPushCheck(env);
  return json({ ok: true, ...result, checkedAt: new Date().toISOString() });
}

async function fetchActiveWarningAreas() {
  const reports = await fetchWarningReports();
  const areasByCode = new Map();
  reports
    .sort((a, b) => new Date(a.reportDatetime).getTime() - new Date(b.reportDatetime).getTime())
    .forEach((report) => {
      getMunicipalityAreas(report).forEach((area) => {
        const areaCode = String(area.code ?? area.areaCode ?? "");
        if (!areaCode) return;
        const current = areasByCode.get(areaCode) ?? {
          areaCode,
          areaName: area.name ?? "",
          prefecture: "",
          warnings: [],
          updatedAt: report.reportDatetime
        };
        current.warnings = applyWarningKinds(current.warnings, area.warnings ?? area.kinds, report.reportDatetime);
        current.updatedAt = chooseLatestTime(current.updatedAt, report.reportDatetime);
        if (current.warnings.length) {
          areasByCode.set(areaCode, current);
        } else {
          areasByCode.delete(areaCode);
        }
      });
    });
  return areasByCode;
}

async function fetchWarningReports() {
  const reportsByOffice = await Promise.all(
    JMA_WARNING_OFFICE_CODES.map(async (officeCode) => {
      try {
        const response = await fetch(`${JMA_WARNING_BASE}/${officeCode}.json`, {
          headers: { "Accept": "application/json,text/plain,*/*" },
          cf: { cacheTtl: 30, cacheEverything: true }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const reports = await response.json();
        return Array.isArray(reports) ? reports : [];
      } catch (error) {
        console.warn(`[Push API] warning JSON unavailable: ${officeCode}`, error);
        return [];
      }
    })
  );
  return reportsByOffice.flat();
}

function getMunicipalityAreas(report) {
  if (Array.isArray(report.items)) {
    return report.items.map((item) => ({
      code: item.code,
      name: item.name,
      warnings: item.warnings ?? []
    }));
  }

  if (Array.isArray(report.warning?.class20Items)) {
    return report.warning.class20Items.map((item) => ({
      code: item.areaCode,
      warnings: item.kinds ?? []
    }));
  }

  return report.areaTypes?.[1]?.areas ?? [];
}

function buildNotificationMessage(subscription, currentArea, currentWarnings) {
  const notifyAdvisory = Boolean(subscription.preferences?.notifyAdvisory);
  const previousWarnings = Array.isArray(subscription.warningState?.warnings)
    ? subscription.warningState.warnings
    : [];
  const currentByPhenomenon = mapByPhenomenon(currentWarnings);
  const previousByPhenomenon = mapByPhenomenon(previousWarnings);
  const eventLines = [];
  const eventPhenomena = new Set();

  currentByPhenomenon.forEach((current, phenomenon) => {
    const previous = previousByPhenomenon.get(phenomenon);
    const currentSeverity = severityValue(current.level);
    const previousSeverity = severityValue(previous?.level);

    if (
      currentSeverity >= severityValue("warning") &&
      (!previous || current.code !== previous.code || currentSeverity > previousSeverity)
    ) {
      eventLines.push(`［発表］${current.label}`);
      eventPhenomena.add(phenomenon);
      return;
    }

    if (
      notifyAdvisory &&
      currentSeverity === severityValue("advisory") &&
      (!previous || current.code !== previous.code)
    ) {
      eventLines.push(`［発表］${current.label}`);
      eventPhenomena.add(phenomenon);
      return;
    }

    if (
      previous &&
      previousSeverity >= severityValue("warning") &&
      currentSeverity >= severityValue("advisory") &&
      currentSeverity < previousSeverity
    ) {
      eventLines.push(`［切替］${current.label}に切り替え`);
      eventPhenomena.add(phenomenon);
    }
  });

  previousByPhenomenon.forEach((previous, phenomenon) => {
    if (currentByPhenomenon.has(phenomenon) || eventPhenomena.has(phenomenon)) return;
    if (severityValue(previous.level) >= severityValue("warning")) {
      eventLines.push(`［解除］${previous.label}`);
      eventPhenomena.add(phenomenon);
    }
  });

  if (!eventLines.length) return null;

  currentByPhenomenon.forEach((current, phenomenon) => {
    if (eventPhenomena.has(phenomenon)) return;
    if (severityValue(current.level) >= severityValue("warning")) {
      eventLines.push(`［継続］${current.label}`);
    }
  });

  const areaName = currentArea?.areaName || subscription.areaName || "現在地";
  return {
    id: crypto.randomUUID(),
    title: `${areaName}の警報情報`,
    body: eventLines.slice(0, 5).join("\n"),
    tag: `warning-${subscription.areaCode}`,
    url: "/?tab=warnings",
    areaCode: subscription.areaCode,
    areaName,
    createdAt: new Date().toISOString()
  };
}

function buildWarningState(warnings) {
  return {
    warnings: warnings.map((warning) => ({
      code: warning.code,
      rawLabel: warning.rawLabel,
      label: warning.label,
      level: warning.level,
      levelNumber: warning.levelNumber
    })),
    updatedAt: new Date().toISOString()
  };
}

function mapByPhenomenon(warnings) {
  const result = new Map();
  warnings.forEach((warning) => {
    const phenomenon = getWarningPhenomenon(warning);
    if (!phenomenon) return;
    const previous = result.get(phenomenon);
    if (!previous || severityValue(warning.level) > severityValue(previous.level)) {
      result.set(phenomenon, warning);
    }
  });
  return result;
}

async function enqueuePendingMessage(kv, id, message) {
  const key = pendingKey(id);
  const current = await readJson(kv, key, []);
  const next = [message, ...(Array.isArray(current) ? current : [])].slice(0, MAX_PENDING_MESSAGES);
  await kv.put(key, JSON.stringify(next), { expirationTtl: 60 * 60 * 24 * 3 });
}

async function sendEmptyPush(pushSubscription, env) {
  const endpoint = pushSubscription?.endpoint;
  const vapidKeys = await getVapidKeys(env, { create: true });
  if (!endpoint || !vapidKeys?.publicKey || !vapidKeys?.privateKey) {
    return { ok: false, status: 0, statusText: "missing push configuration" };
  }

  const token = await createVapidJwt(new URL(endpoint).origin, env, vapidKeys);
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "TTL": String(PUSH_TTL_SECONDS),
      "Urgency": "high",
      "Authorization": `vapid t=${token}, k=${vapidKeys.publicKey}`
    }
  });
}

async function createVapidJwt(audience, env, vapidKeys) {
  const header = base64UrlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64UrlEncode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || "mailto:admin@meteoscope.local"
  }));
  const unsignedToken = `${header}.${payload}`;
  const key = await importVapidPrivateKey(vapidKeys.publicKey, vapidKeys.privateKey);
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    new TextEncoder().encode(unsignedToken)
  );
  return `${unsignedToken}.${base64UrlEncodeBytes(new Uint8Array(signature))}`;
}

async function getVapidKeys(env, options = {}) {
  const envPublicKey = String(env.VAPID_PUBLIC_KEY || "").trim();
  const envPrivateKey = String(env.VAPID_PRIVATE_KEY || "").trim();
  if (envPublicKey && envPrivateKey) {
    return { publicKey: envPublicKey, privateKey: envPrivateKey, source: "env" };
  }

  if (!env.ADMIN_KV) return null;

  const stored = await readJson(env.ADMIN_KV, VAPID_KEYS_KEY, null);
  if (stored?.publicKey && stored?.privateKey) {
    return {
      publicKey: String(stored.publicKey),
      privateKey: String(stored.privateKey),
      source: "kv"
    };
  }

  if (!options.create) return null;

  const generated = await generateVapidKeys();
  const record = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    createdAt: new Date().toISOString()
  };
  await env.ADMIN_KV.put(VAPID_KEYS_KEY, JSON.stringify(record));
  return { ...record, source: "kv" };
}

async function generateVapidKeys() {
  const keyPair = await crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicBytes = new Uint8Array(await crypto.subtle.exportKey("raw", keyPair.publicKey));
  const privateJwk = await crypto.subtle.exportKey("jwk", keyPair.privateKey);
  if (!privateJwk.d) throw new Error("Generated VAPID private key is invalid");
  return {
    publicKey: base64UrlEncodeBytes(publicBytes),
    privateKey: String(privateJwk.d)
  };
}

async function importVapidPrivateKey(publicKey, privateKey) {
  const publicBytes = base64UrlToBytes(publicKey);
  const privateBytes = base64UrlToBytes(privateKey);
  if (publicBytes.length !== 65 || publicBytes[0] !== 4 || privateBytes.length !== 32) {
    throw new Error("Invalid VAPID key format");
  }
  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: base64UrlEncodeBytes(publicBytes.slice(1, 33)),
    y: base64UrlEncodeBytes(publicBytes.slice(33, 65)),
    d: base64UrlEncodeBytes(privateBytes),
    ext: false
  };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

function normalizePushSubscription(subscription) {
  if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return null;
  return {
    endpoint: String(subscription.endpoint),
    expirationTime: subscription.expirationTime ?? null,
    keys: {
      p256dh: String(subscription.keys.p256dh),
      auth: String(subscription.keys.auth)
    }
  };
}

function normalizeArea(area) {
  return {
    areaCode: String(area?.areaCode || ""),
    areaName: String(area?.areaName || ""),
    prefecture: String(area?.prefecture || "")
  };
}

function normalizePreferences(preferences) {
  return {
    notifyAdvisory: Boolean(preferences?.notifyAdvisory)
  };
}

async function addSubscriptionId(kv, id) {
  const ids = await readJson(kv, SUBSCRIPTION_INDEX_KEY, []);
  const next = [...new Set([...(Array.isArray(ids) ? ids : []), id])];
  await kv.put(SUBSCRIPTION_INDEX_KEY, JSON.stringify(next));
}

async function removeSubscriptionId(kv, id) {
  const ids = await readJson(kv, SUBSCRIPTION_INDEX_KEY, []);
  const next = (Array.isArray(ids) ? ids : []).filter((item) => String(item) !== String(id));
  await kv.put(SUBSCRIPTION_INDEX_KEY, JSON.stringify(next));
}

async function subscriptionId(endpoint) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return base64UrlEncodeBytes(new Uint8Array(digest)).slice(0, 32);
}

function subscriptionKey(id) {
  return `${SUBSCRIPTION_KEY_PREFIX}${id}`;
}

function pendingKey(id) {
  return `${PENDING_KEY_PREFIX}${id}`;
}

function chooseLatestTime(current, next) {
  if (!current) return next ?? "";
  if (!next) return current;
  return new Date(next).getTime() > new Date(current).getTime() ? next : current;
}

async function readJson(kv, key, fallback) {
  if (!kv) return fallback;
  const value = await kv.get(key);
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function requireKv(env) {
  if (!env.ADMIN_KV) {
    throw json({ error: "ADMIN_KV が未設定です。" }, { status: 503 });
  }
  return env.ADMIN_KV;
}

function base64UrlToBytes(value) {
  const base64 = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function base64UrlEncode(value) {
  return base64UrlEncodeBytes(new TextEncoder().encode(value));
}

function base64UrlEncodeBytes(bytes) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function json(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(init.headers || {})
    }
  });
}
