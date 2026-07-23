import { readJson, writeJson } from "../../_shared/d1Store.js";
import { cleanupExpiredCommunityReports } from "../../_shared/communityReports.js";

const VAPID_KEYS_KEY = "push:vapid-keys";
const PUSH_TTL_SECONDS = 60;
const PUSH_REQUEST_TIMEOUT_MS = 8000;
const MAX_PENDING_MESSAGES = 6;
const ADMIN_BROADCAST_BATCH_SIZE = 4;
const ADMIN_BROADCAST_IMMEDIATE_BATCHES = 5;
const ADMIN_BROADCAST_MAX_ATTEMPTS = 3;
const RETENTION_DAYS = 30;
const RETENTION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETENTION_CLEANUP_KEY = "retention:last-cleanup";
const DAILY_MAINTENANCE_UTC_HOUR = 15;
const DAILY_MAINTENANCE_UTC_MINUTE = 10;
const WEB_REQUEST_MAX_BYTES = 8192;
let adminBroadcastTablesReady = false;

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

export async function runPushMaintenance(env, options = {}) {
  requireNotificationStorage(env);
  const now = validCronDate(options.now);
  const fiveMinuteMaintenance = options.forceMaintenance === true || now.getUTCMinutes() % 5 === 0;
  const dailyMaintenance = options.forceMaintenance === true
    || (
      now.getUTCHours() === DAILY_MAINTENANCE_UTC_HOUR
      && now.getUTCMinutes() === DAILY_MAINTENANCE_UTC_MINUTE
    );

  let communityReports = { ran: false, deleted: 0, skipped: true };
  if (fiveMinuteMaintenance) {
    try {
      communityReports = await cleanupExpiredCommunityReports(env.NOTIFICATIONS_DB, now);
    } catch (error) {
      console.error("[Push API] community report cleanup failed", error);
      communityReports = { ran: false, deleted: 0, error: true };
    }
  }

  let webSubscriptionMigration = { migrated: 0, skipped: true };
  let retention = { ran: false, skipped: true };
  if (dailyMaintenance) {
    try {
      webSubscriptionMigration = await migrateWebSubscriptionsToAdminOnly(env, now);
    } catch (error) {
      console.error("[Push API] web subscription migration failed", error);
      webSubscriptionMigration = { migrated: 0, error: true };
    }
    try {
      retention = await runNotificationRetentionCleanup(env, now);
    } catch (error) {
      console.error("[Push API] retention cleanup failed", error);
      retention = { ran: false, error: true };
    }
  }
  let adminBroadcast = { processed: 0, sent: 0, removed: 0, failed: 0 };
  try {
    adminBroadcast = await runAdminPushBroadcasts(env);
  } catch (error) {
    console.error("[Push API] admin broadcast processing failed", error);
    adminBroadcast = { processed: 0, sent: 0, removed: 0, failed: 0, error: true };
  }
  return { adminBroadcast, retention, communityReports, webSubscriptionMigration, storage: "d1" };
}

export async function queueAdminPushBroadcast(env, input) {
  requireNotificationStorage(env);
  await ensureAdminBroadcastTables(env);
  const broadcast = normalizeAdminBroadcast(input);
  const subscriptions = (await listSubscriptions(env))
    .filter((subscription) => (
      subscription?.id
      && subscription?.pushSubscription?.endpoint
      && subscription?.preferences?.adminBroadcast !== false
    ));
  const now = new Date().toISOString();
  const status = subscriptions.length ? "queued" : "completed";

  await env.NOTIFICATIONS_DB.prepare(
    `INSERT INTO admin_push_broadcasts
      (id, title, body, url, status, total_count, sent_count, removed_count, failed_count, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, ?, ?)`
  ).bind(
    broadcast.id,
    broadcast.title,
    broadcast.body,
    broadcast.url,
    status,
    subscriptions.length,
    now,
    status === "completed" ? now : null
  ).run();

  for (let index = 0; index < subscriptions.length; index += 50) {
    const statements = subscriptions.slice(index, index + 50).map((subscription) =>
      env.NOTIFICATIONS_DB.prepare(
        `INSERT OR IGNORE INTO admin_push_deliveries
          (broadcast_id, subscription_id, status, attempts, enqueued, last_error, updated_at)
         VALUES (?, ?, 'pending', 0, 0, '', ?)`
      ).bind(broadcast.id, String(subscription.id || ""), now)
    );
    if (statements.length) await env.NOTIFICATIONS_DB.batch(statements);
  }

  await runNotificationRetentionCleanup(env);
  await drainNewAdminPushBroadcast(env, broadcast.id);
  return getAdminPushBroadcast(env, broadcast.id);
}

export async function listAdminPushBroadcasts(env, limit = 20) {
  requireNotificationStorage(env);
  await ensureAdminBroadcastTables(env);
  const safeLimit = Math.min(50, Math.max(1, Number(limit) || 20));
  const result = await env.NOTIFICATIONS_DB.prepare(
    `SELECT id, title, body, url, status, total_count, sent_count, removed_count,
            failed_count, created_at, completed_at
     FROM admin_push_broadcasts ORDER BY created_at DESC LIMIT ?`
  ).bind(safeLimit).all();
  return (result.results || []).map(publicAdminBroadcast);
}

export async function deleteAdminPushBroadcast(env, broadcastID) {
  requireNotificationStorage(env);
  await ensureAdminBroadcastTables(env);
  const id = String(broadcastID || "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(id)) {
    throw new TypeError("Invalid broadcast ID.");
  }
  const broadcast = await env.NOTIFICATIONS_DB.prepare(
    "SELECT id, status FROM admin_push_broadcasts WHERE id = ?1"
  ).bind(id).first();
  if (!broadcast) return null;
  if (broadcast.status !== "completed") {
    return { deleted: false, reason: "in-progress" };
  }
  const results = await env.NOTIFICATIONS_DB.batch([
    env.NOTIFICATIONS_DB.prepare(
      "DELETE FROM push_pending_messages WHERE json_extract(data, '$.id') = ?1"
    ).bind(`admin-${id}`),
    env.NOTIFICATIONS_DB.prepare(
      "DELETE FROM admin_push_deliveries WHERE broadcast_id = ?1"
    ).bind(id),
    env.NOTIFICATIONS_DB.prepare(
      "DELETE FROM admin_push_broadcasts WHERE id = ?1 AND status = 'completed'"
    ).bind(id)
  ]);
  return {
    deleted: getD1Changes(results[2]) > 0,
    pendingMessages: getD1Changes(results[0]),
    deliveries: getD1Changes(results[1])
  };
}

export async function runAdminPushBroadcasts(env, options = {}) {
  requireNotificationStorage(env);
  await ensureAdminBroadcastTables(env);
  const broadcastID = String(options.broadcastID || "").trim();
  const broadcastSelect = `SELECT id, title, body, url, status, total_count, sent_count, removed_count,
                                  failed_count, created_at, completed_at
                           FROM admin_push_broadcasts`;
  const broadcast = broadcastID
    ? await env.NOTIFICATIONS_DB.prepare(
      `${broadcastSelect} WHERE id = ? AND status IN ('queued', 'sending')`
    ).bind(broadcastID).first()
    : await env.NOTIFICATIONS_DB.prepare(
      `${broadcastSelect} WHERE status IN ('queued', 'sending') ORDER BY created_at ASC LIMIT 1`
    ).first();
  if (!broadcast?.id) return { processed: 0, sent: 0, removed: 0, failed: 0 };

  const now = new Date().toISOString();
  await env.NOTIFICATIONS_DB.prepare(
    "UPDATE admin_push_broadcasts SET status = 'sending' WHERE id = ?"
  ).bind(broadcast.id).run();

  const unattemptedFilter = options.onlyUnattempted ? "AND d.attempts = 0" : "";
  const deliveryResult = await env.NOTIFICATIONS_DB.prepare(
    `SELECT d.subscription_id, d.attempts, d.enqueued, s.data
     FROM admin_push_deliveries d
     LEFT JOIN push_subscriptions s ON s.id = d.subscription_id
     WHERE d.broadcast_id = ? AND d.status = 'pending'
       ${unattemptedFilter}
     ORDER BY d.updated_at ASC LIMIT ?`
  ).bind(broadcast.id, ADMIN_BROADCAST_BATCH_SIZE).all();
  const deliveries = deliveryResult.results || [];
  const vapidKeys = deliveries.length ? await getVapidKeys(env, { create: true }) : null;
  let sent = 0;
  let removed = 0;
  let failed = 0;

  for (const delivery of deliveries) {
    const subscription = parseJson(delivery.data, null);
    const subscriptionId = String(delivery.subscription_id || "");
    if (!subscription?.pushSubscription?.endpoint) {
      await markAdminDelivery(env, broadcast.id, subscriptionId, "removed", delivery.attempts, "購読情報がありません。", now);
      removed += 1;
      continue;
    }

    const message = buildAdminBroadcastMessage(broadcast);
    if (!Number(delivery.enqueued)) {
      await enqueueAdminBroadcastMessage(env, broadcast.id, subscriptionId, message, now);
    }
    const pushResult = await sendEmptyPushSafely(subscription.pushSubscription, env, vapidKeys);
    if (pushResult.ok) {
      await markAdminDelivery(env, broadcast.id, subscriptionId, "sent", Number(delivery.attempts) + 1, "", now);
      sent += 1;
      continue;
    }
    if (pushResult.status === 404 || pushResult.status === 410) {
      await deleteSubscription(env, subscriptionId);
      await markAdminDelivery(env, broadcast.id, subscriptionId, "removed", Number(delivery.attempts) + 1, pushResult.statusText, now);
      removed += 1;
      continue;
    }

    const attempts = Number(delivery.attempts) + 1;
    const nextStatus = attempts >= ADMIN_BROADCAST_MAX_ATTEMPTS ? "failed" : "pending";
    await markAdminDelivery(env, broadcast.id, subscriptionId, nextStatus, attempts, pushResult.statusText, now);
    if (nextStatus === "failed") {
      await deleteAdminPendingMessage(env, subscriptionId, message.id);
      failed += 1;
    }
  }

  const updated = await refreshAdminBroadcastCounts(env, broadcast.id);
  return {
    id: broadcast.id,
    processed: deliveries.length,
    sent,
    removed,
    failed,
    status: updated?.status || "queued"
  };
}

async function drainNewAdminPushBroadcast(env, broadcastID) {
  for (let batchIndex = 0; batchIndex < ADMIN_BROADCAST_IMMEDIATE_BATCHES; batchIndex += 1) {
    const result = await runAdminPushBroadcasts(env, {
      broadcastID,
      onlyUnattempted: true
    });
    if (!result.processed || result.status === "completed") return result;
  }
  return getAdminPushBroadcast(env, broadcastID);
}

async function getPushConfig(env) {
  const vapidKeys = await getVapidKeys(env, { create: true });
  const enabled = Boolean(env.NOTIFICATIONS_DB && vapidKeys?.publicKey && vapidKeys?.privateKey);
  return json({
    enabled,
    publicKey: enabled ? vapidKeys.publicKey : "",
    minCronIntervalSeconds: 60,
    setup: {
      d1: Boolean(env.NOTIFICATIONS_DB),
      vapid: Boolean(vapidKeys?.publicKey && vapidKeys?.privateKey),
      source: vapidKeys?.source || "missing"
    }
  });
}

async function subscribe(request, env) {
  requireNotificationStorage(env);
  const vapidKeys = await getVapidKeys(env, { create: true });
  if (!vapidKeys?.publicKey || !vapidKeys?.privateKey) {
    return json({ error: "通知サーバーのVAPIDキーを準備できませんでした。" }, { status: 503 });
  }

  const payload = await readLimitedJson(request, WEB_REQUEST_MAX_BYTES);
  const pushSubscription = normalizePushSubscription(payload.subscription);
  if (!pushSubscription) {
    return json({ error: "ブラウザの通知購読情報が不正です。" }, { status: 400 });
  }

  const id = await subscriptionId(pushSubscription.endpoint);
  const record = {
    id,
    endpoint: pushSubscription.endpoint,
    pushSubscription,
    deliveryMode: "admin_only",
    preferences: { adminBroadcast: true },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  await saveSubscription(env, record);
  return json({ subscribed: true, id, deliveryMode: record.deliveryMode });
}

async function unsubscribe(request, env) {
  requireNotificationStorage(env);
  const payload = await request.json().catch(() => ({}));
  const endpoint = String(payload.endpoint || "");
  if (!endpoint) return json({ subscribed: false });

  const id = await subscriptionId(endpoint);
  await deleteSubscription(env, id);
  return json({ subscribed: false });
}

async function readLimitedJson(request, maximumBytes) {
  const declaredLength = Number(request.headers.get("Content-Length") || 0);
  if (declaredLength > maximumBytes) {
    throw json({ error: "リクエストが大きすぎます。" }, { status: 413 });
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw json({ error: "リクエストが大きすぎます。" }, { status: 413 });
  }
  try {
    const payload = JSON.parse(text || "{}");
    if (!payload || Array.isArray(payload) || typeof payload !== "object") throw new Error("Invalid object");
    return payload;
  } catch {
    throw json({ error: "JSON形式が不正です。" }, { status: 400 });
  }
}

async function pending(request, env) {
  requireNotificationStorage(env);
  const payload = await request.json().catch(() => ({}));
  const endpoint = String(payload.endpoint || "");
  if (!endpoint) return json({ messages: [] });

  const id = await subscriptionId(endpoint);
  const messages = await takePendingMessages(env, id);
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

  const result = await runPushMaintenance(env);
  return json({ ok: true, ...result, checkedAt: new Date().toISOString() });
}

async function ensureAdminBroadcastTables(env) {
  if (adminBroadcastTablesReady) return;
  await env.NOTIFICATIONS_DB.batch([
    env.NOTIFICATIONS_DB.prepare(
      `CREATE TABLE IF NOT EXISTS admin_push_broadcasts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL,
        url TEXT NOT NULL,
        status TEXT NOT NULL,
        total_count INTEGER NOT NULL DEFAULT 0,
        sent_count INTEGER NOT NULL DEFAULT 0,
        removed_count INTEGER NOT NULL DEFAULT 0,
        failed_count INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        completed_at TEXT
      )`
    ),
    env.NOTIFICATIONS_DB.prepare(
      `CREATE TABLE IF NOT EXISTS admin_push_deliveries (
        broadcast_id TEXT NOT NULL,
        subscription_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        attempts INTEGER NOT NULL DEFAULT 0,
        enqueued INTEGER NOT NULL DEFAULT 0,
        last_error TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        PRIMARY KEY (broadcast_id, subscription_id)
      )`
    ),
    env.NOTIFICATIONS_DB.prepare(
      "CREATE INDEX IF NOT EXISTS idx_admin_push_delivery_status ON admin_push_deliveries (broadcast_id, status, updated_at)"
    )
  ]);
  adminBroadcastTablesReady = true;
}

function normalizeAdminBroadcast(input) {
  const title = String(input?.title || "").trim().slice(0, 80);
  const body = String(input?.body || "").trim().slice(0, 400);
  if (!title || !body) {
    throw json({ error: "通知タイトルと本文を入力してください。" }, { status: 400 });
  }
  return {
    id: crypto.randomUUID(),
    title,
    body,
    url: normalizeAdminBroadcastUrl(input?.url)
  };
}

function normalizeAdminBroadcastUrl(value) {
  const url = String(value || "/").trim();
  if (!url.startsWith("/") || url.startsWith("//")) return "/";
  return url.slice(0, 200);
}

function buildAdminBroadcastMessage(broadcast) {
  return {
    id: `admin-${broadcast.id}`,
    title: String(broadcast.title || "MeteoScope"),
    body: String(broadcast.body || ""),
    tag: `admin-${broadcast.id}`,
    url: normalizeAdminBroadcastUrl(broadcast.url),
    createdAt: broadcast.created_at || new Date().toISOString()
  };
}

async function enqueueAdminBroadcastMessage(env, broadcastId, subscriptionId, message, now) {
  await env.NOTIFICATIONS_DB.batch([
    env.NOTIFICATIONS_DB.prepare(
      "INSERT INTO push_pending_messages (subscription_id, data, created_at) VALUES (?, ?, ?)"
    ).bind(subscriptionId, JSON.stringify(message), now),
    env.NOTIFICATIONS_DB.prepare(
      `UPDATE admin_push_deliveries SET enqueued = 1, updated_at = ?
       WHERE broadcast_id = ? AND subscription_id = ?`
    ).bind(now, broadcastId, subscriptionId),
    env.NOTIFICATIONS_DB.prepare(
      `DELETE FROM push_pending_messages
       WHERE subscription_id = ? AND id NOT IN (
         SELECT id FROM push_pending_messages WHERE subscription_id = ? ORDER BY id DESC LIMIT ?
       )`
    ).bind(subscriptionId, subscriptionId, MAX_PENDING_MESSAGES)
  ]);
}

async function markAdminDelivery(env, broadcastId, subscriptionId, status, attempts, error, now) {
  await env.NOTIFICATIONS_DB.prepare(
    `UPDATE admin_push_deliveries
     SET status = ?, attempts = ?, last_error = ?, updated_at = ?
     WHERE broadcast_id = ? AND subscription_id = ?`
  ).bind(status, attempts, String(error || "").slice(0, 160), now, broadcastId, subscriptionId).run();
}

async function deleteAdminPendingMessage(env, subscriptionId, messageId) {
  await env.NOTIFICATIONS_DB.prepare(
    `DELETE FROM push_pending_messages
     WHERE subscription_id = ? AND json_extract(data, '$.id') = ?`
  ).bind(subscriptionId, messageId).run();
}

async function refreshAdminBroadcastCounts(env, broadcastId) {
  const counts = await env.NOTIFICATIONS_DB.prepare(
    `SELECT
       COUNT(*) AS total_count,
       SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
       SUM(CASE WHEN status = 'removed' THEN 1 ELSE 0 END) AS removed_count,
       SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
       SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_count
     FROM admin_push_deliveries WHERE broadcast_id = ?`
  ).bind(broadcastId).first();
  const pending = Number(counts?.pending_count || 0);
  const status = pending > 0 ? "queued" : "completed";
  const completedAt = status === "completed" ? new Date().toISOString() : null;
  await env.NOTIFICATIONS_DB.prepare(
    `UPDATE admin_push_broadcasts
     SET status = ?, total_count = ?, sent_count = ?, removed_count = ?, failed_count = ?, completed_at = ?
     WHERE id = ?`
  ).bind(
    status,
    Number(counts?.total_count || 0),
    Number(counts?.sent_count || 0),
    Number(counts?.removed_count || 0),
    Number(counts?.failed_count || 0),
    completedAt,
    broadcastId
  ).run();
  return getAdminPushBroadcast(env, broadcastId);
}

async function getAdminPushBroadcast(env, id) {
  const row = await env.NOTIFICATIONS_DB.prepare(
    `SELECT id, title, body, url, status, total_count, sent_count, removed_count,
            failed_count, created_at, completed_at
     FROM admin_push_broadcasts WHERE id = ?`
  ).bind(id).first();
  return row ? publicAdminBroadcast(row) : null;
}

async function runNotificationRetentionCleanup(env, at = new Date()) {
  const cleanupDate = validCronDate(at);
  await ensureAdminBroadcastTables(env);
  const marker = await env.NOTIFICATIONS_DB.prepare(
    "SELECT value FROM push_meta WHERE key = ?"
  ).bind(RETENTION_CLEANUP_KEY).first();
  const lastCleanupAt = Date.parse(String(marker?.value || ""));
  if (Number.isFinite(lastCleanupAt) && cleanupDate.getTime() - lastCleanupAt < RETENTION_CLEANUP_INTERVAL_MS) {
    return { ran: false, retentionDays: RETENTION_DAYS, lastCleanupAt: marker.value };
  }

  const now = cleanupDate.toISOString();
  const results = await env.NOTIFICATIONS_DB.batch([
    env.NOTIFICATIONS_DB.prepare(
      `DELETE FROM admin_push_deliveries
       WHERE broadcast_id IN (
         SELECT id FROM admin_push_broadcasts
         WHERE status = 'completed' AND datetime(created_at) < datetime('now', '-${RETENTION_DAYS} days')
       ) OR NOT EXISTS (
         SELECT 1 FROM admin_push_broadcasts b WHERE b.id = admin_push_deliveries.broadcast_id
       )`
    ),
    env.NOTIFICATIONS_DB.prepare(
      `DELETE FROM admin_push_broadcasts
       WHERE status = 'completed' AND datetime(created_at) < datetime('now', '-${RETENTION_DAYS} days')`
    ),
    env.NOTIFICATIONS_DB.prepare(
      `DELETE FROM push_pending_messages
       WHERE datetime(created_at) < datetime('now', '-${RETENTION_DAYS} days')`
    ),
    env.NOTIFICATIONS_DB.prepare(
      `DELETE FROM app_records
       WHERE key LIKE 'early-access-activation:%'
         AND json_extract(value, '$.expiresAt') IS NOT NULL
         AND datetime(json_extract(value, '$.expiresAt')) < datetime('now')`
    ),
    env.NOTIFICATIONS_DB.prepare(
      `INSERT INTO push_meta (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).bind(RETENTION_CLEANUP_KEY, now)
  ]);
  return {
    ran: true,
    retentionDays: RETENTION_DAYS,
    completedBroadcasts: getD1Changes(results[1]),
    deliveries: getD1Changes(results[0]),
    pendingMessages: getD1Changes(results[2]),
    expiredEarlyAccessActivations: getD1Changes(results[3]),
    lastCleanupAt: now
  };
}

function getD1Changes(result) {
  return Number(result?.meta?.changes || result?.changes || 0);
}

function publicAdminBroadcast(row) {
  return {
    id: String(row?.id || ""),
    title: String(row?.title || ""),
    body: String(row?.body || ""),
    url: normalizeAdminBroadcastUrl(row?.url),
    status: ["queued", "sending", "completed"].includes(row?.status) ? row.status : "queued",
    total: Number(row?.total_count || 0),
    sent: Number(row?.sent_count || 0),
    removed: Number(row?.removed_count || 0),
    failed: Number(row?.failed_count || 0),
    createdAt: row?.created_at || null,
    completedAt: row?.completed_at || null
  };
}

async function sendEmptyPush(pushSubscription, env, preparedVapidKeys = null) {
  const endpoint = pushSubscription?.endpoint;
  const vapidKeys = preparedVapidKeys || await getVapidKeys(env, { create: true });
  if (!endpoint || !vapidKeys?.publicKey || !vapidKeys?.privateKey) {
    return { ok: false, status: 0, statusText: "missing push configuration" };
  }

  const token = await createVapidJwt(new URL(endpoint).origin, env, vapidKeys);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PUSH_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: {
        "TTL": String(PUSH_TTL_SECONDS),
        "Urgency": "high",
        "Authorization": `vapid t=${token}, k=${vapidKeys.publicKey}`
      },
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

function validCronDate(value) {
  const date = value instanceof Date ? value : new Date(value ?? Date.now());
  return Number.isFinite(date.getTime()) ? date : new Date();
}

async function sendEmptyPushSafely(pushSubscription, env, preparedVapidKeys = null) {
  try {
    const response = await sendEmptyPush(pushSubscription, env, preparedVapidKeys);
    if (response.ok) return response;
    return {
      ok: false,
      status: response.status,
      statusText: await readPushErrorReason(response)
    };
  } catch (error) {
    console.warn("[Push API] push request failed", error);
    return {
      ok: false,
      status: 0,
      statusText: error instanceof Error ? error.message : "push request failed"
    };
  }
}

async function readPushErrorReason(response) {
  const fallback = String(response?.statusText || "push request failed");
  try {
    const payload = await response.clone().json();
    return String(payload?.reason || payload?.message || fallback).slice(0, 160);
  } catch {
    try {
      return String(await response.clone().text() || fallback).slice(0, 160);
    } catch {
      return fallback;
    }
  }
}

async function createVapidJwt(audience, env, vapidKeys) {
  const header = base64UrlEncode(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const payload = base64UrlEncode(JSON.stringify({
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 60 * 60,
    sub: env.VAPID_SUBJECT || "https://meteoscope.pages.dev"
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

  if (!env.NOTIFICATIONS_DB) return null;

  const stored = await readJson(env.NOTIFICATIONS_DB, VAPID_KEYS_KEY, null);
  if (stored?.publicKey && stored?.privateKey) {
    return {
      publicKey: String(stored.publicKey),
      privateKey: String(stored.privateKey),
      source: "d1"
    };
  }

  if (!options.create) return null;

  const generated = await generateVapidKeys();
  const record = {
    publicKey: generated.publicKey,
    privateKey: generated.privateKey,
    createdAt: new Date().toISOString()
  };
  await writeJson(env.NOTIFICATIONS_DB, VAPID_KEYS_KEY, record);
  return { ...record, source: "d1" };
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

async function listSubscriptions(env) {
  const result = await env.NOTIFICATIONS_DB.prepare(
    "SELECT data FROM push_subscriptions ORDER BY updated_at DESC"
  ).all();
  return (result.results || []).map((row) => parseJson(row.data, null)).filter(Boolean);
}

async function migrateWebSubscriptionsToAdminOnly(env, at = new Date()) {
  const now = validCronDate(at).toISOString();
  const result = await env.NOTIFICATIONS_DB.prepare(
    `UPDATE push_subscriptions
     SET data = json_set(
       json_remove(
         data,
         '$.areaCode',
         '$.areaName',
         '$.prefecture',
         '$.officeCode',
         '$.warningState',
         '$.lastNotifiedAt'
       ),
       '$.deliveryMode',
       'admin_only',
       '$.preferences',
       json('{"adminBroadcast":true}'),
       '$.updatedAt',
       ?
     ),
     updated_at = ?
     WHERE COALESCE(json_extract(data, '$.deliveryMode'), '') <> 'admin_only'
        OR json_type(data, '$.areaCode') IS NOT NULL
        OR json_type(data, '$.warningState') IS NOT NULL`
  ).bind(now, now).run();
  return { migrated: getD1Changes(result) };
}

async function saveSubscription(env, subscription) {
  const id = String(subscription?.id || "");
  if (!id) return;
  await env.NOTIFICATIONS_DB.prepare(
    `INSERT INTO push_subscriptions (id, data, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).bind(id, JSON.stringify(subscription), new Date().toISOString()).run();
}

async function deleteSubscription(env, id) {
  if (!id) return;
  await env.NOTIFICATIONS_DB.batch([
    env.NOTIFICATIONS_DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(id),
    env.NOTIFICATIONS_DB.prepare("DELETE FROM push_pending_messages WHERE subscription_id = ?").bind(id)
  ]);
}

async function takePendingMessages(env, id) {
  const result = await env.NOTIFICATIONS_DB.prepare(
    `DELETE FROM push_pending_messages
     WHERE id IN (
       SELECT id FROM push_pending_messages
       WHERE subscription_id = ? ORDER BY id DESC LIMIT ?
     )
     RETURNING id, data`
  ).bind(id, MAX_PENDING_MESSAGES).all();
  return (result.results || [])
    .sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
    .map((row) => parseJson(row.data, null))
    .filter(Boolean);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

async function subscriptionId(endpoint) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return base64UrlEncodeBytes(new Uint8Array(digest)).slice(0, 32);
}

function requireNotificationStorage(env) {
  if (!env.NOTIFICATIONS_DB) {
    throw json({ error: "通知保存用のD1が未設定です。" }, { status: 503 });
  }
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
