PRAGMA foreign_keys = OFF;

ALTER TABLE notes RENAME TO notes_phase1a;
ALTER TABLE view_sessions RENAME TO view_sessions_phase1a;

CREATE TABLE categories (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  icon TEXT NOT NULL DEFAULT '✨',
  image_url TEXT,
  tone TEXT NOT NULL CHECK (tone IN ('sage', 'sky', 'apricot')),
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  archived_at TEXT
);

CREATE TABLE videos (
  id TEXT PRIMARY KEY NOT NULL,
  source TEXT NOT NULL DEFAULT 'youtube' CHECK (source IN ('youtube', 'self_hosted')),
  youtube_video_id TEXT,
  youtube_url TEXT,
  youtube_title TEXT NOT NULL DEFAULT '',
  parent_label TEXT NOT NULL CHECK (length(parent_label) BETWEEN 1 AND 120),
  thumbnail_url TEXT NOT NULL DEFAULT '',
  duration_seconds INTEGER CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
  availability_status TEXT NOT NULL DEFAULT 'available'
    CHECK (availability_status IN ('available', 'unavailable', 'private', 'not_embeddable', 'metadata_error')),
  metadata_error TEXT,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT,
  CHECK (source != 'youtube' OR youtube_video_id IS NOT NULL)
);

CREATE TABLE category_videos (
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  created_at TEXT NOT NULL,
  PRIMARY KEY (category_id, video_id)
);

CREATE TABLE child_devices (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  created_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE view_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  client_session_id TEXT,
  video_id TEXT NOT NULL,
  child_device_id TEXT REFERENCES child_devices(id),
  write_token_hash TEXT,
  played_seconds INTEGER NOT NULL DEFAULT 0 CHECK (played_seconds >= 0),
  last_position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (last_position_seconds >= 0),
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_heartbeat_at TEXT,
  ended_at TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'ended', 'stale')),
  last_heartbeat_seq INTEGER NOT NULL DEFAULT 0 CHECK (last_heartbeat_seq >= 0)
);

CREATE TABLE view_heartbeats (
  id TEXT PRIMARY KEY NOT NULL,
  view_session_id TEXT NOT NULL REFERENCES view_sessions(id) ON DELETE CASCADE,
  heartbeat_seq INTEGER NOT NULL CHECK (heartbeat_seq >= 1),
  delta_seconds INTEGER NOT NULL CHECK (delta_seconds BETWEEN 0 AND 60),
  position_seconds INTEGER NOT NULL CHECK (position_seconds >= 0),
  interval_started_at TEXT,
  interval_ended_at TEXT,
  received_at TEXT NOT NULL,
  UNIQUE (view_session_id, heartbeat_seq)
);

CREATE TABLE notes (
  id TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL,
  view_session_id TEXT REFERENCES view_sessions(id),
  content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 4000),
  video_position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (video_position_seconds >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TEXT
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE admin_credentials (
  id TEXT PRIMARY KEY NOT NULL CHECK (id = 'family'),
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  iterations INTEGER NOT NULL CHECK (iterations >= 100000),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE admin_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  revoked_at TEXT
);

CREATE TABLE rate_limit_buckets (
  bucket_key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL DEFAULT 0 CHECK (count >= 0),
  window_started_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE UNIQUE INDEX idx_videos_youtube_id
ON videos(youtube_video_id)
WHERE source = 'youtube' AND youtube_video_id IS NOT NULL;

CREATE INDEX idx_categories_public_order
ON categories(is_active, archived_at, sort_order);

CREATE INDEX idx_videos_public_status
ON videos(is_active, archived_at, availability_status, updated_at);

CREATE INDEX idx_category_videos_order
ON category_videos(category_id, sort_order);

CREATE UNIQUE INDEX idx_view_sessions_client_id
ON view_sessions(client_session_id)
WHERE client_session_id IS NOT NULL;

CREATE INDEX idx_view_sessions_time
ON view_sessions(started_at, updated_at);

CREATE INDEX idx_view_sessions_device
ON view_sessions(child_device_id, started_at);

CREATE INDEX idx_view_heartbeats_received
ON view_heartbeats(received_at, view_session_id);

CREATE INDEX idx_view_heartbeats_interval
ON view_heartbeats(interval_started_at, interval_ended_at);

CREATE INDEX idx_notes_today
ON notes(created_at, deleted_at);

CREATE INDEX idx_notes_session
ON notes(view_session_id);

CREATE INDEX idx_admin_sessions_expiry
ON admin_sessions(expires_at, revoked_at);

CREATE INDEX idx_child_devices_active
ON child_devices(revoked_at, last_used_at);

CREATE INDEX idx_rate_limit_expiry
ON rate_limit_buckets(expires_at);

INSERT INTO categories (id, name, icon, image_url, tone, sort_order, is_active, created_at, updated_at)
VALUES
  ('science', '科學', '🚀', NULL, 'sky', 1, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('english', '英文', 'ABC', NULL, 'apricot', 2, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('animals', '動物', '🐾', NULL, 'sage', 3, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO videos (
  id, source, youtube_video_id, youtube_url, youtube_title, parent_label,
  thumbnail_url, duration_seconds, availability_status, is_active, created_at, updated_at
)
VALUES
  ('why-sky-blue', 'youtube', 'bcVr13Fw7w8', 'https://www.youtube.com/watch?v=bcVr13Fw7w8', 'Why Is the Sky Blue? | Physics for Kids', '天空為什麼是藍色？', 'https://i.ytimg.com/vi/bcVr13Fw7w8/hqdefault.jpg', NULL, 'available', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('big-story-dinosaurs', 'youtube', 'UOOkup9xigs', 'https://www.youtube.com/watch?v=UOOkup9xigs', 'The Very Big Story of the Dinosaurs | SciShow Kids Compilation', '恐龍的故事', 'https://i.ytimg.com/vi/UOOkup9xigs/hqdefault.jpg', NULL, 'available', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('elmo-alphabet', 'youtube', 'Xn5PnwGUYhc', 'https://www.youtube.com/watch?v=Xn5PnwGUYhc', 'Sesame Street: Alphabet | Elmo''s World', 'Elmo 的字母世界', 'https://i.ytimg.com/vi/Xn5PnwGUYhc/hqdefault.jpg', NULL, 'available', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('usher-abc', 'youtube', 'SWvBAQf7v8g', 'https://www.youtube.com/watch?v=SWvBAQf7v8g', 'Sesame Street: Usher''s ABC Song', '跟著 Usher 唱 ABC', 'https://i.ytimg.com/vi/SWvBAQf7v8g/hqdefault.jpg', NULL, 'available', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('blue-whale', 'youtube', 'dciLg3Zm1hI', 'https://www.youtube.com/watch?v=dciLg3Zm1hI', 'Blue Whale | Amazing Animals', '藍鯨有多大？', 'https://i.ytimg.com/vi/dciLg3Zm1hI/hqdefault.jpg', NULL, 'available', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('cheetah', 'youtube', 'J20eXhZTHEo', 'https://www.youtube.com/watch?v=J20eXhZTHEo', 'Cheetah | Amazing Animals', '獵豹跑多快？', 'https://i.ytimg.com/vi/J20eXhZTHEo/hqdefault.jpg', NULL, 'available', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
VALUES
  ('science', 'why-sky-blue', 1, CURRENT_TIMESTAMP),
  ('science', 'big-story-dinosaurs', 2, CURRENT_TIMESTAMP),
  ('english', 'elmo-alphabet', 1, CURRENT_TIMESTAMP),
  ('english', 'usher-abc', 2, CURRENT_TIMESTAMP),
  ('animals', 'blue-whale', 1, CURRENT_TIMESTAMP),
  ('animals', 'cheetah', 2, CURRENT_TIMESTAMP);

INSERT INTO settings (key, value_json, updated_at)
VALUES
  ('timezone', '"Asia/Taipei"', CURRENT_TIMESTAMP),
  ('player', '{"autoplay":false,"relatedVideos":false}', CURRENT_TIMESTAMP),
  ('parent', '{"sessionHours":12}', CURRENT_TIMESTAMP);

INSERT INTO view_sessions (
  id, video_id, played_seconds, last_position_seconds, started_at, updated_at,
  status, last_heartbeat_seq
)
SELECT id, video_id, played_seconds, last_position_seconds, started_at, updated_at,
  'ended', 0
FROM view_sessions_phase1a;

INSERT INTO notes (
  id, video_id, content, video_position_seconds, created_at, updated_at
)
SELECT id, video_id, content, video_position_seconds, created_at, created_at
FROM notes_phase1a;

DROP TABLE notes_phase1a;
DROP TABLE view_sessions_phase1a;

PRAGMA foreign_keys = ON;
PRAGMA optimize;
