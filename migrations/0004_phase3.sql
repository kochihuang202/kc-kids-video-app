-- Phase 3 Schema Migration: Family Usage Rules & Time Management

CREATE TABLE IF NOT EXISTS usage_rules (
  id TEXT PRIMARY KEY NOT NULL CHECK (id IN ('weekday', 'weekend')),
  day_type TEXT NOT NULL UNIQUE CHECK (day_type IN ('weekday', 'weekend')),
  daily_limit_seconds INTEGER NOT NULL DEFAULT 2400 CHECK (daily_limit_seconds >= 0),
  grace_period_seconds INTEGER NOT NULL DEFAULT 300 CHECK (grace_period_seconds >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS allowed_windows (
  id TEXT PRIMARY KEY NOT NULL,
  usage_rule_id TEXT NOT NULL REFERENCES usage_rules(id) ON DELETE CASCADE,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1))
);

CREATE INDEX IF NOT EXISTS idx_allowed_windows_rule
ON allowed_windows(usage_rule_id, is_active, sort_order);

CREATE TABLE IF NOT EXISTS daily_overrides (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL UNIQUE,
  bonus_seconds INTEGER NOT NULL DEFAULT 0 CHECK (bonus_seconds >= 0),
  limit_override_seconds INTEGER CHECK (limit_override_seconds IS NULL OR limit_override_seconds >= 0),
  is_paused INTEGER NOT NULL DEFAULT 0 CHECK (is_paused IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_overrides_date
ON daily_overrides(date);

CREATE TABLE IF NOT EXISTS daily_video_picks (
  id TEXT PRIMARY KEY NOT NULL,
  date TEXT NOT NULL,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (date, video_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_video_picks_date
ON daily_video_picks(date, sort_order);

-- Initial seed for usage rules
INSERT OR IGNORE INTO usage_rules (id, day_type, daily_limit_seconds, grace_period_seconds, is_active, created_at, updated_at)
VALUES
  ('weekday', 'weekday', 2400, 300, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('weekend', 'weekend', 3600, 300, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
