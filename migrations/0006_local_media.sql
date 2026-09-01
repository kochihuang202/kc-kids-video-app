-- Local media support: the binary files stay on the family Mac and are served
-- over Tailscale. D1 stores stable relative paths only.

ALTER TABLE videos ADD COLUMN media_type TEXT
  CHECK (media_type IS NULL OR media_type IN ('video', 'audio'));
ALTER TABLE videos ADD COLUMN media_path TEXT;
ALTER TABLE videos ADD COLUMN thumbnail_path TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_self_hosted_media_path
ON videos(media_path)
WHERE source = 'self_hosted' AND media_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_videos_source_active
ON videos(source, is_active, archived_at, availability_status);
