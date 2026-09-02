-- Restore per-category daily viewing limits without rescanning heartbeat history
-- on every child access-state poll. Listening never consumes a category cap.

CREATE TABLE daily_category_usage_totals (
  usage_date TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  video_seconds INTEGER NOT NULL DEFAULT 0 CHECK (video_seconds >= 0),
  updated_at TEXT NOT NULL,
  PRIMARY KEY (usage_date, category_id)
);

CREATE INDEX idx_daily_category_usage_category_date
ON daily_category_usage_totals(category_id, usage_date);

-- One-time best-effort backfill for existing history. New heartbeats maintain
-- exact idempotent rollups through the Worker.
INSERT INTO daily_category_usage_totals (usage_date, category_id, video_seconds, updated_at)
SELECT
  date(COALESCE(h.interval_ended_at, h.received_at), '+8 hours'),
  cv.category_id,
  SUM(h.delta_seconds),
  MAX(h.received_at)
FROM view_heartbeats h
JOIN view_sessions s ON s.id = h.view_session_id
JOIN category_videos cv ON cv.video_id = s.video_id
WHERE COALESCE(s.playback_mode, 'video') = 'video'
GROUP BY date(COALESCE(h.interval_ended_at, h.received_at), '+8 hours'), cv.category_id
ON CONFLICT(usage_date, category_id) DO UPDATE SET
  video_seconds = excluded.video_seconds,
  updated_at = excluded.updated_at;

PRAGMA optimize;
