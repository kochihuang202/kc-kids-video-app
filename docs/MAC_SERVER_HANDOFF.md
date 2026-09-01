# Mac Media Server handoff

> Status: Mac local server and Tailscale Serve HTTPS were verified on 2026-08-31. Thumbnail serving and generation are implemented on `codex/mac-media-thumbnails` and pending Mac deployment verification. iPad Safari remains pending user verification. This repository is public: never commit real tailnet names, Tailscale hostnames, home paths, credentials, tokens, media filenames that reveal private information, or a real `.env`.

## Ownership

- Mac implementation branch: `codex/mac-media-server`
- Windows integration branch: `codex/local-media-integration` (future)
- Mac implementation scope: `mac-media-server/**`
- Shared contract: this document

## Implementation status

| Item | Status | Evidence |
| --- | --- | --- |
| Environment audit | Verified | macOS 15.6, Apple Silicon, Homebrew available, Go/Tailscale/ffprobe installed, port 8080 available |
| Local server | Verified | `go run ./cmd/mac-media-server` on `127.0.0.1:8080` with sanitized media root |
| `/health` | Verified | Local curl returned `200` JSON with `mediaRootAvailable: true` |
| `/library` | Verified | Local curl returned `200`; real library scan completed in about 0.04s with `PROBE_DURATIONS=false` |
| MP4 Range | Verified | Real MP4 fixture returned `206`, `Accept-Ranges: bytes`, `Content-Range`, and `video/mp4` |
| MP3 Range | Verified | Automated test covers MP3 GET/HEAD MIME and Range behavior |
| CORS | Verified | Allowed production origin receives exact `Access-Control-Allow-Origin`; disallowed origin receives none |
| Tailscale Serve HTTPS | Verified | Tailnet-only Serve enabled after explicit user approval; HTTPS `/health`, MP4 HEAD, and MP4 Range verified through Tailscale userspace SOCKS path |
| launchd | Verified | User LaunchAgents installed locally and verified running for Tailscale userspace daemon and media server; sanitized template committed under `mac-media-server/launchd/` |
| Automated tests | Verified | `GOCACHE=/private/tmp/kc-kids-go-build go test ./...` |
| Thumbnail generation and `/thumbnails` | In progress | Code and automated tests added; Mac must generate the private cache, restart launchd, and verify the Tailscale HTTPS endpoint |
| iPad Safari test | Pending user verification | — |

Use only `Pending`, `In progress`, `Verified`, `Failed`, or `Pending user verification`.

## Sanitized runtime contract

Do not put real values here. The real base URL stays in the Mac `.env` and can be discovered by an authorized Windows device through Tailscale.

```dotenv
MEDIA_SERVER_BASE_URL=https://<mac-host>.<tailnet>.ts.net
MEDIA_SERVER_HEALTH_PATH=/health
MEDIA_SERVER_LIBRARY_PATH=/library
MEDIA_SERVER_MEDIA_PREFIX=/media/
MEDIA_SERVER_THUMBNAIL_PREFIX=/thumbnails/
```

## Endpoint contract

### `GET /health`

Verified locally. Returns `200` with JSON:

```json
{
  "status": "ok",
  "mediaRootAvailable": true,
  "serverTime": "2026-08-31T00:00:00Z"
}
```

If `MEDIA_ROOT` is unavailable, the server does not crash. It returns `200` with `status: "error"`, `mediaRootAvailable: false`, and an `error` message.

### `GET /library`

Verified locally. Returns `200` JSON:

```json
{
  "generatedAt": "2026-08-31T00:00:00Z",
  "items": [
    {
      "path": "/media/example.mp4",
      "name": "example.mp4",
      "mediaType": "video",
      "mimeType": "video/mp4",
      "sizeBytes": 123456,
      "modifiedAt": "2026-08-31T00:00:00Z",
      "durationSeconds": null
    }
  ]
}
```

Ordering is ascending by sanitized media URL path. Paths are URL encoded per path segment and never include physical disk paths. Supported extensions are `.mp4` and `.mp3`. Individual unreadable files are skipped. Duration probing is disabled by default for fast library scans; set `PROBE_DURATIONS=true` to run `ffprobe` while building `/library`.

### `GET|HEAD /media/{relativePath}`

Verified locally. Supports `GET` and `HEAD` for `.mp4` and `.mp3`.

- MP4 MIME: `video/mp4`
- MP3 MIME: `audio/mpeg`
- Valid Range returns `206 Partial Content`
- Invalid Range returns `416 Requested Range Not Satisfiable`
- Successful media responses include `Accept-Ranges: bytes`
- Range responses include `Content-Range` and correct `Content-Length`
- Missing files, directories, unsupported extensions, traversal, and paths outside `MEDIA_ROOT` return `404`
- Write methods return `405 Method Not Allowed`
- Cache header: `Cache-Control: private, max-age=3600`
- CORS only reflects exact configured origins

### `GET|HEAD /thumbnails/{relativePathWithoutExtension}.jpg`

Implemented and pending Mac deployment verification. JPEG files are generated ahead of time with `scripts/generate-thumbnails.sh`, stored in the private `THUMBNAIL_ROOT`, and served read-only with the same traversal and symlink protections as media files. Set `THUMBNAIL_AT_SECONDS` for a course-specific capture time and `THUMBNAIL_FORCE=true` when replacing older captures. `/library` returns `thumbnailPath` for a video when its generated JPEG exists.

## Configuration

List configuration key names and safe examples only. Never commit the real `.env`.

| Key | Required | Safe example | Description |
| --- | --- | --- | --- |
| `MEDIA_ROOT` | Yes | `/path/to/offline/media` | Physical read-only root on the Mac |
| `THUMBNAIL_ROOT` | No | `/path/to/private/thumbnail-cache` | Private generated JPEG cache outside Git |
| `SERVER_HOST` | Yes | `127.0.0.1` | Local bind host |
| `SERVER_PORT` | Yes | `8080` | Local bind port |
| `ALLOWED_ORIGINS` | Yes | `https://example.com` | Comma-separated exact origins |
| `PROBE_DURATIONS` | No | `false` | Set `true` to run `ffprobe` during `/library` scans |
| `FFPROBE_PATH` | No | `ffprobe` | Path or command name for ffprobe |
| `FFMPEG_PATH` | No | `ffmpeg` | Used by the thumbnail generation script |
| `THUMBNAIL_AT_SECONDS` | No | `640` | Frame timestamp used by the thumbnail generation script; defaults to `3` |
| `THUMBNAIL_FORCE` | No | `true` | Regenerate existing thumbnails when `true`; defaults to `false` |

## Operations

Mac Codex must document sanitized commands for:

Install/setup prerequisites:

```sh
brew install go tailscale
brew reinstall homebrew/core/ffmpeg
```

Run locally:

```sh
cd mac-media-server
cp .env.example .env
set -a
. ./.env
set +a
go run ./cmd/mac-media-server
```

Validate:

```sh
curl -i http://127.0.0.1:8080/health
curl -I http://127.0.0.1:8080/media/example.mp4
curl -i -H 'Range: bytes=0-1023' http://127.0.0.1:8080/media/example.mp4
go test ./...
./scripts/inspect-media.sh /path/to/offline/media
```

Tailscale status:

```sh
tailscale status
tailscale serve status
tailscale funnel status
```

Enable tailnet-only Serve after user approval:

```sh
tailscale serve --bg 8080
tailscale serve status
```

Disable Serve without Funnel:

```sh
tailscale serve reset
```

launchd: use `mac-media-server/launchd/io.github.kc-kids-video-app.mac-media-server.plist.example` as a sanitized template and replace placeholders locally. On the verified Mac, user-level LaunchAgents are installed locally for both the media server and the Tailscale userspace daemon. The local LaunchAgents contain private paths and are not committed.

## Failure behavior

Observed and expected behavior:

- Mac sleep/offline: pending real-device verification; clients should show media host unavailable.
- Tailscale disconnected: pending real-device verification; tailnet URL will be unreachable.
- Media disk unmounted or `MEDIA_ROOT` missing: `/health` returns `status: "error"` and `/library` returns `503`.
- Server stopped: localhost and Tailscale Serve proxy target are unavailable.
- Missing media: `/media/...` returns `404`.
- Invalid Range: `/media/...` returns `416`.
- Unsupported codec: server still serves the file; compatibility can be inspected with `scripts/inspect-media.sh`.
- CORS rejection: disallowed origins receive no `Access-Control-Allow-Origin` header.

## Test evidence

2026-08-31 local tests:

```sh
GOCACHE=/private/tmp/kc-kids-go-build go test ./...
```

Result: passed.

Local curl against sanitized real media root:

- `/health`: `200`, JSON status `ok`
- `/library`: `200`, completed in about 0.04s with `PROBE_DURATIONS=false`
- `HEAD /media/<sanitized>.mp4`: `200`, `Content-Type: video/mp4`, `Content-Length` present, `Accept-Ranges: bytes`
- `GET /media/<sanitized>.mp4` with `Range: bytes=0-1023`: `206`, `Content-Range` present
- `GET /media/<sanitized>.mp4` with invalid Range: `416`
- Encoded traversal path: `404`
- `DELETE /media/<sanitized>.mp4`: `405`
- Allowed production origin with Range: exact `Access-Control-Allow-Origin` and exposed Range headers

Tailscale:

- CLI installed and logged in.
- MagicDNS is enabled.
- Serve status reports `https://<mac-host>.<tailnet>.ts.net (tailnet only)` proxying `/` to `http://127.0.0.1:8080`.
- Funnel status reports the same tailnet-only Serve config and no public Funnel exposure.
- HTTPS `/health`: `200`.
- HTTPS `HEAD /media/<sanitized>.mp4`: `200`, `Content-Type: video/mp4`, `Content-Length` present, `Accept-Ranges: bytes`.
- HTTPS `GET /media/<sanitized>.mp4` with `Range: bytes=0-1023`: `206`, `Content-Range` present.
- User-level launchd services are verified running for both the Tailscale userspace daemon and the media server.
- iPad Safari playback is still pending user verification.

Media compatibility spot check:

- A sanitized real MP4 was inspected with `ffprobe`.
- Video codec: H.264
- Audio codec: AAC
- Resolution: 1920x1080
- Duration: about 107 seconds

## Windows Codex integration instructions

Mac Codex must complete this section after verification. It must tell Windows Codex:

Final DTO fields for local media should include:

- `sourceType`: `local-video` or `local-audio`
- `name`: display name
- `mediaPath`: sanitized `/media/...` path from `/library`
- `mimeType`: `video/mp4` or `audio/mpeg`
- `sizeBytes`: integer
- `durationSeconds`: number or `null`
- `modifiedAt`: ISO timestamp

Runtime base URL must stay out of git. The authorized parent browser or local environment should receive:

```dotenv
MEDIA_SERVER_BASE_URL=https://<mac-host>.<tailnet>.ts.net
```

The browser, not the Cloudflare Worker, calls:

- `${MEDIA_SERVER_BASE_URL}/health`
- `${MEDIA_SERVER_BASE_URL}/library`
- `${MEDIA_SERVER_BASE_URL}${mediaPath}`

CORS assumptions:

- The server reflects only exact configured origins.
- Production origin is configured through `ALLOWED_ORIGINS`.
- `Range` request header is allowed.
- `Accept-Ranges`, `Content-Range`, `Content-Length`, and `Content-Type` are exposed.

Range assumptions:

- Native `<video>` and `<audio>` can request byte ranges directly.
- Seek and mid-file loading rely on `206 Partial Content`.
- Invalid ranges produce `416`.

Expected offline/error states:

- `/health` unavailable: Mac server, Tailscale, or Mac network is down.
- `/health` `mediaRootAvailable: false`: media disk or folder is unavailable.
- `/media/...` `404`: item was moved, deleted, unsupported, or path is invalid.
- CORS failure: browser origin is not configured on the Mac server.

Codec limitations:

- No transcoding in v1.
- Prefer MP4 H.264 + AAC for iPad Safari.
- Prefer standard MPEG MP3 for audio.

Windows-side test fixtures can use generated local MP4/MP3 files or small checked-out temporary files outside git. Do not depend on real family media or committed private URLs.

The Web App must retain YouTube behavior and add local media through a separate player adapter. It must not proxy private media through Cloudflare.

## Open questions

List unresolved contract questions here. Discussion and answers should occur in the related GitHub issue or pull request, then the agreed answer should be reflected in this document.
