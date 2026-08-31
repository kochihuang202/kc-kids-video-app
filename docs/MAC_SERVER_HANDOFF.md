# Mac Media Server handoff

> Status: specification only. Mac Codex must update this document with sanitized, verified results. This repository is public: never commit real tailnet names, Tailscale hostnames, home paths, credentials, tokens, media filenames that reveal private information, or a real `.env`.

## Ownership

- Mac implementation branch: `codex/mac-media-server`
- Windows integration branch: `codex/local-media-integration` (future)
- Mac implementation scope: `mac-media-server/**`
- Shared contract: this document

## Implementation status

| Item | Status | Evidence |
| --- | --- | --- |
| Environment audit | Pending | — |
| Local server | Pending | — |
| `/health` | Pending | — |
| `/library` | Pending | — |
| MP4 Range | Pending | — |
| MP3 Range | Pending | — |
| CORS | Pending | — |
| Tailscale Serve HTTPS | Pending | — |
| launchd | Pending | — |
| Automated tests | Pending | — |
| iPad Safari test | Pending user verification | — |

Use only `Pending`, `In progress`, `Verified`, `Failed`, or `Pending user verification`.

## Sanitized runtime contract

Do not put real values here. The real base URL stays in the Mac `.env` and can be discovered by an authorized Windows device through Tailscale.

```dotenv
MEDIA_SERVER_BASE_URL=https://<mac-host>.<tailnet>.ts.net
MEDIA_SERVER_HEALTH_PATH=/health
MEDIA_SERVER_LIBRARY_PATH=/library
MEDIA_SERVER_MEDIA_PREFIX=/media/
```

## Endpoint contract

### `GET /health`

Document verified status codes and response schema here.

### `GET /library`

Document the final JSON schema, ordering, encoding, supported extensions, and failure behavior here.

### `GET|HEAD /media/{relativePath}`

Document Range behavior, MIME mapping, cache headers, CORS headers, 404/416 behavior, and path-normalization rules here.

## Configuration

List configuration key names and safe examples only. Never commit the real `.env`.

| Key | Required | Safe example | Description |
| --- | --- | --- | --- |
| `MEDIA_ROOT` | Yes | `/path/to/offline/media` | Physical read-only root on the Mac |
| `SERVER_HOST` | Yes | `127.0.0.1` | Local bind host |
| `SERVER_PORT` | Yes | `8080` | Local bind port |
| `ALLOWED_ORIGINS` | Yes | `https://example.com` | Comma-separated exact origins |

## Operations

Mac Codex must document sanitized commands for:

- Install/setup prerequisites.
- Start, stop, restart, and status.
- Viewing logs.
- Validating the media mount.
- Inspecting Tailscale Serve status.
- Disabling Serve without using Funnel.

## Failure behavior

Document observed behavior for Mac sleep/offline, Tailscale disconnected, media disk unmounted, server stopped, missing media, invalid Range, unsupported codec, and CORS rejection.

## Test evidence

Record commands, HTTP status, key headers, and dates. Do not paste secrets, real private URLs, or private filenames. Mark unexecuted tests accurately.

## Windows Codex integration instructions

Mac Codex must complete this section after verification. It must tell Windows Codex:

- The final DTO fields for local video and local audio.
- How an authorized Windows/iPad browser discovers or receives the runtime base URL without committing it publicly.
- How to call `/health` and `/library` from the browser, not the Cloudflare Worker.
- How to combine the base URL with a sanitized relative media path.
- Exact CORS and Range assumptions.
- Expected offline and error states.
- Any codec limitations.
- Which test fixtures or commands Windows can use without access to real family media.

The Web App must retain YouTube behavior and add local media through a separate player adapter. It must not proxy private media through Cloudflare.

## Open questions

List unresolved contract questions here. Discussion and answers should occur in the related GitHub issue or pull request, then the agreed answer should be reflected in this document.

