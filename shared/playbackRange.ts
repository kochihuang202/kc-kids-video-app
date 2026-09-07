export interface PlaybackRangeSource {
  durationSeconds?: number | null;
  playbackStartSeconds?: number | null;
  playbackEndSeconds?: number | null;
}

const valid = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;

export function getPlaybackRange(source: PlaybackRangeSource) {
  const durationSeconds = valid(source.durationSeconds) && source.durationSeconds! > 0 ? source.durationSeconds! : null;
  const requestedStart = valid(source.playbackStartSeconds) ? source.playbackStartSeconds! : 0;
  const startSeconds = durationSeconds === null ? requestedStart : Math.min(requestedStart, durationSeconds);
  const requestedEnd = valid(source.playbackEndSeconds) ? source.playbackEndSeconds! : null;
  const endSeconds = requestedEnd === null ? durationSeconds : durationSeconds === null ? requestedEnd : Math.min(requestedEnd, durationSeconds);
  const effectiveEndSeconds = endSeconds !== null && endSeconds > startSeconds ? endSeconds : durationSeconds;
  return { startSeconds, endSeconds: effectiveEndSeconds, durationSeconds: effectiveEndSeconds === null ? null : Math.max(0, effectiveEndSeconds - startSeconds) };
}

export function clampPlaybackPosition(source: PlaybackRangeSource, position: number) {
  const range = getPlaybackRange(source);
  const safe = Number.isFinite(position) ? position : range.startSeconds;
  return Math.max(range.startSeconds, range.endSeconds === null ? safe : Math.min(safe, range.endSeconds));
}

export function relativePlaybackPosition(source: PlaybackRangeSource, position: number) {
  return Math.max(0, clampPlaybackPosition(source, position) - getPlaybackRange(source).startSeconds);
}

export function playbackCompletionRatio(source: PlaybackRangeSource, position: number) {
  const range = getPlaybackRange(source);
  return range.durationSeconds ? Math.min(1, relativePlaybackPosition(source, position) / range.durationSeconds) : 0;
}
