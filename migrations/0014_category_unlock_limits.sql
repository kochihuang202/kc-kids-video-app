-- Phase 4 Extension: Configurable unlock limit for learning categories (e.g. 1, 5, or 0 for unlimited)
ALTER TABLE categories ADD COLUMN unlock_limit INTEGER DEFAULT NULL CHECK (unlock_limit IS NULL OR unlock_limit >= 0);

-- Default: 泉靈的語文課: 只能 1 個 (unlock_limit = 1)
UPDATE categories SET unlock_limit = 1 WHERE id = '泉靈的語文課(一上)' OR name LIKE '%泉靈的語文課%';

-- Default: 科學: 不限制 (unlock_limit = 0)
UPDATE categories SET unlock_limit = 0 WHERE id = 'science' OR name = '科學';
