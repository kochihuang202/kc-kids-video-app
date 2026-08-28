CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL,
  content TEXT NOT NULL,
  video_position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (video_position_seconds >= 0),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_notes_created_at
ON notes(created_at);

CREATE TABLE IF NOT EXISTS view_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  video_id TEXT NOT NULL,
  played_seconds INTEGER NOT NULL DEFAULT 0 CHECK (played_seconds >= 0),
  last_position_seconds INTEGER NOT NULL DEFAULT 0 CHECK (last_position_seconds >= 0),
  started_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_view_sessions_started_at
ON view_sessions(started_at);

PRAGMA optimize;
