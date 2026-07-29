CREATE TABLE IF NOT EXISTS jma_xml_hypocenters (
  event_id TEXT PRIMARY KEY,
  source_date TEXT NOT NULL,
  origin_time TEXT,
  report_time TEXT NOT NULL,
  latitude REAL,
  longitude REAL,
  depth_km REAL,
  magnitude REAL,
  place TEXT,
  xml_code TEXT NOT NULL,
  source_url TEXT NOT NULL,
  report_priority INTEGER NOT NULL DEFAULT 0,
  info_type TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_jma_xml_hypocenters_date
ON jma_xml_hypocenters(source_date, active, origin_time);

CREATE TABLE IF NOT EXISTS jma_xml_feed_entries (
  entry_url TEXT PRIMARY KEY,
  entry_updated TEXT,
  source_date TEXT NOT NULL,
  xml_code TEXT NOT NULL,
  event_id TEXT,
  status TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  error TEXT
);

CREATE INDEX IF NOT EXISTS idx_jma_xml_feed_entries_date
ON jma_xml_feed_entries(source_date, status);
