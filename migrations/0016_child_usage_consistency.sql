-- Keep per-child quota displays and enforcement on the same daily rollups.

CREATE TABLE child_category_daily_usage (
  child_id TEXT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  usage_date TEXT NOT NULL,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  video_seconds INTEGER NOT NULL DEFAULT 0 CHECK (video_seconds >= 0),
  listen_seconds INTEGER NOT NULL DEFAULT 0 CHECK (listen_seconds >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (child_id, usage_date, category_id)
);

CREATE INDEX idx_child_category_daily_usage_category_date
ON child_category_daily_usage(child_id, category_id, usage_date);

-- Existing per-child rollups may have inherited account-wide overlap
-- deductions. They are derived caches, so discard them and let the Worker
-- rebuild exact child totals from the preserved Sessions and Heartbeats.
DELETE FROM child_daily_usage;

-- Migration 0015 used the old category id "favorite". Repair the copy using
-- the current system category id without changing the original memberships.
INSERT OR IGNORE INTO child_favorites (child_id, video_id, sort_order, created_at)
SELECT 'child_ayun', video_id, sort_order, created_at
FROM category_videos
WHERE category_id = 'learning-favorites';

PRAGMA optimize;
