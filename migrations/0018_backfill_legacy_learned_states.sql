-- Migration 0015 created the per-child learned-state table before the
-- multi-child Worker was deployed. During that deployment window the old
-- Worker continued writing new completions to video_learned_state, after the
-- one-time 0015 copy had already run. Preserve any current per-child state and
-- backfill only the missing legacy completions to the original child, 阿云.

INSERT OR IGNORE INTO child_video_learned (
  child_id,
  video_id,
  is_learned,
  learned_at,
  updated_at
)
SELECT
  'child_ayun',
  video_id,
  is_learned,
  learned_at,
  updated_at
FROM video_learned_state
WHERE is_learned = 1;
