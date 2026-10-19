-- Add clean_pause flag to categories table.
-- When clean_pause = 1, pausing videos in this category will keep the live frame clear (no poster, no thinking prompt card).

ALTER TABLE categories
ADD COLUMN clean_pause INTEGER NOT NULL DEFAULT 0
CHECK (clean_pause IN (0, 1));

-- Default: Enable clean pause for Quanling Language Course
UPDATE categories
SET clean_pause = 1
WHERE id = '泉靈的語文課(一上)' OR name LIKE '%泉靈的語文課%';

PRAGMA optimize;
