# Lightweight regression workflow

This project protects bugs that have actually happened. It does not aim for broad UI coverage.

## Before editing

1. Identify the pages, components, APIs, and shared modules affected by the change.
2. Search `docs/REGRESSIONS.md` for those terms.
3. Note the listed regression specs that overlap with the change.

## What to run

- Playback changes: `npm run test:regression:playback`
- Local Mac/Tailscale media loading: `npm run test:regression:media-retry`
- Learning/leisure child flow: `npm run test:feature:learning-leisure`
- D1 polling, rollup, indexes, or device authorization cost: `npm run test:regression:d1-cost`
- Playback/device diagnostics: `npx vitest run test/diagnostics.spec.ts test/d1-cost-regressions.spec.ts` and `npx playwright test e2e/features/playback-diagnostics.spec.ts e2e/regressions/media-auto-retry.spec.ts`
- Child-home recent cards or title styling: `npm run test:regression:recents`
- A new feature: its focused unit/integration test plus related regressions
- Shared routing, repositories, player abstractions, authentication, or a large change: `npm run test:regression`

The Playwright config starts a lightweight local Vite frontend automatically. Tests intercept only their own deterministic API and media fixtures, so they do not write to production D1 or depend on the home Mac being online. Worker/D1 behavior remains in the focused Vitest integration tests.

## Maintaining tests

Use the existing `.spec.ts` directly instead of exploring the complete UI again. Never delete, skip, or weaken a historical regression merely to make a new code change pass. If the intended product behavior changes, update both the test and its entry in `docs/REGRESSIONS.md`.
