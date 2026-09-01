import { HttpError, json } from "./http";
import { verifyParent } from "./security";
import type { AppEnv } from "./types";
import { fetchYouTubeMetadata } from "./youtube";

interface VideoRow {
  id: string;
  youtube_video_id: string;
  parent_label: string;
  youtube_title: string;
  thumbnail_url: string;
  duration_seconds: number | null;
  availability_status: string;
  health_status: string;
  is_active: number;
}

export interface VideoHealthResult {
  id: string;
  youtubeVideoId: string;
  parentLabel: string;
  healthStatus: "healthy" | "unavailable" | "private" | "embedding_disabled" | "unknown";
  availabilityStatus: "available" | "unavailable" | "private" | "not_embeddable" | "metadata_error";
  isActive: boolean;
  metadataUpdated: boolean;
  error?: string;
}

export async function checkVideosHealth(env: AppEnv, forceAll = false): Promise<{
  checkedCount: number;
  healthyCount: number;
  unhealthyCount: number;
  results: VideoHealthResult[];
}> {
  const query = forceAll
    ? "SELECT id, youtube_video_id, parent_label, youtube_title, thumbnail_url, duration_seconds, availability_status, health_status, is_active FROM videos WHERE source = 'youtube' AND archived_at IS NULL"
    : "SELECT id, youtube_video_id, parent_label, youtube_title, thumbnail_url, duration_seconds, availability_status, health_status, is_active FROM videos WHERE source = 'youtube' AND archived_at IS NULL AND is_active = 1";

  const rows = await env.DB.prepare(query).all<VideoRow>();
  const videos = rows.results || [];
  const results: VideoHealthResult[] = [];
  const now = new Date().toISOString();

  let healthyCount = 0;
  let unhealthyCount = 0;

  for (const video of videos) {
    if (!video.youtube_video_id) continue;
    try {
      const meta = await fetchYouTubeMetadata(video.youtube_video_id, env);
      const isEmbeddable = meta.availabilityStatus !== "not_embeddable";
      const isAvailable = meta.availabilityStatus === "available";

      let healthStatus: "healthy" | "unavailable" | "private" | "embedding_disabled" = "healthy";
      let availabilityStatus: "available" | "unavailable" | "private" | "not_embeddable" = "available";

      if (!isAvailable) {
        if (!isEmbeddable) {
          healthStatus = "embedding_disabled";
          availabilityStatus = "not_embeddable";
        } else if (meta.availabilityStatus === "private") {
          healthStatus = "private";
          availabilityStatus = "private";
        } else {
          healthStatus = "unavailable";
          availabilityStatus = "unavailable";
        }
      }

      const isHealthy = healthStatus === "healthy";
      if (isHealthy) healthyCount++; else unhealthyCount++;

      // If unhealthy, automatically deactivate so kids won't see it (spec #43), while preserving notes & sessions (spec #44)
      const nextIsActive = isHealthy ? video.is_active : 0;

      await env.DB.prepare(`
        UPDATE videos SET
          youtube_title = ?,
          thumbnail_url = ?,
          duration_seconds = COALESCE(?, duration_seconds),
          availability_status = ?,
          health_status = ?,
          is_active = ?,
          metadata_error = NULL,
          last_health_check_at = ?,
          metadata_synced_at = ?,
          updated_at = ?
        WHERE id = ?
      `).bind(
        meta.youtubeTitle || video.youtube_title,
        meta.thumbnailUrl || video.thumbnail_url,
        meta.durationSeconds || video.duration_seconds,
        availabilityStatus,
        healthStatus,
        nextIsActive,
        now,
        now,
        now,
        video.id,
      ).run();

      results.push({
        id: video.id,
        youtubeVideoId: video.youtube_video_id,
        parentLabel: video.parent_label,
        healthStatus,
        availabilityStatus,
        isActive: nextIsActive === 1,
        metadataUpdated: true,
      });
    } catch (err) {
      unhealthyCount++;
      const errorMessage = err instanceof Error ? err.message : "無法取得影片狀態";
      await env.DB.prepare(`
        UPDATE videos SET
          health_status = 'unknown',
          metadata_error = ?,
          last_health_check_at = ?,
          updated_at = ?
        WHERE id = ?
      `).bind(errorMessage, now, now, video.id).run();

      results.push({
        id: video.id,
        youtubeVideoId: video.youtube_video_id,
        parentLabel: video.parent_label,
        healthStatus: "unknown",
        availabilityStatus: video.availability_status as any,
        isActive: video.is_active === 1,
        metadataUpdated: false,
        error: errorMessage,
      });
    }
  }

  return {
    checkedCount: videos.length,
    healthyCount,
    unhealthyCount,
    results,
  };
}

export async function runHealthCheck(request: Request, env: AppEnv) {
  await verifyParent(request, env);
  const url = new URL(request.url);
  const forceAll = url.searchParams.get("all") === "1" || url.searchParams.get("force") === "true";
  const result = await checkVideosHealth(env, forceAll);
  return json({ ok: true, ...result });
}
