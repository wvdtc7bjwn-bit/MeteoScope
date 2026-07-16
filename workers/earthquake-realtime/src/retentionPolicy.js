export const EARTHQUAKE_D1_RETENTION = Object.freeze({
  label: "1 month",
  sqliteModifier: "-1 month"
});

export const TSUNAMI_D1_RETENTION = Object.freeze({
  label: "90 days",
  sqliteModifier: "-90 days"
});

export async function cleanupExpiredD1EarthquakeData(db) {
  if (!db) {
    return null;
  }

  const runDelete = async (sql, ...params) => {
    const result = await db.prepare(sql).bind(...params).run();
    return Number(result?.meta?.changes ?? 0);
  };

  const oldEarthquakeWhere = `
    datetime(COALESCE(origin_time, updated_at, created_at)) <= datetime('now', ?)
  `;

  // Delete dependent station rows first so old earthquakes never leave orphans.
  const deletedStationByEarthquake = await runDelete(`
    DELETE FROM station_intensities
    WHERE event_id IN (
      SELECT event_id
      FROM earthquake_history
      WHERE ${oldEarthquakeWhere}
    )
  `, EARTHQUAKE_D1_RETENTION.sqliteModifier);

  const deletedOldStations = await runDelete(`
    DELETE FROM station_intensities
    WHERE datetime(COALESCE(updated_at, '1970-01-01T00:00:00Z')) <= datetime('now', ?)
  `, EARTHQUAKE_D1_RETENTION.sqliteModifier);

  const deletedEarthquakes = await runDelete(`
    DELETE FROM earthquake_history
    WHERE ${oldEarthquakeWhere}
  `, EARTHQUAKE_D1_RETENTION.sqliteModifier);

  const deletedTsunamis = await runDelete(`
    DELETE FROM tsunami_history
    WHERE datetime(COALESCE(issue_time, updated_at, created_at)) < datetime('now', ?)
  `, TSUNAMI_D1_RETENTION.sqliteModifier);

  return {
    earthquakeHistoryRetention: EARTHQUAKE_D1_RETENTION.label,
    stationIntensityRetention: EARTHQUAKE_D1_RETENTION.label,
    tsunamiHistoryRetention: TSUNAMI_D1_RETENTION.label,
    deleted: {
      stationByEarthquake: deletedStationByEarthquake,
      stationByUpdatedAt: deletedOldStations,
      earthquakeHistory: deletedEarthquakes,
      tsunamiHistory: deletedTsunamis
    }
  };
}
