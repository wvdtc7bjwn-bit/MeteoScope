import {
  getEarthquakeIntensityColor,
  getEarthquakeIntensityLabel
} from "../../../src/earthquakeIntensity.js";

const DISCORD_NOTIFICATION_LIMIT = 4;
const DISCORD_FETCH_TIMEOUT_MS = 8_000;
const DISCORD_MAX_ATTEMPTS = 8;
const DISCORD_MAX_RETRY_MS = 60 * 60 * 1000;
const METEOSCOPE_EARTHQUAKE_URL = "https://meteoscope.pages.dev/?tab=earthquake";
const VXSE53_CODE = "VXSE53";

export function ensureDiscordEarthquakeNotificationSchema(db) {
  if (!db) throw new Error("earthquake_database_unavailable");
  return db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS discord_earthquake_notifications (
        event_id TEXT PRIMARY KEY,
        source_date TEXT NOT NULL,
        entry_url TEXT NOT NULL,
        entry_updated TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        discord_message_id TEXT,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_attempt_at TEXT,
        last_error TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        sent_at TEXT
      )
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_discord_earthquake_notifications_delivery
      ON discord_earthquake_notifications(status, next_attempt_at, entry_updated)
    `),
    db.prepare(`
      CREATE INDEX IF NOT EXISTS idx_discord_earthquake_notifications_date
      ON discord_earthquake_notifications(source_date)
    `)
  ]);
}

export function isDiscordNotifiableEarthquakeReport(report) {
  if (!report || report.xmlCode !== VXSE53_CODE) return false;
  if (report.ignored || report.active !== 1) return false;
  if (!String(report.maxIntensity ?? "").trim()) return false;
  return report.infoType === "発表" || report.infoType === "訂正";
}

export function buildDiscordEarthquakeNotificationUpsert(db, report, entry, now) {
  const currentTime = Number(now ?? Date.now());
  const entryUpdated = normalizeIsoTimestamp(entry?.updated || report.reportTime, currentTime);
  const updatedAt = new Date(currentTime).toISOString();
  const payloadJson = JSON.stringify(buildDiscordEarthquakeWebhookPayload(report));
  return db.prepare(`
    INSERT INTO discord_earthquake_notifications (
      event_id, source_date, entry_url, entry_updated, payload_json, status,
      discord_message_id, attempts, next_attempt_at, last_error,
      created_at, updated_at, sent_at
    ) VALUES (?, ?, ?, ?, ?, 'pending', NULL, 0, NULL, NULL, ?, ?, NULL)
    ON CONFLICT(event_id) DO UPDATE SET
      source_date = excluded.source_date,
      entry_url = excluded.entry_url,
      entry_updated = excluded.entry_updated,
      payload_json = excluded.payload_json,
      status = 'pending',
      attempts = 0,
      next_attempt_at = NULL,
      last_error = NULL,
      updated_at = excluded.updated_at
    WHERE excluded.entry_updated > discord_earthquake_notifications.entry_updated
      OR (
        excluded.entry_updated = discord_earthquake_notifications.entry_updated
        AND excluded.payload_json <> discord_earthquake_notifications.payload_json
      )
  `).bind(
    report.eventId,
    report.sourceDate,
    entry?.url || report.sourceUrl || "",
    entryUpdated,
    payloadJson,
    updatedAt,
    updatedAt
  );
}

export function buildDiscordEarthquakeWebhookPayload(report) {
  const maximumIntensity = formatIntensity(report.maxIntensity);
  const place = truncate(report.place || "震源地名不明", 170);
  const magnitude = report.magnitude !== null
    && report.magnitude !== undefined
    && Number.isFinite(Number(report.magnitude))
    ? `M${Number(report.magnitude).toFixed(1)}`
    : "不明";
  const depth = report.depthKm !== null
    && report.depthKm !== undefined
    && Number.isFinite(Number(report.depthKm))
    ? formatDepth(Number(report.depthKm))
    : "不明";
  const correction = report.infoType === "訂正" ? "【訂正】" : "";
  return {
    username: "MeteoScope",
    allowed_mentions: { parse: [] },
    embeds: [{
      author: { name: "地震情報" },
      title: `${correction}最大震度 ${maximumIntensity}｜${place}`,
      url: METEOSCOPE_EARTHQUAKE_URL,
      color: intensityColor(report.maxIntensity),
      description: [
        `**${formatJstShortDateTime(report.originTime)}ごろ発生**`,
        `${magnitude}　／　深さ ${depth}`,
        `**${formatTsunamiText(report.tsunamiText)}**`
      ].join("\n"),
      footer: { text: "気象庁 防災情報XML｜MeteoScope" },
      timestamp: normalizeIsoTimestamp(report.reportTime)
    }]
  };
}

export function buildDiscordEarthquakeTestWebhookPayload(now = Date.now()) {
  return {
    username: "MeteoScope",
    allowed_mentions: { parse: [] },
    embeds: [{
      title: "【TEST】地震情報通知",
      url: METEOSCOPE_EARTHQUAKE_URL,
      color: 0x1768a5,
      description: [
        "**管理者画面からの接続テストです**",
        "実際の地震情報ではありません。",
        "",
        "通知対象：確定報（VXSE53）のみ",
        "震度速報：通知しません",
        "画像：添付しません"
      ].join("\n"),
      footer: { text: "MeteoScope・Discord通知テスト" },
      timestamp: new Date(Number(now)).toISOString()
    }]
  };
}

export async function sendDiscordEarthquakeTestNotification(env, options = {}) {
  const webhookUrl = parseDiscordWebhookUrl(env?.DISCORD_EARTHQUAKE_WEBHOOK_URL);
  if (!webhookUrl) {
    return { ok: false, status: 503, error: "discord_webhook_not_configured" };
  }

  const requestUrl = new URL(webhookUrl);
  requestUrl.searchParams.set("wait", "true");
  try {
    const response = await fetchWithTimeout(options.fetchImpl ?? fetch, requestUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildDiscordEarthquakeTestWebhookPayload(options.now))
    });
    const responseBody = await readJsonSafely(response);
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: response.status === 429
          ? "discord_rate_limited"
          : `discord_http_${response.status}`
      };
    }
    const messageId = String(responseBody?.id ?? "").trim();
    if (!messageId) {
      return { ok: false, status: 502, error: "discord_message_id_missing" };
    }
    return {
      ok: true,
      status: 200,
      messageId,
      sentAt: new Date(Number(options.now ?? Date.now())).toISOString()
    };
  }
  catch (error) {
    return {
      ok: false,
      status: 502,
      error: error?.name === "AbortError" ? "discord_timeout" : "discord_network_error"
    };
  }
}

export async function deliverPendingDiscordEarthquakeNotifications(env, options = {}) {
  const db = env?.EQ_D1;
  if (!db) throw new Error("earthquake_database_unavailable");
  const webhookUrl = parseDiscordWebhookUrl(env?.DISCORD_EARTHQUAKE_WEBHOOK_URL);
  if (!webhookUrl) {
    return { enabled: false, attempted: 0, sent: 0, retried: 0, failed: 0 };
  }

  const now = Number(options.now ?? Date.now());
  const pending = await db.prepare(`
    SELECT event_id, payload_json, discord_message_id, attempts
    FROM discord_earthquake_notifications
    WHERE status IN ('pending', 'retry')
      AND (next_attempt_at IS NULL OR next_attempt_at <= ?)
    ORDER BY entry_updated ASC
    LIMIT ?
  `).bind(new Date(now).toISOString(), DISCORD_NOTIFICATION_LIMIT).all();

  const stats = { enabled: true, attempted: 0, sent: 0, retried: 0, failed: 0 };
  const fetchImpl = options.fetchImpl ?? fetch;
  for (const row of pending?.results ?? []) {
    stats.attempted += 1;
    const result = await deliverOneNotification({
      db,
      fetchImpl,
      webhookUrl,
      row,
      now
    });
    stats[result] += 1;
  }
  return stats;
}

export function computeDiscordRetryDelayMs(attempts, retryAfterSeconds = null) {
  const requestedDelay = Number(retryAfterSeconds) * 1000;
  if (Number.isFinite(requestedDelay) && requestedDelay > 0) {
    return Math.min(DISCORD_MAX_RETRY_MS, Math.max(1_000, requestedDelay));
  }
  const exponent = Math.max(0, Math.min(6, Number(attempts) || 0));
  return Math.min(DISCORD_MAX_RETRY_MS, 15_000 * (2 ** exponent));
}

export function parseDiscordWebhookUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(String(value).trim());
    const allowedHost = url.hostname === "discord.com"
      || url.hostname === "discordapp.com"
      || url.hostname === "ptb.discord.com"
      || url.hostname === "canary.discord.com";
    if (url.protocol !== "https:" || !allowedHost) return null;
    if (!/^\/api\/webhooks\/\d+\/[^/]+\/?$/u.test(url.pathname)) return null;
    if (url.hostname === "discordapp.com") url.hostname = "discord.com";
    url.search = "";
    url.hash = "";
    return url;
  }
  catch {
    return null;
  }
}

async function deliverOneNotification({ db, fetchImpl, webhookUrl, row, now }) {
  const attempts = Math.max(0, Number(row.attempts) || 0);
  let payload;
  try {
    payload = JSON.parse(String(row.payload_json ?? ""));
  }
  catch {
    await markPermanentFailure(db, row.event_id, attempts + 1, "payload_json_invalid", now);
    return "failed";
  }

  const messageId = String(row.discord_message_id ?? "").trim();
  const requestUrl = new URL(webhookUrl);
  let method = "POST";
  if (messageId) {
    method = "PATCH";
    requestUrl.pathname = `${requestUrl.pathname.replace(/\/$/u, "")}/messages/${encodeURIComponent(messageId)}`;
  }
  else {
    requestUrl.searchParams.set("wait", "true");
  }

  try {
    const response = await fetchWithTimeout(fetchImpl, requestUrl, {
      method,
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    const responseBody = await readJsonSafely(response);
    if (response.ok) {
      const returnedMessageId = messageId || String(responseBody?.id ?? "").trim();
      if (!returnedMessageId) {
        await markRetry(db, row.event_id, attempts + 1, "discord_message_id_missing", now);
        return "retried";
      }
      const sentAt = new Date(now).toISOString();
      await db.prepare(`
        UPDATE discord_earthquake_notifications
        SET status = 'sent', discord_message_id = ?, attempts = ?,
          next_attempt_at = NULL, last_error = NULL, sent_at = ?, updated_at = ?
        WHERE event_id = ?
      `).bind(returnedMessageId, attempts + 1, sentAt, sentAt, row.event_id).run();
      return "sent";
    }

    const errorCode = `discord_http_${response.status}`;
    if (response.status === 404 && messageId) {
      await markDeletedMessageForRepost(db, row.event_id, attempts + 1, now);
      return "retried";
    }
    if (response.status === 429 || response.status >= 500) {
      await markRetry(
        db,
        row.event_id,
        attempts + 1,
        errorCode,
        now,
        responseBody?.retry_after
      );
      return "retried";
    }
    await markPermanentFailure(db, row.event_id, attempts + 1, errorCode, now);
    return "failed";
  }
  catch (error) {
    const errorCode = error?.name === "AbortError"
      ? "discord_timeout"
      : "discord_network_error";
    await markRetry(db, row.event_id, attempts + 1, errorCode, now);
    return "retried";
  }
}

async function markDeletedMessageForRepost(db, eventId, attempts, now) {
  const nextAttemptAt = new Date(now + computeDiscordRetryDelayMs(attempts)).toISOString();
  await db.prepare(`
    UPDATE discord_earthquake_notifications
    SET status = 'retry', discord_message_id = NULL, attempts = ?,
      next_attempt_at = ?, last_error = 'discord_message_not_found', updated_at = ?
    WHERE event_id = ?
  `).bind(
    attempts,
    nextAttemptAt,
    new Date(now).toISOString(),
    eventId
  ).run();
}

async function markRetry(db, eventId, attempts, errorCode, now, retryAfterSeconds = null) {
  if (attempts >= DISCORD_MAX_ATTEMPTS) {
    await markPermanentFailure(db, eventId, attempts, errorCode, now);
    return;
  }
  const nextAttemptAt = new Date(
    now + computeDiscordRetryDelayMs(attempts, retryAfterSeconds)
  ).toISOString();
  await db.prepare(`
    UPDATE discord_earthquake_notifications
    SET status = 'retry', attempts = ?, next_attempt_at = ?,
      last_error = ?, updated_at = ?
    WHERE event_id = ?
  `).bind(
    attempts,
    nextAttemptAt,
    errorCode,
    new Date(now).toISOString(),
    eventId
  ).run();
}

async function markPermanentFailure(db, eventId, attempts, errorCode, now) {
  await db.prepare(`
    UPDATE discord_earthquake_notifications
    SET status = 'failed', attempts = ?, next_attempt_at = NULL,
      last_error = ?, updated_at = ?
    WHERE event_id = ?
  `).bind(attempts, errorCode, new Date(now).toISOString(), eventId).run();
}

async function fetchWithTimeout(fetchImpl, url, init) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DISCORD_FETCH_TIMEOUT_MS);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  }
  finally {
    clearTimeout(timeout);
  }
}

async function readJsonSafely(response) {
  try {
    return await response.json();
  }
  catch {
    return null;
  }
}

function normalizeIsoTimestamp(value, fallback = Date.now()) {
  const timestamp = Date.parse(String(value ?? ""));
  return new Date(Number.isFinite(timestamp) ? timestamp : fallback).toISOString();
}

function formatJstShortDateTime(value) {
  const timestamp = Date.parse(String(value ?? ""));
  if (!Number.isFinite(timestamp)) return "時刻不明";
  const parts = new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(new Date(timestamp));
  const getPart = (type) => parts.find((part) => part.type === type)?.value || "";
  return `${getPart("month")}月${getPart("day")}日 ${getPart("hour")}:${getPart("minute")}`;
}

function formatIntensity(value) {
  const normalized = String(value ?? "").trim();
  return getEarthquakeIntensityLabel(normalized)?.replace(/^震度/u, "")
    || normalized
    || "不明";
}

function formatDepth(depthKm) {
  if (depthKm === 0) return "ごく浅い";
  return `${Math.round(depthKm)}km`;
}

function formatTsunamiText(value) {
  const text = String(value ?? "").replace(/\s+/gu, " ").trim();
  if (!text) return "情報なし";
  if (/津波の心配はありません/u.test(text)) return "津波の心配なし";
  if (/若干の海面変動/u.test(text)) return "若干の海面変動の可能性";
  if (/津波警報等/u.test(text)) return "津波警報等を確認";
  return truncate(text, 1_024);
}

function intensityColor(value) {
  const color = getEarthquakeIntensityColor(String(value ?? "").trim());
  const numeric = Number.parseInt(String(color).replace(/^#/u, ""), 16);
  return Number.isFinite(numeric) ? numeric : 0x4b5563;
}

function truncate(value, maximumLength) {
  const text = String(value ?? "");
  return text.length <= maximumLength
    ? text
    : `${text.slice(0, Math.max(0, maximumLength - 1))}…`;
}
