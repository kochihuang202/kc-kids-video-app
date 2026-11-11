# FlexNote 1.1.69 editor improvements: selective backport

## Scope and decision

Baseline Git: `2c99252dd44f4f919a23326b9665eb8bf094fce5` (InkBridge 0.5.12).
Reference: installed FlexNote **1.1.69**, compared with retained, unmodified **1.1.65** factories. This comparison does not assign every change specifically to 1.1.68 → 1.1.69.

Backport two compatible behavior changes into the existing complete components. Keep the current native editor, SQLite ACK, IME/save barriers and XMind-style layout integration. Do not replace the editor bundle or update the installed FlexNote.

| Finding | Decision / boundary |
| --- | --- |
| Mindmap Flow changes immediately notify the Canvas parent | Port; normal note cards retain their 300 ms throttle and latest trailing value. This is callback timing, not a synchronous SQLite COMMIT guarantee. |
| Canvas release exceptions do not abort subsequent owned releases | Port; retain all sixteen releases, ordering, lifecycle cancellation, surface disposal and host cleanup. Log errors rather than silently hide them. |
| Tabs content and Callout header/type/icon editing | Deferred feature integration. The new editor registers additional plugins and node/data contracts. Mixing that whole new bundle into the existing registry is not a verified dependency-compatible patch. No interface-only imitation is added. |
| Black edit border | Cosmetic change not included. No evidence that the color change fixes IME, long-text layout or flashing. |

InkBridge already reads live mindmap Lexical state via `FlowAdapter` → `readLiveEditor` → `mindmaps.acceptContent` → layout. The immediate native parent callback complements that bridge; JSON equality guards suppress repeat content writes. No frame-time improvement is claimed from this alone.

## Complete relevant chains checked before editing

1. Native lazy editor loader51245 → actual old editor73866 / new editor28988 → Flow34883 `onChange` → `onSave(content,nodeId)` → Canvas10764 edit overlay. The Canvas callback checks read-only/closing/node identity, then updates node content and its parent callback/layout. Normal cards still use elapsed-time throttling, trailing latest content, blur/unmount flush, and Ctrl+Enter flush.
2. New34883 branches only for `nodeType === MindmapNode`, after updating its live content ref and honoring the disabled ref; its callback dependency includes the mindmap condition. Backport uses the existing node-type binding as dependency, preserving existing InkBridge `onEditorReady` registration.
3. Native10764 initialization effect owns teardown. Both versions cancel the initialization timer, invalidate the async epoch, mark unmounted and clear editing state. Old teardown directly chains sixteen delete/clear calls; new teardown catches each of those independently, then continues the same surface/global/store/host cleanup. Existing epoch protection was already present; this port does not claim to add it.
4. The original surface-disposal and final host callback remain outside the new per-resource guards, matching the reference; this is not a guarantee that every possible teardown exception is caught.

### Factory identity (SHA-256, original factory bytes)

| Role | 1.1.65 | 1.1.69 |
| --- | --- | --- |
| Flow34883 | `73c4a523c460a014c06bcfed06e3c6fdfc8d84bc901d849b53f2441842e98195` | `a5caadd1130fdebd4b33b8e977cf652d21be3d937556a2c9e68bc64951d66d69` |
| Canvas10764 | `ecd98c43416144f5f4d7b1e81b19649f3c0f5a1c4af82f31383ee2c8aec9bff6` | `d344f528171adaa879a5db7f56541fc0b78d6ab13c7959b8937f435e79d27553` |
| Actual editor | `368030df73c9d262f0d9ddc448ec086c8532d9d1ca05908ddb2699a64ca1d6d9` | `81c560517e3f60e03a14b3aa6bd9df27411fba4e3efaf34a4ca1803a4caa6b46` |

Prior retained REA comparison: `ev_24977a80c27f0e4a6bebdc246b480b1288162fabb1d96fd2095fe8d728561346`. Parent analyses: `ev_09dbb38190d499a131221f2795f99c3c4c2fbc92ef775de744b5eba9d7db4357` / `ev_edebd06b6be99c51e37340c3326a56e5414479f961558fff371d717dc860a8a2`. Those graphs had partial semantic coverage; the conclusions above additionally follow the complete selected callbacks in the private source copies. Static findings are not original-app runtime measurements.

## Rebuild and rollback

Own patch: `scripts/original-reuse/apply-editor-169-patches.cjs`, called last by the established integration patch pipeline. It validates the retained source identity, unique callback/cleanup boundaries, syntax, and exactly sixteen release calls. Reapplying is idempotent; a changed identity fails closed. Other InkBridge patches stay intact.

```powershell
node scripts/original-reuse/apply-integration-patches.cjs
node scripts/original-reuse/collect.cjs
node --test tests/editor-169-port.test.cjs
node scripts/original-reuse/check-editor-169.cjs
```

Original sources stay private/ignored. The two `.before-editor-169` backups and `integration-patches.json` retain before/after hashes. To roll back only this port, remove its pipeline invocation, restore those two files from their specific backups, then collect again; do not restore the much older generic integration backups.

## Targeted acceptance, 2026-11-11

- Before editing: maintained `check-mindmap-keyboard.cjs` and `check-mindmap-appearance.cjs` passed on the Git baseline.
- Before editing: three new contract assertions failed as expected (second immediate mindmap change, changed node-type policy, cleanup continuation after a release exception); normal card throttle and normal teardown passed.
- After editing: `node --test tests/editor-169-port.test.cjs`: **6/6 passed**. These are isolated callback/scheduling/resource fault-injection tests, not physical UI or performance measurements.
- `check-editor-169.cjs`: real Electron + native Lexical + SQLite passed. Sequential Chinese/Latin mindmap text, ordinary note editing, Ctrl+S while editing, no-op repeat flush, normal restart and retained text. It captures the actual mounted React root only in the test browser, invokes real native cleanup, deliberately throws after the real engine release, and verifies the later CanvasKit-store reset and editing cleanup still complete.
- Actual failure-injection/restart evidence: `%TEMP%/inkbridge-original-modules-editor169-3ZQQba`; earlier map-only acceptance: `%TEMP%/inkbridge-original-modules-editor169-vJgiU3`. Editing screenshot inspected.
- Related regressions after editing: `check-mindmap-keyboard.cjs` and `check-mindmap-appearance.cjs` passed again, preserving branch style, markers, left/both-side navigation, delete continuation, editing and restart.
- Physical Windows IME and long-duration memory/performance improvement are not certified. Unicode input and the maintained composing-key guard are tested; they are not a physical IME claim. No unrelated full-suite run, schema migration, sync-protocol change or formal-data write.
