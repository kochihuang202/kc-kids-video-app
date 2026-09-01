import type { AppEnv } from "./types";

export interface MediaColumns {
  source: "youtube" | "self_hosted";
  youtube_video_id: string | null;
  thumbnail_url: string;
  media_type: "video" | "audio" | null;
  media_path: string | null;
  thumbnail_path: string | null;
}

function assetUrl(env: AppEnv, path: string | null, allowedPrefix: "/media/" | "/thumbnails/") {
  const base = env.MEDIA_SERVER_BASE_URL?.trim();
  if (!base || !path || !path.startsWith(allowedPrefix) || path.includes("\\") || path.split("/").includes("..")) {
    return null;
  }
  try {
    const baseUrl = new URL(base.endsWith("/") ? base : `${base}/`);
    if (baseUrl.protocol !== "https:" && baseUrl.protocol !== "http:") return null;
    return new URL(path, baseUrl).toString();
  } catch {
    return null;
  }
}

export function mediaDto(row: MediaColumns, env: AppEnv) {
  const isLocal = row.source === "self_hosted";
  const localThumbnail = isLocal ? assetUrl(env, row.thumbnail_path, "/thumbnails/") : null;
  return {
    source: row.source,
    youtubeVideoId: row.youtube_video_id,
    mediaType: row.media_type,
    mediaPath: row.media_path,
    mediaUrl: isLocal ? assetUrl(env, row.media_path, "/media/") : null,
    thumbnailPath: row.thumbnail_path,
    thumbnailUrl: row.thumbnail_url || localThumbnail || "/local-media-placeholder.svg",
  };
}

export async function serveMediaAsset(pathname: string, env: AppEnv) {
  const routePrefix = "/api/media/";
  if (!pathname.startsWith(routePrefix) || !env.MEDIA_ASSETS) return null;

  let key: string;
  try {
    key = pathname
      .slice(routePrefix.length)
      .split("/")
      .map((segment) => decodeURIComponent(segment))
      .join("/");
  } catch {
    return null;
  }
  if (!key || key.includes("\\") || key.split("/").includes("..")) return null;

  const object = await env.MEDIA_ASSETS.get(key);
  if (!object) return null;
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("cache-control", headers.get("cache-control") || "public, max-age=31536000, immutable");
  headers.set("x-content-type-options", "nosniff");
  return new Response(object.body, { headers });
}
