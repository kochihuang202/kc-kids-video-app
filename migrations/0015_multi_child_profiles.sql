-- Phase Multi-Child: Profiles for Ayun and Ahan, independent quotas, learned states, and favorites

CREATE TABLE IF NOT EXISTS child_profiles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  avatar TEXT NOT NULL DEFAULT '🦁',
  tone TEXT NOT NULL DEFAULT 'sky' CHECK (tone IN ('sage', 'sky', 'apricot')),
  weekday_limit_seconds INTEGER NOT NULL DEFAULT 2400 CHECK (weekday_limit_seconds >= 0),
  weekend_limit_seconds INTEGER NOT NULL DEFAULT 3600 CHECK (weekend_limit_seconds >= 0),
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS child_video_learned (
  child_id TEXT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  is_learned INTEGER NOT NULL DEFAULT 0 CHECK (is_learned IN (0, 1)),
  learned_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (child_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_child_video_learned_active
ON child_video_learned(child_id, is_learned, updated_at);

CREATE TABLE IF NOT EXISTS child_favorites (
  child_id TEXT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (child_id, video_id)
);

CREATE INDEX IF NOT EXISTS idx_child_favorites_order
ON child_favorites(child_id, sort_order, created_at);

CREATE TABLE IF NOT EXISTS child_daily_usage (
  child_id TEXT NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  usage_date TEXT NOT NULL,
  total_played_seconds INTEGER NOT NULL DEFAULT 0 CHECK (total_played_seconds >= 0),
  leisure_seconds INTEGER NOT NULL DEFAULT 0 CHECK (leisure_seconds >= 0),
  learning_seconds INTEGER NOT NULL DEFAULT 0 CHECK (learning_seconds >= 0),
  video_seconds INTEGER NOT NULL DEFAULT 0 CHECK (video_seconds >= 0),
  listen_seconds INTEGER NOT NULL DEFAULT 0 CHECK (listen_seconds >= 0),
  bonus_seconds INTEGER NOT NULL DEFAULT 0 CHECK (bonus_seconds >= 0),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (child_id, usage_date)
);

CREATE INDEX IF NOT EXISTS idx_child_daily_usage_date
ON child_daily_usage(usage_date, child_id);

ALTER TABLE view_sessions ADD COLUMN child_id TEXT REFERENCES child_profiles(id);

CREATE INDEX IF NOT EXISTS idx_view_sessions_child_video
ON view_sessions(child_id, video_id, updated_at DESC);

ALTER TABLE child_devices ADD COLUMN default_child_id TEXT REFERENCES child_profiles(id);

-- Insert default profiles: 阿云 (elder) and 阿涵 (younger)
INSERT OR IGNORE INTO child_profiles (id, name, avatar, tone, weekday_limit_seconds, weekend_limit_seconds, sort_order, is_active, created_at, updated_at)
VALUES
  ('child_ayun', '阿云', '🦁', 'sky', 2400, 3600, 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('child_ahan', '阿涵', '🐰', 'apricot', 1500, 2100, 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Migrate existing learned state to 阿云
INSERT OR IGNORE INTO child_video_learned (child_id, video_id, is_learned, learned_at, updated_at)
SELECT 'child_ayun', video_id, is_learned, learned_at, updated_at
FROM video_learned_state;

-- Migrate existing favorites to 阿云
INSERT OR IGNORE INTO child_favorites (child_id, video_id, sort_order, created_at)
SELECT 'child_ayun', video_id, sort_order, created_at
FROM category_videos
WHERE category_id = 'favorite';

-- Migrate existing view_sessions to 阿云
UPDATE view_sessions
SET child_id = 'child_ayun'
WHERE child_id IS NULL;
