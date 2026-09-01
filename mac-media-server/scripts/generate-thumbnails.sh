#!/usr/bin/env bash
set -euo pipefail

media_root="${MEDIA_ROOT:-}"
thumbnail_root="${THUMBNAIL_ROOT:-}"
ffmpeg_bin="${FFMPEG_PATH:-ffmpeg}"
thumbnail_at_seconds="${THUMBNAIL_AT_SECONDS:-3}"
thumbnail_force="${THUMBNAIL_FORCE:-false}"
relative_scope="${1:-.}"

if [[ -z "$media_root" || -z "$thumbnail_root" ]]; then
  echo "MEDIA_ROOT and THUMBNAIL_ROOT are required" >&2
  exit 2
fi

if [[ ! "$thumbnail_at_seconds" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
  echo "THUMBNAIL_AT_SECONDS must be a non-negative number" >&2
  exit 2
fi

if [[ "$thumbnail_force" != "true" && "$thumbnail_force" != "false" ]]; then
  echo "THUMBNAIL_FORCE must be true or false" >&2
  exit 2
fi

source_root="$media_root/$relative_scope"
if [[ ! -d "$source_root" ]]; then
  echo "media scope is not a directory: $relative_scope" >&2
  exit 2
fi

mkdir -p "$thumbnail_root"
generated=0
skipped=0
failed=0

while IFS= read -r -d '' source_file; do
  relative_path="${source_file#"$media_root"/}"
  relative_without_ext="${relative_path%.*}"
  output_file="$thumbnail_root/$relative_without_ext.jpg"
  mkdir -p "$(dirname "$output_file")"

  if [[ "$thumbnail_force" != "true" && -f "$output_file" && "$output_file" -nt "$source_file" ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  temp_file="$output_file.tmp.jpg"
  rm -f "$temp_file"
  if "$ffmpeg_bin" -hide_banner -loglevel error -y -ss "$thumbnail_at_seconds" -i "$source_file" \
      -frames:v 1 -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2" \
      -q:v 3 "$temp_file"; then
    mv "$temp_file" "$output_file"
    generated=$((generated + 1))
  else
    rm -f "$temp_file"
    echo "failed: $relative_path" >&2
    failed=$((failed + 1))
  fi
done < <(find "$source_root" -type f -iname '*.mp4' -print0)

printf 'generated=%d skipped=%d failed=%d\n' "$generated" "$skipped" "$failed"
[[ "$failed" -eq 0 ]]
