export async function readJson(db, key, fallback) {
  if (!db) return fallback;
  const row = await db.prepare("SELECT value FROM app_records WHERE key = ?").bind(key).first();
  if (!row?.value) return fallback;
  try { return JSON.parse(row.value); } catch { return fallback; }
}

export async function writeJson(db, key, value) {
  requireD1(db);
  await db.prepare(
    `INSERT INTO app_records (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
  ).bind(key, JSON.stringify(value), new Date().toISOString()).run();
}

export async function deleteJson(db, key) {
  requireD1(db);
  const result = await db.prepare("DELETE FROM app_records WHERE key = ?").bind(key).run();
  return Math.max(0, Number(result?.meta?.changes ?? result?.changes) || 0);
}

export function requireD1(db) {
  if (!db) throw new Error("NOTIFICATIONS_DB is not configured.");
  return db;
}
