-- Two-video production canary for 泉靈的語文課(一上).
-- Safe to run repeatedly; the full import reuses the same IDs and paths.

INSERT INTO videos (
  id, source, youtube_video_id, youtube_url, youtube_title, parent_label,
  thumbnail_url, duration_seconds, availability_status, metadata_error,
  is_active, created_at, updated_at, archived_at,
  health_status, media_type, media_path, thumbnail_path
)
VALUES
  (
    'quanling-01', 'self_hosted', NULL, NULL,
    '01 我是会提问的小学生', '01 我是会提问的小学生', '', NULL,
    'available', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL,
    'healthy', 'video',
    '/media/05_泉靈的語文課/01 我是会提问的小学生.mp4',
    '/thumbnails/05_泉靈的語文課/01 我是会提问的小学生.jpg'
  ),
  (
    'quanling-02', 'self_hosted', NULL, NULL,
    '02 仔细观察 准确 描述', '02 仔细观察 准确 描述', '', NULL,
    'available', NULL, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL,
    'healthy', 'video',
    '/media/05_泉靈的語文課/02 仔细观察 准确 描述.mp4',
    '/thumbnails/05_泉靈的語文課/02 仔细观察 准确 描述.jpg'
  )
ON CONFLICT(id) DO UPDATE SET
  source = excluded.source,
  youtube_video_id = NULL,
  youtube_url = NULL,
  youtube_title = excluded.youtube_title,
  parent_label = excluded.parent_label,
  thumbnail_url = '',
  availability_status = 'available',
  metadata_error = NULL,
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP,
  archived_at = NULL,
  health_status = 'healthy',
  media_type = excluded.media_type,
  media_path = excluded.media_path,
  thumbnail_path = excluded.thumbnail_path;

INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
VALUES
  ('泉靈的語文課(一上)', 'quanling-01', 1, CURRENT_TIMESTAMP),
  ('泉靈的語文課(一上)', 'quanling-02', 2, CURRENT_TIMESTAMP)
ON CONFLICT(category_id, video_id) DO UPDATE SET sort_order = excluded.sort_order;
