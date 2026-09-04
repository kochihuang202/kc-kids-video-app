#!/usr/bin/env bash
set -euo pipefail

base_url="${MEDIA_SERVER_BASE_URL:-http://127.0.0.1:${SERVER_PORT:-8080}}"
diagnostic_id="smoke-$(date -u +%Y%m%d%H%M%S)"

echo "health"
curl -fsS -i "$base_url/health" | sed -n '1,24p'

echo
echo "deep diagnostics"
curl -fsS "$base_url/diagnostics/deep" | python3 -m json.tool | sed -n '1,90p'

media_path="$(
  curl -fsS "$base_url/library" |
    python3 -c 'import json,sys; data=json.load(sys.stdin); print(next((i["path"] for i in data.get("items", []) if i.get("mediaType")=="video"), ""))'
)"

if [[ -z "$media_path" ]]; then
  echo "no video media found in /library" >&2
  exit 1
fi

echo
echo "head"
curl -fsS -I -H "X-KC-Diagnostic-Id: $diagnostic_id" "$base_url$media_path" | sed -n '1,30p'

echo
echo "range"
curl -fsS -H "X-KC-Diagnostic-Id: $diagnostic_id" -H "Range: bytes=0-1023" "$base_url$media_path" -o /tmp/kc-smoke-range.bin -D /tmp/kc-smoke-range.headers
sed -n '1,30p' /tmp/kc-smoke-range.headers
test "$(wc -c < /tmp/kc-smoke-range.bin | tr -d ' ')" = "1024"
echo "diagnostic_id=$diagnostic_id"
