# Reading UI maintenance

- Before changing typography, layout or component presentation, research suitable maintained packages and official standards online. Record sources, fixed versions, licenses, compatibility and why a candidate is adopted or rejected in `docs/UI-DEPENDENCIES.md`.
- Prefer an applicable existing component over inventing typography rules. Keep necessary adapters isolated and explain their purpose.
- Bopomofo is a primary reading feature: verify actual glyph alignment, symbol count, tones and readability across titles, buttons, passages and resume panels. DOM presence alone is not acceptance.
- Retain the existing source-text, saved-position, global-preference and parent-gate regression flows. Do not publish a known typography failure.
