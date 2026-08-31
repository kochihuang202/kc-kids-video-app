#!/usr/bin/env bash
set -euo pipefail
shopt -s nocasematch

target="${1:-}"
ffprobe_bin="${FFPROBE_PATH:-ffprobe}"

if [[ -z "$target" ]]; then
  echo "usage: $0 /path/to/media-file-or-directory" >&2
  exit 2
fi

inspect_file() {
  local file="$1"
  case "$file" in
    *.mp4|*.mp3) ;;
    *) return 0 ;;
  esac

  printf '\n== %s ==\n' "$file"
  "$ffprobe_bin" \
    -v error \
    -show_entries format=duration,bit_rate \
    -show_entries stream=codec_type,codec_name,width,height,bit_rate \
    -of json \
    "$file" || true
}

if [[ -d "$target" ]]; then
  while IFS= read -r -d '' file; do
    inspect_file "$file"
  done < <(find "$target" -type f \( -iname '*.mp4' -o -iname '*.mp3' \) -print0)
else
  inspect_file "$target"
fi
