CREATE TABLE IF NOT EXISTS diagnostic_sessions (
  id TEXT PRIMARY KEY,
  client_session_id TEXT NOT NULL,
  device_id TEXT NOT NULL REFERENCES child_devices(id),
  device_name_snapshot TEXT NOT NULL,
  video_id TEXT REFERENCES videos(id),
  video_label_snapshot TEXT,
  category_id TEXT,
  source TEXT NOT NULL CHECK (source IN ('youtube', 'self_hosted')),
  playback_mode TEXT NOT NULL CHECK (playback_mode IN ('video', 'listen')),
  outcome TEXT NOT NULL DEFAULT 'open' CHECK (outcome IN ('open', 'success', 'recovered', 'error')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error_code TEXT,
  first_play_ms INTEGER,
  user_agent TEXT NOT NULL,
  platform TEXT,
  browser_name TEXT,
  browser_version TEXT,
  os_name TEXT,
  os_version TEXT,
  viewport_width INTEGER,
  viewport_height INTEGER,
  is_standalone INTEGER NOT NULL DEFAULT 0,
  network_type TEXT,
  ip_prefix TEXT,
  ip_hash TEXT,
  country TEXT,
  colo TEXT,
  http_protocol TEXT,
  tls_version TEXT,
  started_at TEXT NOT NULL,
  first_play_at TEXT,
  ended_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE(device_id, client_session_id)
);

CREATE TABLE IF NOT EXISTS diagnostic_events (
  diagnostic_session_id TEXT NOT NULL REFERENCES diagnostic_sessions(id) ON DELETE CASCADE,
  event_seq INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  received_at TEXT NOT NULL,
  position_seconds REAL,
  error_code TEXT,
  detail_json TEXT,
  PRIMARY KEY (diagnostic_session_id, event_seq)
);

CREATE TABLE IF NOT EXISTS diagnostic_error_rollups (
  day TEXT NOT NULL,
  device_id TEXT NOT NULL,
  source TEXT NOT NULL,
  error_code TEXT NOT NULL,
  occurrence_count INTEGER NOT NULL,
  session_count INTEGER NOT NULL,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (day, device_id, source, error_code)
);

CREATE TABLE IF NOT EXISTS diagnostic_maintenance (
  id TEXT PRIMARY KEY CHECK (id = 'retention'),
  last_run_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_device_started
  ON diagnostic_sessions(device_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_outcome_started
  ON diagnostic_sessions(outcome, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_sessions_source_started
  ON diagnostic_sessions(source, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_diagnostic_events_error_received
  ON diagnostic_events(error_code, received_at DESC) WHERE error_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_diagnostic_rollups_day
  ON diagnostic_error_rollups(day DESC, device_id);

INSERT OR IGNORE INTO diagnostic_maintenance (id, last_run_at)
VALUES ('retention', '1970-01-01T00:00:00.000Z');
