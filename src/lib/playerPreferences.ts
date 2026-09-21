const STORAGE_KEY = "kid_series_player_preferences_v1";

export interface SeriesPlayerPreferences {
  volume: number;
  playbackRate: number;
}

const DEFAULT_PREFERENCES: SeriesPlayerPreferences = {
  volume: 1,
  playbackRate: 1,
};

const SUPPORTED_PLAYBACK_RATES = new Set([0.6, 0.8, 1]);

function readStore(): Record<string, Partial<SeriesPlayerPreferences>> {
  if (typeof window === "undefined") return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}") as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as Record<string, Partial<SeriesPlayerPreferences>>
      : {};
  } catch {
    return {};
  }
}

export function readSeriesPlayerPreferences(seriesId: string): SeriesPlayerPreferences {
  const stored = readStore()[seriesId];
  const volume = typeof stored?.volume === "number" && Number.isFinite(stored.volume)
    ? Math.min(1, Math.max(0, stored.volume))
    : DEFAULT_PREFERENCES.volume;
  const playbackRate = typeof stored?.playbackRate === "number" && SUPPORTED_PLAYBACK_RATES.has(stored.playbackRate)
    ? stored.playbackRate
    : DEFAULT_PREFERENCES.playbackRate;
  return { volume, playbackRate };
}

export function saveSeriesPlayerPreferences(seriesId: string, patch: Partial<SeriesPlayerPreferences>) {
  if (typeof window === "undefined" || !seriesId) return;
  try {
    const store = readStore();
    const current = readSeriesPlayerPreferences(seriesId);
    const nextVolume = typeof patch.volume === "number" && Number.isFinite(patch.volume)
      ? Math.min(1, Math.max(0, patch.volume))
      : current.volume;
    const nextPlaybackRate = typeof patch.playbackRate === "number" && SUPPORTED_PLAYBACK_RATES.has(patch.playbackRate)
      ? patch.playbackRate
      : current.playbackRate;
    store[seriesId] = { volume: nextVolume, playbackRate: nextPlaybackRate };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Private browsing or a full storage quota should not block playback.
  }
}

export function playerPreferenceSeriesId(video: { categoryId: string; categoryIds?: string[] }) {
  return video.categoryIds?.find((categoryId) => categoryId !== "learning-favorites") || video.categoryId;
}
