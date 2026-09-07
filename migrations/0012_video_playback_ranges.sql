ALTER TABLE videos ADD COLUMN playback_start_seconds INTEGER NOT NULL DEFAULT 0 CHECK (playback_start_seconds >= 0);
ALTER TABLE videos ADD COLUMN playback_end_seconds INTEGER CHECK (playback_end_seconds IS NULL OR playback_end_seconds > 0);
