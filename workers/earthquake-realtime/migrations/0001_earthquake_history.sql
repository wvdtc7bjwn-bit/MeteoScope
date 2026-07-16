CREATE TABLE IF NOT EXISTS earthquake_history (
  event_id TEXT PRIMARY KEY,
  telegram_type TEXT,
  report_number TEXT,
  place TEXT,
  origin_time TEXT,
  magnitude TEXT,
  depth TEXT,
  max_intensity TEXT,
  max_scale INTEGER,
  long_period_intensity TEXT,
  tsunami_status TEXT,
  latitude REAL,
  longitude REAL,
  regions_json TEXT,
  updated_at TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_earthquake_history_origin_time
  ON earthquake_history(origin_time DESC);

CREATE TABLE IF NOT EXISTS station_intensities (
  event_id TEXT NOT NULL,
  station_code TEXT NOT NULL,
  station_name TEXT,
  intensity TEXT,
  scale INTEGER,
  latitude REAL,
  longitude REAL,
  updated_at TEXT,
  PRIMARY KEY (event_id, station_code)
);

CREATE INDEX IF NOT EXISTS idx_station_intensities_event_id
  ON station_intensities(event_id);

CREATE TABLE IF NOT EXISTS tsunami_history (
  event_id TEXT PRIMARY KEY,
  telegram_type TEXT,
  issue_time TEXT,
  revoked INTEGER,
  areas_json TEXT,
  observations_json TEXT,
  estimations_json TEXT,
  comments_json TEXT,
  updated_at TEXT,
  created_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_tsunami_history_issue_time
  ON tsunami_history(issue_time DESC);

CREATE TABLE IF NOT EXISTS meteoscope_worker_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL
);
