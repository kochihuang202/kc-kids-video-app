# Mac Media Server

Private, read-only MP4/MP3 server for the Mac side of 小小選片. It listens on localhost by default and is intended to be exposed only through Tailscale Serve inside the tailnet.

Do not commit media, real `.env` files, Tailscale credentials, private hostnames, tailnet names, or home filesystem paths.

## Setup

```sh
cp .env.example .env
```

Edit `.env` locally with the real media root. Keep the file untracked.

Required tools:

- Go 1.27 or newer
- Tailscale CLI/app
- ffprobe from ffmpeg, optional but recommended for `/library` durations
- ffmpeg, required only when generating video thumbnails

## Run Locally

```sh
set -a
. ./.env
set +a
go run ./cmd/mac-media-server
```

Default address:

```text
http://127.0.0.1:8080
```

## Test

```sh
go test ./...
```

## Endpoints

- `GET|HEAD /health`
- `GET|HEAD /library`
- `GET|HEAD /media/{relativePath}`
- `GET|HEAD /thumbnails/{relativePathWithoutExtension}.jpg`
- `OPTIONS` for CORS preflight

Only `.mp4` and `.mp3` files are served. Paths are normalized and must stay inside `MEDIA_ROOT`.

## Generate thumbnails

Set `THUMBNAIL_ROOT` to a private cache directory outside the repository. Generate or refresh thumbnails for one library folder with:

```sh
set -a
. ./.env
set +a
./scripts/generate-thumbnails.sh "example-course-folder"
```

The command mirrors each MP4 relative path below `THUMBNAIL_ROOT`, replaces `.mp4` with `.jpg`, and skips thumbnails newer than their source video. Generated images stay outside Git. Restart the launchd service after adding `THUMBNAIL_ROOT` to its local environment.

`/library` keeps `durationSeconds` as `null` by default so large home libraries return quickly. Set `PROBE_DURATIONS=true` to ask the server to run `ffprobe` while building the library response.

## Inspect Media Compatibility

Use the read-only helper to inspect a file or folder:

```sh
./scripts/inspect-media.sh /path/to/offline/media
```

iPad Safari is happiest with MP4 files using H.264 video and AAC audio, and standard MP3 audio files.

## Tailscale Serve

After the local server is running and Tailscale is logged in, expose the localhost server inside the tailnet only:

```sh
tailscale serve --bg 8080
tailscale serve status
```

Disable Serve:

```sh
tailscale serve reset
```

Do not use Funnel for this project.

## launchd

Use `launchd/io.github.kc-kids-video-app.mac-media-server.plist.example` as a sanitized template. Copy it to `~/Library/LaunchAgents/`, replace placeholder paths locally, then load it with:

```sh
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.github.kc-kids-video-app.mac-media-server.plist
launchctl kickstart -k gui/$(id -u)/io.github.kc-kids-video-app.mac-media-server
launchctl print gui/$(id -u)/io.github.kc-kids-video-app.mac-media-server
```

Stop and unload:

```sh
launchctl bootout gui/$(id -u)/io.github.kc-kids-video-app.mac-media-server
```
