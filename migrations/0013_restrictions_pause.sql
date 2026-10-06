-- Phase 3 Extension: Pause daily restrictions for today
ALTER TABLE daily_overrides ADD COLUMN restrictions_paused INTEGER NOT NULL DEFAULT 0;
