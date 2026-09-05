CREATE TABLE offline_video_views (
  child_device_id TEXT NOT NULL REFERENCES child_devices(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  playback_mode TEXT NOT NULL DEFAULT 'video' CHECK (playback_mode IN ('video', 'listen')),
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  PRIMARY KEY (child_device_id, video_id)
);

CREATE INDEX idx_offline_video_views_last_seen
ON offline_video_views(last_seen_at DESC);

CREATE INDEX idx_offline_video_views_video_seen
ON offline_video_views(video_id, last_seen_at DESC);
