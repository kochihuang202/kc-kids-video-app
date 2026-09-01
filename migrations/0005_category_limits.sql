-- Phase 3 Extension: Category-specific daily limits

ALTER TABLE categories ADD COLUMN daily_limit_seconds INTEGER DEFAULT NULL CHECK (daily_limit_seconds IS NULL OR daily_limit_seconds >= 0);
