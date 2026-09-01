-- Idempotent import for: 泉靈的語文課(一上)
-- Run only after migrations/0006_local_media.sql has been applied.
-- Media files remain on the Mac; paths are relative to MEDIA_SERVER_BASE_URL.

WITH quanling_import (id, lesson_number, title, file_name) AS (VALUES
  ('quanling-01', 1, '01 我是会提问的小学生', '01 我是会提问的小学生.mp4'),
  ('quanling-02', 2, '02 仔细观察 准确 描述', '02 仔细观察 准确 描述.mp4'),
  ('quanling-03', 3, '03 打开五官来阅读', '03 打开五官来阅读.mp4'),
  ('quanling-04', 4, '04 识字先学天地人', '04 识字先学天地人.mp4'),
  ('quanling-05', 5, '05 用上口耳目学会听', '05 用上口耳目学会听.mp4'),
  ('quanling-06', 6, '06 走进秋天', '06 走进秋天.mp4'),
  ('quanling-07', 7, '07 拼音是识字的工具', '07 拼音是识字的工具.mp4'),
  ('quanling-08', 8, '08 一个手势学会看图说话', '08 一个手势学会看图说话.mp4'),
  ('quanling-09', 9, '09 我说你做', '09 我说你做.mp4'),
  ('quanling-10', 10, '10 三步学会描述特征', '10 三步学会描述特征.mp4'),
  ('quanling-11', 11, '11 抓住特征描述人物', '11 抓住特征描述人物.mp4'),
  ('quanling-12', 12, '12 用特征描述待定人物', '12 用特征描述待定人物.mp4'),
  ('quanling-13', 13, '13 会看表格会思考', '13 会看表格会思考.mp4'),
  ('quanling-14', 14, '14 6句话描述我的家', '14 6句话描述我的家.mp4'),
  ('quanling-15', 15, '15 用情绪地图准确表达', '15 用情绪地图准确表达.mp4'),
  ('quanling-16', 16, '16 韵律启蒙', '16 韵律启蒙.mp4'),
  ('quanling-17', 17, '17 反义词和同义词', '17 反义词和同义词.mp4'),
  ('quanling-18', 18, '18 9个问题完成自我介绍', '18 9个问题完成自我介绍 .mp4'),
  ('quanling-19', 19, '19 行动之前先了解情况', '19 行动之前先了解情况.mp4'),
  ('quanling-20', 20, '20 仔细观察 展开想象', '20 仔细观察 展开想象.mp4'),
  ('quanling-21', 21, '21 加入变化 讲出新政', '21 加入变化 讲出新政.mp4'),
  ('quanling-22', 22, '22 根据场景正确分类', '22 根据场景正确分类.mp4'),
  ('quanling-23', 23, '23 善于思考  会找资料', '23 善于思考  会找资料.mp4'),
  ('quanling-24', 24, '24 用分类给阅读理解打基础', '24 用分类给阅读理解打基础.mp4'),
  ('quanling-27', 27, '27 学会交朋友', '27 学会交朋友.mp4'),
  ('quanling-29', 29, '29 同理心训练', '29 同理心训练.mp4'),
  ('quanling-30', 30, '30 带着同理心和想象力去阅读', '30 带着同理心和想象力去阅读.mp4'),
  ('quanling-31', 31, '31 我是一条鱼', '31 我是一条鱼.mp4'),
  ('quanling-32', 32, '32 神奇魔法棒', '32 神奇魔法棒.mp4')
)

INSERT INTO videos (
  id, source, youtube_video_id, youtube_url, youtube_title, parent_label,
  thumbnail_url, duration_seconds, availability_status, metadata_error,
  is_active, created_at, updated_at, archived_at,
  health_status, media_type, media_path, thumbnail_path
)
SELECT
  id,
  'self_hosted',
  NULL,
  NULL,
  title,
  title,
  '',
  NULL,
  'available',
  NULL,
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP,
  NULL,
  'healthy',
  'video',
  '/media/05_泉靈的語文課/' || file_name,
  '/thumbnails/05_泉靈的語文課/' || substr(file_name, 1, length(file_name) - 4) || '.jpg'
FROM quanling_import
WHERE 1 = 1
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

WITH quanling_order (id, lesson_number) AS (VALUES
  ('quanling-01', 1), ('quanling-02', 2), ('quanling-03', 3), ('quanling-04', 4),
  ('quanling-05', 5), ('quanling-06', 6), ('quanling-07', 7), ('quanling-08', 8),
  ('quanling-09', 9), ('quanling-10', 10), ('quanling-11', 11), ('quanling-12', 12),
  ('quanling-13', 13), ('quanling-14', 14), ('quanling-15', 15), ('quanling-16', 16),
  ('quanling-17', 17), ('quanling-18', 18), ('quanling-19', 19), ('quanling-20', 20),
  ('quanling-21', 21), ('quanling-22', 22), ('quanling-23', 23), ('quanling-24', 24),
  ('quanling-27', 27), ('quanling-29', 29), ('quanling-30', 30), ('quanling-31', 31),
  ('quanling-32', 32)
)
INSERT INTO category_videos (category_id, video_id, sort_order, created_at)
SELECT '泉靈的語文課(一上)', id, lesson_number, CURRENT_TIMESTAMP
FROM quanling_order
WHERE EXISTS (
  SELECT 1 FROM categories
  WHERE id = '泉靈的語文課(一上)' AND archived_at IS NULL
)
ON CONFLICT(category_id, video_id) DO UPDATE SET
  sort_order = excluded.sort_order;
