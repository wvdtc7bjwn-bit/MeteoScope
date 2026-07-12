import {
  applyWarningKinds,
  getWarningPhenomenon,
  severityValue
} from "../../../src/jma/warningCore.js";
import { JMA_WARNING_OFFICE_CODES } from "../../../src/jma/warningOfficeCodes.js";
import { readJson, writeJson } from "../../_shared/d1Store.js";

const VAPID_KEYS_KEY = "push:vapid-keys";
const JMA_WARNING_BASE = "https://www.jma.go.jp/bosai/warning/data/r8";
const PUSH_TTL_SECONDS = 60;
const MAX_PENDING_MESSAGES = 6;
const ADMIN_BROADCAST_BATCH_SIZE = 25;
const ADMIN_BROADCAST_MAX_ATTEMPTS = 3;
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

export async function runWarningPushCheck(env) {
  requireNotificationStorage(env);
  let adminBroadcast;
  try {
    adminBroadcast = await runAdminPushBroadcasts(env);
  } catch (error) {
    console.error("[Push API] admin broadcast processing failed", error);
    adminBroadcast = { processed: 0, sent: 0, removed: 0, failed: 0, error: true };
  }
  const subscriptions = await listSubscriptions(env);
  if (!subscriptions.length) return { checked: 0, notified: 0, removed: 0, adminBroadcast };

  const warningAreas = await fetchActiveWarningAreas();
  let notified = 0;
  let removed = 0;

  for (const subscription of subscriptions) {
    const id = String(subscription?.id || "");
    if (!subscription?.endpoint || !subscription?.pushSubscription?.endpoint) {
      await deleteSubscription(env, id);
      removed += 1;
      continue;
    }

    const currentArea = warningAreas.get(String(subscription.areaCode));
    const currentWarnings = currentArea?.warnings ?? [];
    const result = buildNotificationMessage(subscription, currentArea, currentWarnings);
    const nextWarningState = buildWarningState(currentWarnings);
    const warningStateChanged = !sameWarningState(subscription.warningState, nextWarningState);
    const areaChanged = (
      (currentArea?.areaName && currentArea.areaName !== subscription.areaName)
      || (currentArea?.prefecture && currentArea.prefecture !== subscription.prefecture)
    );
    const nextSubscription = {
      ...subscription,
      areaName: currentArea?.areaName ?? subscription.areaName,
      prefecture: currentArea?.prefecture ?? subscription.prefecture,
      warningState: nextWarningState
    };

    if (result) {
      await enqueuePendingMessage(env, id, result);
      const pushResult = await sendEmptyPushSafely(subscription.pushSubscription, env);
      if (pushResult.ok) {
        notified += 1;
        nextSubscription.lastNotifiedAt = new Date().toISOString();
      } else if (pushResult.status === 404 || pushResult.status === 410) {
        await deleteSubscription(env, id);
        removed += 1;
        continue;
      } else {
        console.warn("[Push API] web push failed", pushResult.status, pushResult.statusText);
      }
    }

    // A one-minute cron must not write when nothing changed.
    if (warningStateChanged || areaChanged || result) {
      await saveSubscription(env, nextSubscription);
    }
  }

  return {
    checked: subscriptions.length,
    notified,
    removed,
    adminBroadcast,
    storage: env.NOTIFICATIONS_DB ? "d1" : "kv"
  };
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

  await pruneAdminPushBroadcastHistory(env);
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

export async function runAdminPushBroadcasts(env) {
  requireNotificationStorage(env);
  await ensureAdminBroadcastTables(env);
  const broadcast = await env.NOTIFICATIONS_DB.prepare(
    `SELECT id, title, body, url, status, total_count, sent_count, removed_count,
            failed_count, created_at, completed_at
     FROM admin_push_broadcasts
     WHERE status IN ('queued', 'sending')
     ORDER BY created_at ASC LIMIT 1`
  ).first();
  if (!broadcast?.id) return { processed: 0, sent: 0, removed: 0, failed: 0 };

  const now = new Date().toISOString();
  await env.NOTIFICATIONS_DB.prepare(
    "UPDATE admin_push_broadcasts SET status = 'sending' WHERE id = ?"
  ).bind(broadcast.id).run();

  const deliveryResult = await env.NOTIFICATIONS_DB.prepare(
    `SELECT d.subscription_id, d.attempts, d.enqueued, s.data
     FROM admin_push_deliveries d
     LEFT JOIN push_subscriptions s ON s.id = d.subscription_id
     WHERE d.broadcast_id = ? AND d.status = 'pending'
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

function sameWarningState(previous, next) {
  const normalize = (state) => (Array.isArray(state?.warnings) ? state.warnings : [])
    .map((warning) => ({
      code: String(warning?.code || ""),
      rawLabel: String(warning?.rawLabel || ""),
      label: String(warning?.label || ""),
      level: String(warning?.level || ""),
      levelNumber: Number(warning?.levelNumber || 0)
    }))
    .sort((a, b) => a.code.localeCompare(b.code, "ja"));
  return JSON.stringify(normalize(previous)) === JSON.stringify(normalize(next));
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

  await saveSubscription(env, record);
  return json({ subscribed: true, id, area });
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

async function enqueuePendingMessage(env, id, message) {
  await env.NOTIFICATIONS_DB.batch([
    env.NOTIFICATIONS_DB.prepare(
      "INSERT INTO push_pending_messages (subscription_id, data, created_at) VALUES (?, ?, ?)"
    ).bind(id, JSON.stringify(message), new Date().toISOString()),
    env.NOTIFICATIONS_DB.prepare(
      `DELETE FROM push_pending_messages
       WHERE subscription_id = ? AND id NOT IN (
         SELECT id FROM push_pending_messages WHERE subscription_id = ? ORDER BY id DESC LIMIT ?
       )`
    ).bind(id, id, MAX_PENDING_MESSAGES)
  ]);
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

async function pruneAdminPushBroadcastHistory(env) {
  await env.NOTIFICATIONS_DB.batch([
    env.NOTIFICATIONS_DB.prepare(
      `DELETE FROM admin_push_deliveries
       WHERE broadcast_id IN (
         SELECT id FROM admin_push_broadcasts WHERE datetime(created_at) < datetime('now', '-90 days')
       )`
    ),
    env.NOTIFICATIONS_DB.prepare(
      "DELETE FROM admin_push_broadcasts WHERE datetime(created_at) < datetime('now', '-90 days')"
    )
  ]);
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
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "TTL": String(PUSH_TTL_SECONDS),
      "Urgency": "high",
      "Authorization": `vapid t=${token}, k=${vapidKeys.publicKey}`
    }
  });
}

async function sendEmptyPushSafely(pushSubscription, env, preparedVapidKeys = null) {
  try {
    return await sendEmptyPush(pushSubscription, env, preparedVapidKeys);
  } catch (error) {
    console.warn("[Push API] push request failed", error);
    return {
      ok: false,
      status: 0,
      statusText: error instanceof Error ? error.message : "push request failed"
    };
  }
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

function normalizeArea(area) {
  return {
    areaCode: String(area?.areaCode || ""),
    areaName: String(area?.areaName || ""),
    prefecture: String(area?.prefecture || "")
  };
}

function normalizePreferences(preferences) {
  return {
    notifyAdvisory: Boolean(preferences?.notifyAdvisory),
    adminBroadcast: preferences?.adminBroadcast !== false
  };
}

async function listSubscriptions(env) {
  const result = await env.NOTIFICATIONS_DB.prepare(
    "SELECT data FROM push_subscriptions ORDER BY updated_at DESC"
  ).all();
  return (result.results || []).map((row) => parseJson(row.data, null)).filter(Boolean);
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
    "SELECT data FROM push_pending_messages WHERE subscription_id = ? ORDER BY id DESC LIMIT ?"
  ).bind(id, MAX_PENDING_MESSAGES).all();
  await env.NOTIFICATIONS_DB.prepare(
    "DELETE FROM push_pending_messages WHERE subscription_id = ?"
  ).bind(id).run();
  return (result.results || []).map((row) => parseJson(row.data, null)).filter(Boolean);
}

function parseJson(value, fallback) {
  try { return JSON.parse(value); } catch { return fallback; }
}

async function subscriptionId(endpoint) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return base64UrlEncodeBytes(new Uint8Array(digest)).slice(0, 32);
}

function chooseLatestTime(current, next) {
  if (!current) return next ?? "";
  if (!next) return current;
  return new Date(next).getTime() > new Date(current).getTime() ? next : current;
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
