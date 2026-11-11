# Ctrl+C / Ctrl+V / Ctrl+Z integration

Date: 2026-11-11 (Asia/Taipei). Baseline InkBridge runtime: `a92c367`, version 0.5.11. No production profile, database or FlexNote installation was opened or modified.

## Verified source contracts

Same-version private FlexNote factories were inspected before implementation. No complete vendor factories or binaries are added to Git.

| Factory | Confirmed behavior and reuse |
| --- | --- |
| 64744 | Extract the complete native `mod+c` callback from `_app`, with its original hotkey hook and provider dependencies. Retain the complete `rG` paste listener. Editable elements keep Lexical clipboard handling. |
| 23407 / 63268 / 34147 | Native copy-node/edge reducers, middleware, rich HTML/plain-text writer and clipboard signature gate. No private substitute clipboard store. |
| 94700 | Native `mr` group expansion and complete `Su` paste algorithm: UUIDs, repeated-paste offset, group parent remapping, copied note contents and internal edge remapping. Await connection insertion after its endpoints commit. Track the complete native asynchronous delete path. |
| 23 / 66963 / 37883 | Native per-board undo/redo stacks, 30-step limit, scope reset, cloning and keyboard handling, including Ctrl+Shift+Z / Ctrl+Y and editor-focus exclusions. |
| 48626 | Native undo controls and the full `ib` typed persistence restoration were inspected. InkBridge retains the native controller and snapshot timing. Its own SQLite schema needs a storage adapter rather than running the original application's many service transactions against an incompatible schema. |
| 10764 | Pass the existing native snapshot callback into Canvas and its editor/drawing lifecycle. Capture keyboard Delete before dispatching node, edge and stroke deletion to the ported parent. |

Source factory SHA-256:

- 64744: `1d8f82892a4f9f855a3debae02119c0927a5b8d566b86758607bdfde9aac42d8`
- 94700: `81cc8ef85f0c9237163c5057410082e2b81ed9bc4d0b4f8a208589309053a11c`
- 23: `86a8d8e08ca9cf7fd9c64fa73f73b5982eb2c5d8a9a1db8a1b959ef9dbc2bea2`
- 66963: `8dad4eb146cea875f519d0e4bb68bbfb70f9ad1e11277e733efaa82ec4767905`
- 37883: `7d15abe38e29b3fbcf52e0e79fca21056b2dfe7e5dbc1a1983b31b0af3557d95`
- 10764: `ecd98c43416144f5f4d7b1e81b19649f3c0f5a1c4af82f31383ee2c8aec9bff6`

`apply-clipboard-history-patches.cjs` checks source identities and unique anchors. `integration-patches.json` records private before/after hashes. Rebuilding uses the established private module collection workflow; it does not patch an installed ASAR.

## InkBridge storage boundary

`canvas-history.mjs` adds a data-only, board-scoped SQLite projection to native snapshots. It contains no assets, file bytes, viewing state or version-history copies. Undo first drains actual pending native paste/delete/geometry operations and editor commits, freezes interaction briefly, then invokes the native stack. Typed restoration operations commit in one SQLite transaction. A rejected transaction leaves the database intact and restores the old stack and scene. Close/save waits for this operation; no fixed idle delay is used.

Content objects and immutable CAS files survive undoing their placement. Restoring a deleted placement reasserts its cascaded connections. Group parents are created before members and deleted after member updates. Other boards and local pan/zoom state are outside this projection. External shared-graph refresh clears obsolete scene history. This is session undo, not persistent history across application restarts.

`original-clipboard.mjs` exposes missing native batch contracts. `original-text-elements.mjs` commits a text/shape batch before updating its row cache and reasserts just its created nodes, preventing an intervening group hydration from erasing an optimistic shape. Original native geometry, selection and rendering algorithms remain in use.

The manual Next router now updates before board rendering, and supplies a new route context on navigation. A memoized original creation toolbar otherwise retained the old board ID after switching. Rename query parameters are preserved.

## Actual verification

Before edits, the maintained `check-card-toolbar-menu.cjs` passed its existing native copy-card, real clipboard paste, remove/delete and restart checks.

- `node --test tests/canvas-history.test.cjs tests/text-elements.test.cjs`: 3 tests passed. Real isolated SQLite transactions, group membership/connection restoration, rejection rollback, other-board/view isolation and text-element constraints.
- `check-clipboard-history.cjs`: real OS clipboard and mouse/keyboard, two-card rich-content cloning, internal edge ID rewriting, paste undo/redo, move undo/redo, Delete undo with connection restoration, Lexical C/V/Z/redo, cross-board paste and history scope, group expansion/membership, shape copy/undo, no duplicated scene IDs, normal restart.
- `check-real-image-paste.cjs`: native board and Lexical image paste, image-placement C/V and undo/redo, original pixel decoding, SHA-256 CAS deduplication, original file retained by undo, gallery and normal restart.
- `check-canvas-undo-kinds.cjs`: actual pen gesture undo/redo, native mindmap root copy and placement identity, paste undo/redo, root deletion undo.
- Maintained `check-text-shape-tools.cjs`: actual native text/shape creation, editing, move, style, deletion and restart passed during investigation of the scene race.

Only related tests were selected; the complete desktop suite was not run. This is isolated InkBridge runtime testing plus static original-source verification, not a fresh runtime comparison with production FlexNote or a two-physical-PC test. Native IME handling was left intact; no new physical IME certification is claimed.

## Explicit remaining clipboard boundaries

The shipped generic paste converter accepts legacy `Mindmap` placements, while the newer Canvas emits `MindmapNode`. Whole roots are adapted to that native placement contract and rehydrated with the existing layout; copies reference the same map content, as the original converter specifies.

No supported independent-child-subtree clipboard contract was found in this complete generic chain. That case now reports the limitation instead of displaying unpersisted nodes. Designing subtree duplication needs a separate confirmed contract. Native pen duplication remains its existing toolbar operation; a new pen clipboard format and cross-window structured-canvas clipboard transport are not claimed in this change. Editor text/image clipboard behavior remains native.

Whiteboard-version-history GUI remains disabled; enabling undo/redo does not implicitly enable that separate feature. No schema migration or OneDrive protocol change is introduced.

## Portable delivery, 0.5.12

- Runtime commit: `bcc45bf300b4`; release sequence 13. Portable directory: `release/InkBridge-0.5.12-bcc45bf300b4-2b236c`, entry `Start-InkBridge.bat`.
- Packaged runtime passed `check-clipboard-history.cjs` (including SQLite equality after normal restart) and `check-canvas-undo-kinds.cjs` using isolated temporary profiles. Its final scene screenshot was inspected. The clipboard test uses keyboard events without refocusing the contenteditable before each key, and waits for actual clipboard acknowledgement/caret collapse.
- Published twelve uniquely named direct signed deltas for the recorded portable bases 0.5.0–0.5.11 into `C:\Users\ji3cp\OneDrive - Foxconn\01_Home\21_InkBridge`. Every package passed the real Windows update helper's signature/hash/path Stage checks and destination copy hash validation. This verifies the local exchange directory, not cloud upload or arrival on another PC.
- Current 0.5.11 → 0.5.12 delta: `InkBridge-update-945b1025-57ea-46ab-afd7-286d68e9637f.zip` and matching `.json`, 6,059,548 bytes, 11 changed/new files. Existing snapshots/assets were not altered. Receipt: ignored `release/clipboard-delivery.json`.
- Existing portable installations can use **更新並重新啟動** after their matching package arrives. Updates do not overwrite a development Git checkout. No new manual full-ZIP extraction is required for these recorded bases.
