-- Parent-configurable finite repetition for learning-series pure listening.

ALTER TABLE categories
ADD COLUMN listen_repeat_count INTEGER NOT NULL DEFAULT 5
CHECK (listen_repeat_count BETWEEN 1 AND 20);

PRAGMA optimize;
