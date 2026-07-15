import {
  applyWarningKinds,
  getPrefectureNameByCode,
  getWarningPhenomenon,
  severityValue
} from "../../../src/jma/warningCore.js";
import { JMA_WARNING_OFFICE_CODES } from "../../../src/jma/warningOfficeCodes.js";
import { readJson, writeJson } from "../../_shared/d1Store.js";
import {
  deleteIOSSubscription,
  isValidAPNSDeviceToken,
  isAPNSConfigured,
  listIOSSubscriptions,
  normalizeIOSSubscription,
  saveIOSSubscription,
  sendAPNSNotification,
  shouldRemoveIOSSubscription
} from "../../_shared/apns.js";

const VAPID_KEYS_KEY = "push:vapid-keys";
const JMA_WARNING_BASE = "https://www.jma.go.jp/bosai/warning/data/r8";
const PUSH_TTL_SECONDS = 60;
const MAX_PENDING_MESSAGES = 6;
const ADMIN_BROADCAST_BATCH_SIZE = 4;
const ADMIN_BROADCAST_MAX_ATTEMPTS = 3;
const RETENTION_DAYS = 30;
const IOS_SUBSCRIPTION_RETENTION_DAYS = 180;
const RETENTION_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
const RETENTION_CLEANUP_KEY = "retention:last-cleanup";
const WARNING_OFFICE_BATCH_SIZE = 15;
const WARNING_NOTIFICATION_BATCH_SIZE = 6;
const WARNING_CRON_STATE_KEY = "push:warning-cron-state";
export const WARNING_CRON_HEALTH_KEY = "push:warning-cron-health";
const WARNING_OFFICE_SNAPSHOT_BATCH_PREFIX = "push:warning-office-batch:";
const JMA_AREA_CATALOG_URL = "https://www.jma.go.jp/bosai/common/const/area.json";
const WEB_REQUEST_MAX_BYTES = 8192;
const IOS_REQUEST_MAX_BYTES = 4096;
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
    if (route === "ios/config" && method === "GET") return await iosPushConfig(env);
    if (route === "ios/register" && method === "POST") return await registerIOSPush(request, env);
    if (route === "ios/unregister" && method === "POST") return await unregisterIOSPush(request, env);
    if (route === "ios/test" && method === "POST") return await testIOSPush(request, env);

    return json({ error: "Not found" }, { status: 404 });
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[Push API]", error);
    return json({ error: "通知APIでエラーが発生しました。" }, { status: 500 });
  }
}

export async function runWarningPushCheck(env) {
  requireNotificationStorage(env);
  let webSubscriptionMigration;
  try {
    webSubscriptionMigration = await migrateWebSubscriptionsToAdminOnly(env);
  } catch (error) {
    console.error("[Push API] web subscription migration failed", error);
    webSubscriptionMigration = { migrated: 0, error: true };
  }
  let retention;
  try {
    retention = await runNotificationRetentionCleanup(env);
  } catch (error) {
    console.error("[Push API] retention cleanup failed", error);
    retention = { ran: false, error: true };
  }
  const state = await readJson(env.NOTIFICATIONS_DB, WARNING_CRON_STATE_KEY, initialWarningCronState());
  let adminBroadcast = { processed: 0, sent: 0, removed: 0, failed: 0, deferred: state.phase === "notify" };
  if (state.phase !== "notify") {
    try {
      adminBroadcast = await runAdminPushBroadcasts(env);
    } catch (error) {
      console.error("[Push API] admin broadcast processing failed", error);
      adminBroadcast = { processed: 0, sent: 0, removed: 0, failed: 0, error: true };
    }
  }
  const result = state.phase === "notify"
    ? await runWarningNotificationBatch(env, state)
    : await runWarningOfficeFetchBatch(env, state);
  return { ...result, adminBroadcast, retention, webSubscriptionMigration, storage: "d1" };
}

export async function readWarningCronHealth(env) {
  return readJson(env.NOTIFICATIONS_DB, WARNING_CRON_HEALTH_KEY, null);
}

export function selectWarningOfficeBatch(nextOfficeIndex, batchSize = WARNING_OFFICE_BATCH_SIZE) {
  const start = Math.max(0, Math.min(Number(nextOfficeIndex) || 0, JMA_WARNING_OFFICE_CODES.length));
  return JMA_WARNING_OFFICE_CODES.slice(start, start + batchSize);
}

export function shouldPreserveWarningState(officeCode, failedOfficeCodes) {
  return !officeCode || new Set(failedOfficeCodes || []).has(officeCode);
}

export function selectNotificationQueueBatch(queue, cursor = "", batchSize = WARNING_NOTIFICATION_BATCH_SIZE) {
  const remaining = queue
    .filter((item) => String(item?.key || "") > String(cursor || ""))
    .sort((left, right) => String(left.key).localeCompare(String(right.key)));
  return {
    batch: remaining.slice(0, batchSize),
    remainingCount: remaining.length
  };
}

async function runWarningOfficeFetchBatch(env, state) {
  const now = new Date().toISOString();
  const start = Number(state.nextOfficeIndex) || 0;
  const officeCodes = selectWarningOfficeBatch(start);
  const snapshotBatchIndex = Math.floor(start / WARNING_OFFICE_BATCH_SIZE);
  const snapshotBatchKey = `${WARNING_OFFICE_SNAPSHOT_BATCH_PREFIX}${snapshotBatchIndex}`;
  const [savedSnapshotBatch, results] = await Promise.all([
    readJson(env.NOTIFICATIONS_DB, snapshotBatchKey, { offices: {} }),
    Promise.all(officeCodes.map(fetchWarningOffice))
  ]);
  const failures = results.filter((result) => !result.ok).map((result) => result.officeCode);
  const priorFailures = start === 0 ? [] : Array.isArray(state.failedOfficeCodes) ? state.failedOfficeCodes : [];
  const failedOfficeCodes = [...new Set([...priorFailures, ...failures])];

  const nextSnapshotBatch = {
    batchIndex: snapshotBatchIndex,
    offices: { ...(savedSnapshotBatch?.offices || {}) },
    updatedAt: now
  };
  results.filter((result) => result.ok).forEach((result) => {
    nextSnapshotBatch.offices[result.officeCode] = {
      officeCode: result.officeCode,
      reports: result.reports,
      successAt: now
    };
  });

  const nextOfficeIndex = start + officeCodes.length;
  const cycleComplete = nextOfficeIndex >= JMA_WARNING_OFFICE_CODES.length;
  const previousHealth = await readWarningCronHealth(env) || {};
  const nextState = cycleComplete
    ? {
        phase: "notify",
        nextOfficeIndex: 0,
        notificationCursor: "",
        notificationProcessed: 0,
        cycleStartedAt: state.cycleStartedAt || now,
        cycleCompletedAt: now,
        failedOfficeCodes
      }
    : {
        ...state,
        phase: "fetch",
        nextOfficeIndex,
        cycleStartedAt: start === 0 ? now : state.cycleStartedAt || now,
        failedOfficeCodes
      };
  const health = {
    ...previousHealth,
    phase: nextState.phase,
    lastRunAt: now,
    cycleStartedAt: nextState.cycleStartedAt,
    lastCycleCompletedAt: cycleComplete ? now : previousHealth.lastCycleCompletedAt || null,
    lastFullySuccessfulAt: cycleComplete && failedOfficeCodes.length === 0
      ? now
      : previousHealth.lastFullySuccessfulAt || null,
    failedOfficeCount: failedOfficeCodes.length,
    failedOfficeCodes,
    nextOfficeIndex: nextState.nextOfficeIndex,
    officeCount: JMA_WARNING_OFFICE_CODES.length,
    officeBatchSize: WARNING_OFFICE_BATCH_SIZE,
    maximumCollectionDelayMinutes: Math.ceil(JMA_WARNING_OFFICE_CODES.length / WARNING_OFFICE_BATCH_SIZE)
  };
  await Promise.all([
    writeJson(env.NOTIFICATIONS_DB, snapshotBatchKey, nextSnapshotBatch),
    writeJson(env.NOTIFICATIONS_DB, WARNING_CRON_STATE_KEY, nextState),
    writeJson(env.NOTIFICATIONS_DB, WARNING_CRON_HEALTH_KEY, health)
  ]);
  return {
    phase: "fetch",
    attemptedOffices: officeCodes.length,
    failedOffices: failures.length,
    cycleComplete,
    nextOfficeIndex: nextState.nextOfficeIndex,
    checked: 0,
    notified: 0,
    removed: 0,
    ios: { checked: 0, notified: 0, removed: 0, failed: 0, configured: isAPNSConfigured(env) }
  };
}

async function runWarningNotificationBatch(env, state) {
  const now = new Date().toISOString();
  const [iosSubscriptions, snapshots, areaCatalog] = await Promise.all([
    listIOSSubscriptions(env).catch((error) => {
      console.error("[Push API] failed to list iOS subscriptions", error);
      return [];
    }),
    loadWarningOfficeSnapshots(env),
    fetchNotificationAreaCatalog()
  ]);
  const queue = buildIOSWarningNotificationQueue(iosSubscriptions);
  const cursor = String(state.notificationCursor || "");
  const { batch, remainingCount } = selectNotificationQueueBatch(queue, cursor);
  const warningAreas = buildActiveWarningAreasFromSnapshots(snapshots);
  const failedOfficeCodes = new Set(state.failedOfficeCodes || []);
  let staleSkipped = 0;
  const ios = { checked: 0, notified: 0, removed: 0, failed: 0, configured: isAPNSConfigured(env) };
  for (const item of batch) {
    const officeCode = resolveSubscriptionOfficeCode(item.subscription, warningAreas, areaCatalog);
    if (shouldPreserveWarningState(officeCode, failedOfficeCodes)) {
      staleSkipped += 1;
      continue;
    }
    const subscription = { ...item.subscription, officeCode };
    const result = await runIOSWarningPushCheck(env, warningAreas, [subscription]);
    ios.checked += result.checked;
    ios.notified += result.notified;
    ios.removed += result.removed;
    ios.failed += result.failed;
  }

  const notificationComplete = batch.length >= remainingCount;
  const nextCursor = batch.at(-1)?.key || cursor;
  const notificationProcessed = (Number(state.notificationProcessed) || 0) + batch.length;
  const nextState = notificationComplete
    ? initialWarningCronState()
    : { ...state, notificationCursor: nextCursor, notificationProcessed };
  const previousHealth = await readWarningCronHealth(env) || {};
  const resultSummary = {
    checked: batch.length,
    notified: ios.notified,
    removed: ios.removed,
    failed: ios.failed,
    staleSkipped,
    completedAt: notificationComplete ? now : null
  };
  await Promise.all([
    writeJson(env.NOTIFICATIONS_DB, WARNING_CRON_STATE_KEY, nextState),
    writeJson(env.NOTIFICATIONS_DB, WARNING_CRON_HEALTH_KEY, {
      ...previousHealth,
      phase: nextState.phase,
      lastRunAt: now,
      notificationCursor: notificationComplete ? "" : nextCursor,
      notificationProcessed: notificationComplete ? notificationProcessed : nextState.notificationProcessed,
      notificationTotal: queue.length,
      lastNotificationResult: resultSummary
    })
  ]);
  return {
    phase: "notify",
    checked: batch.length,
    notified: ios.notified,
    removed: ios.removed,
    failed: ios.failed,
    staleSkipped,
    notificationComplete,
    ios
  };
}

export function buildIOSWarningNotificationQueue(subscriptions) {
  return (Array.isArray(subscriptions) ? subscriptions : [])
    .map((subscription) => ({
      kind: "ios",
      subscription,
      key: `ios:${String(subscription?.id || "")}`
    }))
    .filter((item) => item.key !== "ios:")
    .sort((left, right) => left.key.localeCompare(right.key));
}

async function runIOSWarningPushCheck(env, warningAreas, subscriptions) {
  if (!isAPNSConfigured(env)) {
    return { checked: subscriptions.length, notified: 0, removed: 0, failed: 0, configured: false };
  }

  let notified = 0;
  let removed = 0;
  let failed = 0;
  for (const subscription of subscriptions) {
    if (!subscription?.deviceToken || !subscription?.areaCode) {
      await deleteIOSSubscription(env, subscription?.id || subscription?.deviceToken);
      removed += 1;
      continue;
    }

    const currentArea = warningAreas.get(String(subscription.areaCode));
    const currentWarnings = currentArea?.warnings ?? [];
    const message = buildNotificationMessage(subscription, currentArea, currentWarnings);
    const nextWarningState = buildWarningState(currentWarnings);
    const warningStateChanged = !sameWarningState(subscription.warningState, nextWarningState);
    const areaChanged = (
      (currentArea?.areaName && currentArea.areaName !== subscription.areaName)
      || (currentArea?.prefecture && currentArea.prefecture !== subscription.prefecture)
    );
    const nextSubscription = {
      ...subscription,
      officeCode: resolveSubscriptionOfficeCode(subscription, warningAreas),
      areaName: currentArea?.areaName ?? subscription.areaName,
      prefecture: currentArea?.prefecture ?? subscription.prefecture,
      warningState: nextWarningState
    };

    if (message) {
      const result = await sendAPNSNotification(env, subscription, message).catch((error) => ({
        ok: false,
        status: 0,
        reason: error instanceof Error ? error.message : "APNsRequestFailed"
      }));
      if (result.ok) {
        notified += 1;
        nextSubscription.lastNotifiedAt = new Date().toISOString();
      } else if (shouldRemoveIOSSubscription(result)) {
        await deleteIOSSubscription(env, subscription.id || subscription.deviceToken);
        removed += 1;
        continue;
      } else {
        console.warn("[Push API] APNs request failed", result.status, result.reason);
        failed += 1;
        // Keep the previous warning state so a transient APNs failure is retried by the next cron.
        continue;
      }
    }

    if (warningStateChanged || areaChanged || message) {
      await saveIOSSubscription(env, nextSubscription);
    }
  }

  return { checked: subscriptions.length, notified, removed, failed, configured: true };
}

function initialWarningCronState() {
  return {
    phase: "fetch",
    nextOfficeIndex: 0,
    notificationCursor: "",
    notificationProcessed: 0,
    cycleStartedAt: null,
    failedOfficeCodes: []
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

  await runNotificationRetentionCleanup(env);
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

export function sameWarningState(previous, next) {
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

async function iosPushConfig(env) {
  const health = await readWarningCronHealth(env);
  return json({
    enabled: isAPNSConfigured(env),
    registrationEnabled: Boolean(env.NOTIFICATIONS_DB) && isAPNSConfigured(env),
    bundleID: env.APNS_BUNDLE_ID || "",
    acceptedEnvironments: ["sandbox", "production"],
    checkedAt: new Date().toISOString(),
    warningPipeline: health ? {
      phase: health.phase || "unknown",
      lastCycleCompletedAt: health.lastCycleCompletedAt || null,
      lastFullySuccessfulAt: health.lastFullySuccessfulAt || null,
      failedOfficeCount: Number(health.failedOfficeCount || 0),
      maximumCollectionDelayMinutes: Number(health.maximumCollectionDelayMinutes || 4)
    } : null,
    setup: {
      d1: Boolean(env.NOTIFICATIONS_DB),
      keyID: Boolean(env.APNS_KEY_ID),
      teamID: Boolean(env.APNS_TEAM_ID),
      privateKey: Boolean(env.APNS_PRIVATE_KEY),
      bundleID: Boolean(env.APNS_BUNDLE_ID)
    }
  });
}

async function registerIOSPush(request, env) {
  requireNotificationStorage(env);
  if (!isAPNSConfigured(env)) {
    return json({
      registered: false,
      deliveryEnabled: false,
      error: "通知サーバーの準備中です。現在は新規登録を受け付けていません。"
    }, { status: 503 });
  }
  const rateLimited = await enforceIOSRegistrationRateLimit(request, env);
  if (rateLimited) return rateLimited;
  const payload = await readLimitedJson(request, IOS_REQUEST_MAX_BYTES);
  const canonicalArea = await validateNotificationArea(payload?.area);
  if (!canonicalArea) {
    return json({ error: "通知対象区域を確認できませんでした。" }, { status: 400 });
  }
  const subscription = normalizeIOSSubscription(payload, canonicalArea);
  if (!subscription) {
    return json({ error: "iOS通知の端末トークンまたは地域情報が不正です。" }, { status: 400 });
  }
  const saved = await saveIOSSubscription(env, subscription);
  return json({
    registered: true,
    id: saved.id,
    area: {
      areaCode: saved.areaCode,
      areaName: saved.areaName,
      prefecture: saved.prefecture
    },
    deliveryEnabled: isAPNSConfigured(env)
  });
}

async function unregisterIOSPush(request, env) {
  requireNotificationStorage(env);
  const payload = await readLimitedJson(request, IOS_REQUEST_MAX_BYTES);
  const deviceToken = String(payload.deviceToken || "").trim().toLowerCase();
  if (!deviceToken) return json({ registered: false });
  if (!isValidAPNSDeviceToken(deviceToken)) {
    return json({ error: "端末トークンが不正です。" }, { status: 400 });
  }
  await deleteIOSSubscription(env, deviceToken);
  return json({ registered: false });
}

async function testIOSPush(request, env) {
  requireNotificationStorage(env);
  if (!env.PUSH_CHECK_TOKEN) {
    return json({ error: "PUSH_CHECK_TOKENが未設定です。" }, { status: 503 });
  }
  const token = request.headers.get("X-Push-Check-Token");
  if (token !== env.PUSH_CHECK_TOKEN) {
    return json({ error: "Forbidden" }, { status: 403 });
  }
  if (!isAPNSConfigured(env)) {
    return json({ error: "APNsの環境変数が未設定です。" }, { status: 503 });
  }
  const payload = await readLimitedJson(request, IOS_REQUEST_MAX_BYTES);
  const deviceToken = String(payload.deviceToken || "").trim().toLowerCase();
  const subscription = (await listIOSSubscriptions(env)).find((item) => item.deviceToken === deviceToken);
  if (!subscription) {
    return json({ error: "登録済み端末が見つかりません。" }, { status: 404 });
  }
  const result = await sendAPNSNotification(env, subscription, {
    id: crypto.randomUUID(),
    title: "MeteoScope 通知テスト",
    body: "APNsとの接続に成功しました。",
    tag: "meteoscope-test",
    url: "/?tab=warnings",
    areaCode: subscription.areaCode
  });
  return json(result, { status: result.ok ? 200 : 502 });
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

async function enforceIOSRegistrationRateLimit(request, env) {
  const limiter = env.IOS_REGISTRATION_RATE_LIMITER;
  if (!limiter?.limit) return null;
  const key = request.headers.get("CF-Connecting-IP") || "unknown";
  const result = await limiter.limit({ key });
  if (result?.success !== false) return null;
  return json(
    { error: "登録操作が多すぎます。時間をおいて再試行してください。" },
    { status: 429, headers: { "Retry-After": "60" } }
  );
}

async function validateNotificationArea(area) {
  const areaCode = String(area?.areaCode || "").trim();
  if (!/^\d{7}$/u.test(areaCode)) return null;
  try {
    const catalog = await fetchNotificationAreaCatalog();
    if (!catalog) return null;
    const record = catalog?.class20s?.[areaCode];
    if (!record?.name || String(record.name).length > 80) return null;
    const officeCode = resolveAreaOfficeCode(catalog, record.parent);
    if (!officeCode) return null;
    return {
      areaCode,
      areaName: String(record.name),
      prefecture: getPrefectureNameByCode(areaCode),
      officeCode
    };
  } catch (error) {
    console.warn("[Push API] area catalog validation unavailable", error);
    return null;
  }
}

async function fetchNotificationAreaCatalog() {
  try {
    const response = await fetch(JMA_AREA_CATALOG_URL, {
      headers: { "Accept": "application/json" },
      cf: { cacheTtl: 24 * 60 * 60, cacheEverything: true }
    });
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.warn("[Push API] area catalog unavailable", error);
    return null;
  }
}

function resolveAreaOfficeCode(catalog, startingCode) {
  let code = String(startingCode || "");
  const visited = new Set();
  while (code && !visited.has(code)) {
    visited.add(code);
    if (catalog?.offices?.[code]) return JMA_WARNING_OFFICE_CODES.includes(code) ? code : "";
    const record = catalog?.class15s?.[code] || catalog?.class10s?.[code] || catalog?.class20s?.[code];
    code = String(record?.parent || "");
  }
  return "";
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

function buildActiveWarningAreas(reports) {
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
          officeCode: report.__officeCode || "",
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

async function fetchWarningOffice(officeCode) {
  try {
    const response = await fetch(`${JMA_WARNING_BASE}/${officeCode}.json`, {
      headers: { "Accept": "application/json,text/plain,*/*" },
      cf: { cacheTtl: 30, cacheEverything: true }
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const reports = await response.json();
    if (!Array.isArray(reports)) throw new Error("Unexpected warning response");
    return { ok: true, officeCode, reports };
  } catch (error) {
    console.warn(`[Push API] warning JSON unavailable: ${officeCode}`, error);
    return { ok: false, officeCode, reports: [] };
  }
}

async function loadWarningOfficeSnapshots(env) {
  const batchCount = Math.ceil(JMA_WARNING_OFFICE_CODES.length / WARNING_OFFICE_BATCH_SIZE);
  const batches = await Promise.all(Array.from({ length: batchCount }, (_, batchIndex) => readJson(
    env.NOTIFICATIONS_DB,
    `${WARNING_OFFICE_SNAPSHOT_BATCH_PREFIX}${batchIndex}`,
    { offices: {} }
  )));
  return batches
    .flatMap((batch) => Object.values(batch?.offices || {}))
    .filter((snapshot) => snapshot?.officeCode && Array.isArray(snapshot.reports));
}

function buildActiveWarningAreasFromSnapshots(snapshots) {
  const reports = snapshots.flatMap((snapshot) => snapshot.reports.map((report) => ({
    ...report,
    __officeCode: snapshot.officeCode
  })));
  return buildActiveWarningAreas(reports);
}

function resolveSubscriptionOfficeCode(subscription, warningAreas, areaCatalog = null) {
  const stored = String(subscription?.officeCode || "");
  if (JMA_WARNING_OFFICE_CODES.includes(stored)) return stored;
  const areaCode = String(subscription?.areaCode || "");
  const fromCurrentArea = warningAreas.get(areaCode)?.officeCode;
  if (fromCurrentArea) return fromCurrentArea;
  const officialArea = areaCatalog?.class20s?.[areaCode];
  const fromCatalog = officialArea ? resolveAreaOfficeCode(areaCatalog, officialArea.parent) : "";
  if (fromCatalog) return fromCatalog;
  const prefixMatches = JMA_WARNING_OFFICE_CODES.filter((officeCode) => officeCode.slice(0, 2) === areaCode.slice(0, 2));
  return prefixMatches.length === 1 ? prefixMatches[0] : "";
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

export function buildNotificationMessage(subscription, currentArea, currentWarnings) {
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
    title: `気象庁発表｜${areaName}気象警報・注意報`,
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

async function runNotificationRetentionCleanup(env) {
  await ensureAdminBroadcastTables(env);
  const marker = await env.NOTIFICATIONS_DB.prepare(
    "SELECT value FROM push_meta WHERE key = ?"
  ).bind(RETENTION_CLEANUP_KEY).first();
  const lastCleanupAt = Date.parse(String(marker?.value || ""));
  if (Number.isFinite(lastCleanupAt) && Date.now() - lastCleanupAt < RETENTION_CLEANUP_INTERVAL_MS) {
    return { ran: false, retentionDays: RETENTION_DAYS, lastCleanupAt: marker.value };
  }

  const now = new Date().toISOString();
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
      `DELETE FROM ios_push_subscriptions
       WHERE datetime(updated_at) < datetime('now', '-${IOS_SUBSCRIPTION_RETENTION_DAYS} days')`
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
    expiredIOSSubscriptions: getD1Changes(results[4]),
    iosSubscriptionRetentionDays: IOS_SUBSCRIPTION_RETENTION_DAYS,
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

async function migrateWebSubscriptionsToAdminOnly(env) {
  const now = new Date().toISOString();
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
