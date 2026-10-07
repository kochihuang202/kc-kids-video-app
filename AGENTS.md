# Regression guardrails

Before changing code, search `docs/REGRESSIONS.md` for bugs related to the files or user flow in scope.

- Run the new feature test and every related historical regression test first.
- Run the complete Playwright suite only for core shared modules or large cross-cutting changes.
- Reuse existing `.spec.ts` flows; do not rediscover the whole website when a maintained test already describes the flow.
- When a historical regression fails, inspect the product code first. Do not delete, skip, or weaken the test to match broken behavior.
- Change a historical expectation only when the user explicitly changes the intended behavior, and record that decision in the regression entry.
- Add a regression entry and the smallest real user-flow test when a confirmed important bug is fixed.

# Git commit SOP

After completing each feature, fix, or task — once tests pass — immediately run:

```
git add -A
git commit -m "<type>: <short description>"
```

- Do NOT wait for the user to ask. Commit proactively after every completed task.
- If tests are failing, note it in the commit message but still commit the working tree so progress is not lost.
- Use conventional commit prefixes: `feat:`, `fix:`, `refactor:`, `test:`, `chore:`.
