-- Keep listening activity visible without making it consume viewing limits.
-- video_seconds remains the category-limit counter; listen_seconds is display/statistics only.

ALTER TABLE daily_category_usage_totals
ADD COLUMN listen_seconds INTEGER NOT NULL DEFAULT 0 CHECK (listen_seconds >= 0);

-- Best-effort history backfill. Heartbeats are idempotent, so each stored row is counted once.
UPDATE daily_category_usage_totals
SET listen_seconds = COALESCE((
  SELECT SUM(h.delta_seconds)
  FROM view_heartbeats h
  JOIN view_sessions s ON s.id = h.view_session_id
  JOIN category_videos cv ON cv.video_id = s.video_id
  WHERE cv.category_id = daily_category_usage_totals.category_id
    AND COALESCE(s.playback_mode, 'video') = 'listen'
    AND date(COALESCE(h.interval_ended_at, h.received_at), '+8 hours') = daily_category_usage_totals.usage_date
), 0);

INSERT INTO daily_category_usage_totals (
  usage_date, category_id, video_seconds, listen_seconds, updated_at
)
SELECT
  date(COALESCE(h.interval_ended_at, h.received_at), '+8 hours'),
  cv.category_id,
  0,
  SUM(h.delta_seconds),
  MAX(h.received_at)
FROM view_heartbeats h
JOIN view_sessions s ON s.id = h.view_session_id
JOIN category_videos cv ON cv.video_id = s.video_id
WHERE COALESCE(s.playback_mode, 'video') = 'listen'
GROUP BY date(COALESCE(h.interval_ended_at, h.received_at), '+8 hours'), cv.category_id
ON CONFLICT(usage_date, category_id) DO UPDATE SET
  listen_seconds = excluded.listen_seconds,
  updated_at = excluded.updated_at;

-- Learning-series listening is both learning activity and listening activity.
-- Cap the best-effort backfill at total unique activity for the day.
UPDATE daily_usage_totals
SET learning_seconds = MIN(total_seconds, MAX(learning_seconds, COALESCE((
  SELECT SUM(h.delta_seconds)
  FROM view_heartbeats h
  JOIN view_sessions s ON s.id = h.view_session_id
  WHERE s.series_type_snapshot = 'learning'
    AND date(COALESCE(h.interval_ended_at, h.received_at), '+8 hours') = daily_usage_totals.usage_date
), 0)));

PRAGMA optimize;
