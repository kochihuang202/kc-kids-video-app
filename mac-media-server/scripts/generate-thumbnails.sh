#!/usr/bin/env bash
set -euo pipefail

media_root="${MEDIA_ROOT:-}"
thumbnail_root="${THUMBNAIL_ROOT:-}"
ffmpeg_bin="${FFMPEG_PATH:-ffmpeg}"
relative_scope="${1:-.}"

if [[ -z "$media_root" || -z "$thumbnail_root" ]]; then
  echo "MEDIA_ROOT and THUMBNAIL_ROOT are required" >&2
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

  if [[ -f "$output_file" && "$output_file" -nt "$source_file" ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  temp_file="$output_file.tmp.jpg"
  rm -f "$temp_file"
  if "$ffmpeg_bin" -hide_banner -loglevel error -y -ss 3 -i "$source_file" \
      -frames:v 1 -vf "scale=640:360:force_original_aspect_ratio=decrease,pad=640:360:(ow-iw)/2:(oh-ih)/2" \
      -q:v 3 "$temp_file" || \
     "$ffmpeg_bin" -hide_banner -loglevel error -y -ss 0.5 -i "$source_file" \
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
