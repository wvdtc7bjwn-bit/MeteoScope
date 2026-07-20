export const COMMUNITY_REPORT_RETENTION_MS = 5 * 60 * 60 * 1000;
export const COMMUNITY_REPORT_CLEANUP_LIMIT = 200;
export const COMMUNITY_REPORT_CLEANUP_MINUTE_INTERVAL = 5;
export const COMMUNITY_REPORT_COMMENT_MAX_LENGTH = 80;
export const COMMUNITY_REPORT_POST_COOLDOWN_MS = 5 * 60 * 1000;
export const COMMUNITY_REPORT_ACCOUNT_DAILY_LIMIT = 12;
export const COMMUNITY_REPORT_GLOBAL_DAILY_LIMIT = 2400;

export const COMMUNITY_WEATHER_TYPES = Object.freeze([
  "sunny", "cloudy", "light-rain", "heavy-rain", "snow", "thunder", "fog"
]);
export const COMMUNITY_SENSATIONS = Object.freeze([
  "cold", "cool", "comfortable", "hot", "very-hot"
]);
export const COMMUNITY_HAZARDS = Object.freeze([
  "flooded-road", "strong-wind", "poor-visibility", "thunder", "slippery"
]);

export function normalizeCommunityReportInput(payload) {
  const weather = String(payload?.weather ?? "");
  if (!COMMUNITY_WEATHER_TYPES.includes(weather)) return { error: "天気の選択が正しくありません。" };
  const sensation = payload?.sensation == null || payload.sensation === "" ? null : String(payload.sensation);
  if (sensation && !COMMUNITY_SENSATIONS.includes(sensation)) return { error: "体感の選択が正しくありません。" };
  const hazards = [...new Set(Array.isArray(payload?.hazards) ? payload.hazards.map(String) : [])];
  if (hazards.length > 3 || hazards.some((hazard) => !COMMUNITY_HAZARDS.includes(hazard))) {
    return { error: "危険情報の選択が正しくありません。" };
  }
  const commentResult = normalizeCommunityReportComment(payload?.comment);
  if (commentResult.error) return commentResult;
  const latitude = Number(payload?.latitude);
  const longitude = Number(payload?.longitude);
  if (!Number.isFinite(latitude) || latitude < 20 || latitude > 50 ||
      !Number.isFinite(longitude) || longitude < 120 || longitude > 155) {
    return { error: "投稿地点が日本付近の範囲外です。" };
  }
  let temperatureTenths = null;
  if (payload?.temperature != null && payload.temperature !== "") {
    const temperature = Number(payload.temperature);
    if (!Number.isFinite(temperature) || temperature < -50 || temperature > 60) {
      return { error: "気温は-50〜60℃の範囲で入力してください。" };
    }
    temperatureTenths = Math.round(temperature * 10);
  }
  const areaCode = String(payload?.areaCode ?? "").trim();
  const areaName = String(payload?.areaName ?? "").trim().slice(0, 40);
  if (areaCode && !/^\d{5,7}$/u.test(areaCode)) return { error: "地域コードが正しくありません。" };
  if (!areaName) return { error: "地域名を確認できません。" };
  return {
    weather,
    comment: commentResult.comment,
    sensation,
    temperatureTenths,
    hazards,
    latitude: roundCommunityCoordinate(latitude),
    longitude: roundCommunityCoordinate(longitude),
    areaCode,
    areaName
  };
}

export function normalizeCommunityReportComment(value) {
  const comment = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  if (!comment) return { comment: null };
  if ([...comment].length > COMMUNITY_REPORT_COMMENT_MAX_LENGTH) {
    return { error: `文章は${COMMUNITY_REPORT_COMMENT_MAX_LENGTH}文字以内で入力してください。` };
  }
  if (/(?:https?:\/\/|www\.|[a-z0-9-]+\.(?:com|net|org|jp)(?:\/|\s|$))/iu.test(comment)) {
    return { error: "文章にURLは入力できません。" };
  }
  return { comment };
}

export function roundCommunityCoordinate(value) {
  return Number((Math.round(Number(value) / 0.02) * 0.02).toFixed(4));
}

export async function insertCommunityReportWithQuota(db, report) {
  const results = await db.batch([
    db.prepare(
      `INSERT INTO community_post_totals
       (activity_date, post_count, expires_at, last_reservation_id)
       VALUES (?1, 1, ?2, ?3)
       ON CONFLICT(activity_date) DO UPDATE SET
         post_count = community_post_totals.post_count + 1,
         expires_at = excluded.expires_at,
         last_reservation_id = excluded.last_reservation_id
       WHERE community_post_totals.post_count < ${COMMUNITY_REPORT_GLOBAL_DAILY_LIMIT}`
    ).bind(report.activityDate, report.counterExpiresAt, report.id),
    db.prepare(
      `INSERT INTO community_post_daily
       (account_id, activity_date, post_count, expires_at, last_reservation_id)
       SELECT ?1, ?2, 1, ?3, ?4
       WHERE EXISTS (
         SELECT 1 FROM community_post_totals
         WHERE activity_date = ?2 AND last_reservation_id = ?4
       )
       ON CONFLICT(account_id, activity_date) DO UPDATE SET
         post_count = community_post_daily.post_count + 1,
         expires_at = excluded.expires_at,
         last_reservation_id = excluded.last_reservation_id
       WHERE community_post_daily.post_count < ${COMMUNITY_REPORT_ACCOUNT_DAILY_LIMIT}`
    ).bind(report.accountID, report.activityDate, report.counterExpiresAt, report.id),
    db.prepare(
      `INSERT INTO community_reports
       (id, account_id, weather, comment, sensation, temperature_tenths, hazards_json,
        latitude, longitude, area_code, area_name, created_at, expires_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13
       WHERE EXISTS (
         SELECT 1 FROM community_post_totals
         WHERE activity_date = ?14 AND last_reservation_id = ?1
       ) AND EXISTS (
         SELECT 1 FROM community_post_daily
         WHERE account_id = ?2 AND activity_date = ?14 AND last_reservation_id = ?1
       )`
    ).bind(
      report.id, report.accountID, report.weather, report.comment, report.sensation,
      report.temperatureTenths, report.hazardsJSON, report.latitude, report.longitude,
      report.areaCode, report.areaName, report.createdAt, report.expiresAt, report.activityDate
    ),
    db.prepare(
      `UPDATE community_post_totals
       SET post_count = MAX(0, post_count - 1), last_reservation_id = NULL
       WHERE activity_date = ?1 AND last_reservation_id = ?2
         AND NOT EXISTS (SELECT 1 FROM community_reports WHERE id = ?2)`
    ).bind(report.activityDate, report.id)
  ]);
  return Number(results?.[2]?.meta?.changes || results?.[2]?.changes || 0) > 0;
}

export async function cleanupExpiredCommunityReports(db, now = new Date()) {
  if (!db || now.getUTCMinutes() % COMMUNITY_REPORT_CLEANUP_MINUTE_INTERVAL !== 0) {
    return { ran: false, deleted: 0 };
  }
  const [reportResult, counterResult, totalResult] = await db.batch([
    db.prepare(
      `DELETE FROM community_reports
       WHERE id IN (
         SELECT id FROM community_reports
         WHERE expires_at <= ?1
         ORDER BY expires_at
         LIMIT ${COMMUNITY_REPORT_CLEANUP_LIMIT}
       )`
    ).bind(now.toISOString()),
    db.prepare("DELETE FROM community_post_daily WHERE expires_at <= ?1").bind(now.toISOString()),
    db.prepare("DELETE FROM community_post_totals WHERE expires_at <= ?1").bind(now.toISOString())
  ]);
  return {
    ran: true,
    deleted: Number(reportResult?.meta?.changes || reportResult?.changes || 0),
    countersDeleted: Number(counterResult?.meta?.changes || counterResult?.changes || 0),
    totalsDeleted: Number(totalResult?.meta?.changes || totalResult?.changes || 0)
  };
}

export async function readCommunityReportOperationalMetrics(env, now = new Date()) {
  if (!env?.NOTIFICATIONS_DB) return { configured: false };
  const activityDate = now.toISOString().slice(0, 10);
  try {
    const [activeReports, activeAccounts, dailyTotal] = await env.NOTIFICATIONS_DB.batch([
      env.NOTIFICATIONS_DB.prepare(
        "SELECT COUNT(*) AS count FROM community_reports WHERE expires_at > ?1"
      ).bind(now.toISOString()),
      env.NOTIFICATIONS_DB.prepare(
        "SELECT COUNT(*) AS count FROM community_post_daily WHERE activity_date = ?1 AND post_count > 0"
      ).bind(activityDate),
      env.NOTIFICATIONS_DB.prepare(
        "SELECT post_count FROM community_post_totals WHERE activity_date = ?1"
      ).bind(activityDate)
    ]);
    return {
      configured: true,
      activeReports: Number(activeReports?.results?.[0]?.count || 0),
      activeAccounts: Number(activeAccounts?.results?.[0]?.count || 0),
      postsToday: Number(dailyTotal?.results?.[0]?.post_count || 0),
      accountDailyLimit: COMMUNITY_REPORT_ACCOUNT_DAILY_LIMIT,
      globalDailyLimit: COMMUNITY_REPORT_GLOBAL_DAILY_LIMIT
    };
  } catch (error) {
    return {
      configured: true,
      migrationRequired: /community_post_totals|last_reservation_id|no such table|no such column/iu.test(String(error?.message || error))
    };
  }
}

export function publicCommunityReport(row) {
  let hazards = [];
  try { hazards = JSON.parse(String(row?.hazards_json || "[]")); } catch { hazards = []; }
  return {
    id: String(row?.id || ""),
    displayName: String(row?.display_name || ""),
    weather: String(row?.weather || ""),
    comment: row?.comment ? String(row.comment) : null,
    sensation: row?.sensation ? String(row.sensation) : null,
    temperature: row?.temperature_tenths == null ? null : Number(row.temperature_tenths) / 10,
    hazards: Array.isArray(hazards) ? hazards : [],
    latitude: Number(row?.latitude),
    longitude: Number(row?.longitude),
    areaCode: String(row?.area_code || ""),
    areaName: String(row?.area_name || ""),
    createdAt: String(row?.created_at || ""),
    expiresAt: String(row?.expires_at || ""),
    isOwn: Boolean(row?.is_own)
  };
}
