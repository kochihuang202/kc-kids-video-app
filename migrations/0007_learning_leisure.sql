-- Single-child learning/leisure rules and learned state.

ALTER TABLE categories ADD COLUMN series_type TEXT NOT NULL DEFAULT 'leisure'
  CHECK (series_type IN ('learning', 'leisure'));

UPDATE categories SET series_type = 'learning'
WHERE id IN ('泉靈的語文課(一上)', 'science');

-- Phase 4 uses one shared leisure pool rather than category-specific caps.
UPDATE categories SET daily_limit_seconds = NULL;

ALTER TABLE view_sessions ADD COLUMN playback_mode TEXT NOT NULL DEFAULT 'video'
  CHECK (playback_mode IN ('video', 'listen'));

ALTER TABLE view_sessions ADD COLUMN series_type_snapshot TEXT
  CHECK (series_type_snapshot IS NULL OR series_type_snapshot IN ('learning', 'leisure'));

UPDATE view_sessions
SET series_type_snapshot = COALESCE((
  SELECT c.series_type
  FROM category_videos cv
  JOIN categories c ON c.id = cv.category_id
  WHERE cv.video_id = view_sessions.video_id
  ORDER BY c.sort_order, c.id
  LIMIT 1
), 'leisure');

CREATE TABLE video_learned_state (
  video_id TEXT PRIMARY KEY NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  is_learned INTEGER NOT NULL DEFAULT 0 CHECK (is_learned IN (0, 1)),
  learned_at TEXT,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_categories_series_order
ON categories(series_type, is_active, archived_at, sort_order);

CREATE INDEX idx_view_sessions_mode_time
ON view_sessions(series_type_snapshot, playback_mode, started_at, updated_at);

CREATE INDEX idx_video_learned_active
ON video_learned_state(is_learned, updated_at);

-- Hot-path indexes: content lookups start from a video, while the original
-- category_videos index only supports category-first ordering.
CREATE INDEX idx_category_videos_video_order
ON category_videos(video_id, sort_order, category_id);

CREATE INDEX idx_view_sessions_video_updated
ON view_sessions(video_id, updated_at DESC);

-- Narrow overlap checks search for intervals that ended after the new
-- heartbeat began. The original start-first index reads all older intervals.
CREATE INDEX idx_view_heartbeats_overlap_end
ON view_heartbeats(interval_ended_at, interval_started_at, view_session_id);

-- Access polling reads one compact row. Detailed heartbeat history remains the
-- source of truth and is only scanned once when a day's rollup is missing.
CREATE TABLE daily_usage_totals (
  usage_date TEXT PRIMARY KEY NOT NULL,
  leisure_seconds INTEGER NOT NULL DEFAULT 0 CHECK (leisure_seconds >= 0),
  learning_seconds INTEGER NOT NULL DEFAULT 0 CHECK (learning_seconds >= 0),
  listen_seconds INTEGER NOT NULL DEFAULT 0 CHECK (listen_seconds >= 0),
  total_seconds INTEGER NOT NULL DEFAULT 0 CHECK (total_seconds >= 0),
  updated_at TEXT NOT NULL
);

PRAGMA optimize;
