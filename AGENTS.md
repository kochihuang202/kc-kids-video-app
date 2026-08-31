# KC Kids Video App agent coordination

This repository is shared by two implementation environments.

## Windows responsibility

- React/Vite child and parent interfaces.
- Cloudflare Worker and D1.
- YouTube playback and future local-media integration.
- Production deployment and browser-side integration tests.

## Mac responsibility

- Tailscale configuration for the private media host.
- The read-only MP4/MP3 HTTP media server under `mac-media-server/`.
- HTTP Range, MIME, CORS, health, library manifest, launchd, and Mac-side tests.
- Updating `docs/MAC_SERVER_HANDOFF.md` after verified changes.

## Shared contract

Before changing the Mac media service or its Windows integration, read:

1. `docs/MAC_MEDIA_SERVER_TASK.md`
2. `docs/MAC_SERVER_HANDOFF.md`

The handoff document is the source of truth for the HTTP contract. Questions and implementation discussion belong in the relevant GitHub pull request or issue; do not use secrets as comments.

## Safety and repository rules

- This is a public repository. Never commit real Tailscale hostnames, tailnet names, auth keys, cookies, private keys, Google credentials, Cloudflare secrets, home directory paths, media files, or a real `.env`.
- Commit only `.env.example` values and sanitized URL placeholders.
- Do not upload MP4 or MP3 files to GitHub.
- Mac work must not modify the Web App, Worker, D1 migrations, or Cloudflare deployment unless the user explicitly expands the task.
- Windows work must treat the Mac server as an external service and must not rewrite its implementation without coordinating through the handoff contract.
- Preserve unrelated user changes and use `codex/` feature branches.

