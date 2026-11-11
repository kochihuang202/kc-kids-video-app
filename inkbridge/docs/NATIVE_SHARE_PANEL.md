# Native sharing panel integration

The original complete `46979.n2` share modal mounts the complete `78178.M`
web-sharing panel inside the existing Canvas/Flow/Redux/Theme providers. The
share entry uses the original `46979.uR` / `46979.V4` control styles and icon
`73176`. The previous top-right export button and separate result notification
are removed. Offline packages are available under **More options** in the panel.

## Source and reproducible adaptation

- `46979` reference factory SHA-256:
  `cba922d999fccbb9b3df078b7b7e368262a6785adc15da51b67c2e2d978682f8`.
- `78178` reference factory SHA-256:
  `dc7fb9273b90a4801e5cb134f97ac9f16b7c4b8378e93b5b51c41380df6bea04`.
- Run `node scripts/original-reuse/prepare-sharing.cjs`, then
  `node scripts/original-reuse/collect.cjs` from `inkbridge`.
- The generator verifies the exact private editable-source baseline, records
  before/after SHA-256 values, preserves `.before-sharing` copies, and rejects
  ambiguous AST anchors or invalid syntax. Repeated runs are deterministic.
- Recovered factories, modified private factories, their backups and generated
  runtime registrations remain in the ignored private artifact directory.
  Git contains only the generator, IPC adaptation, tests and this explanation.

## Preserved behavior and approved extensions

The native modal/header/body/footer, publishing controls, enabled switch, copy
link, update time and success state remain native components. The original
subscription/account service boundary is replaced with the actual InkBridge
device connection; membership or quota are never fabricated for FlexNote.
Unsupported view-count text and subscription quota wording are removed.

The native descendant-checkbox region is extended to a tree using the same
native checkbox component (`19764.K`). Selection is keyed by board ID, not row
or title. The root is mandatory. Checking a descendant adds required ancestors;
unchecking a parent removes descendant membership. Duplicate references share
one selection; cyclic references terminate at already visited nodes. The
selected set is supplied to one atomic root publication, rather than publishing
each descendant separately.

The connection form, image preset, per-image lossless overrides, attachment
counts, source capacity, pending uploads, resume/cancel and offline-package
controls adapt the user-approved independent Cloudflare backend. Opening the
modal queries status and scope; only an explicit Publish/Update action uploads.
The host captures a committed version, then releases editing during conversion
and upload. Native UI does not directly read files or expose device keys.

## Focused verification

- `node --test tests/share-panel-selection.test.cjs`: ancestor selection,
  duplicate references, cycles and descendant cancellation.
- `node scripts/web-share/check-panel.cjs`: actual isolated Electron, native
  modal, original bottom-right entry, pending Lexical content committed into
  actual SQLite, offline export, initial root-only scope and modal close.
- Setting `INKBRIDGE_TEST_SHARE_DEVICE` to an existing device setting filename
  enables actual online testing. A settings-only helper creates a single-use
  pairing code; the test connects its isolated profile through the real UI,
  checks descendant selection and publishes twice to verify a stable URL.
  Neither credential bytes nor pairing codes are printed in test receipts.

The settings-only helper opens no notes or database. A safeStorage ciphertext
must not simply be copied across profiles: encryption also depends on that
profile's Chromium encryption state. Independent devices use actual pairing.

Actual acceptance receipts and remaining limitations belong in the main
sharing test report; the existence of the native panel alone does not establish
that online publication or every media format has passed.

### Actual panel acceptance (2026-11-12)

The unconfigured-device test passed with an actual isolated Electron window,
pending Lexical text, SQLite and an offline root-only package. The configured
test then passed using the real deployed `inkbridge-share.pages.dev` service:
single-use pairing through the actual form, root-only initial selection,
grandchild/ancestor linkage, parent cancellation, all-descendant selection,
three-board offline export and two explicit native Publish/Update actions.
Both publishes retained the same URL; the second received a new version.

- Synthetic share: `https://inkbridge-share.pages.dev/s/eba367e6fbc5a3566bdfb01fea77d5759f4bf7fd/?shareId=root`
- Second version: `de882e56-3c7c-4c34-816b-49e17f30f2a6`.
- Isolated artifact directory: `%TEMP%/inkbridge-original-modules-share-panel-DGTan7`.
- Screenshot `native-share-panel.png` was personally inspected. No renderer
  errors were recorded. No formal notes or databases were opened by this test.

These receipts verify the native-panel integration and publication actions.
The separate reader/media/large-PDF tests remain responsible for their own
coverage; this panel test does not replace those checks.
