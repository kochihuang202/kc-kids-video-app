# Reading UI maintenance

- Before authoring or revising episode content, read `docs/AUTHORING.md`, including the user's 2026-10-17 requirements for psychological explanations, concrete child-facing language, interleaved story/commentary, and letting go of fixation on winning or blame.
- For each scene, establish the event, each character's expectation, the obstacle, their interpretation and blame, and their response before choosing psychological concepts. Check dialogue referents and exclude unrelated scenes. Use the SUPER YA missed-ride / three-day-wait correction in `docs/AUTHORING.md` as the concrete regression example.

- Before changing typography, layout or component presentation, research suitable maintained packages and official standards online. Record sources, fixed versions, licenses, compatibility and why a candidate is adopted or rejected in `docs/UI-DEPENDENCIES.md`.
- Prefer an applicable existing component over inventing typography rules. Keep necessary adapters isolated and explain their purpose.
- Bopomofo is a primary reading feature: verify actual glyph alignment, symbol count, tones and readability across titles, buttons, passages and resume panels. DOM presence alone is not acceptance.
- Retain the existing source-text, saved-position, global-preference and parent-gate regression flows. Do not publish a known typography failure.
