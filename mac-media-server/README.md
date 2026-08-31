# Mac media server

This directory is reserved for the private, read-only MP4/MP3 server described in `../docs/MAC_MEDIA_SERVER_TASK.md`.

Mac Codex should place only source code, safe configuration examples, tests, launchd templates, and operating documentation here. Do not commit media, real `.env` files, Tailscale credentials, private hostnames, tailnet names, or home filesystem paths.

The implementation must stay independent from the React/Cloudflare application. Its public integration contract is maintained in `../docs/MAC_SERVER_HANDOFF.md`.
