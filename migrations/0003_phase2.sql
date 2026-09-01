-- Phase 2 migration: health status, metadata timestamps, annotations, settings, and indexes

ALTER TABLE videos ADD COLUMN health_status TEXT NOT NULL DEFAULT 'healthy';
ALTER TABLE videos ADD COLUMN last_health_check_at TEXT;
ALTER TABLE videos ADD COLUMN metadata_synced_at TEXT;

ALTER TABLE notes ADD COLUMN parent_annotation TEXT;

INSERT OR IGNORE INTO settings (key, value_json, updated_at)
VALUES ('playback', '{"completionThreshold":0.9,"recentLimit":8}', CURRENT_TIMESTAMP);

CREATE INDEX IF NOT EXISTS idx_view_sessions_recent ON view_sessions(child_device_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_created ON notes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_health ON videos(health_status, is_active);
CREATE INDEX IF NOT EXISTS idx_view_sessions_video_recent ON view_sessions(video_id, started_at DESC);
