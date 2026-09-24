# ADR 0004 — Display rounding, tolerances, and correctness are separated

- **Status:** Accepted (frozen)
- **Date:** 2026-09-24
- **Jira:** GAME-382 (Epic), frozen by GAME-383 (ML-01)
- **Relates to:** [ADR 0001](0001-typescript-science-authority.md)

## Context

The Epic forbids a hidden tolerance or rounding rule that can change correctness. In practice this
is where educational software usually leaks: a nicely rounded value is shown to the learner, the
learner types it back, and the checker compares it against a differently rounded internal value
with an unstated epsilon. The result is that the same physical answer can pass or fail depending
on presentation.

## Decision

1. **Authoritative values are never rounded.** Stored, compared, and replayed values are
   full-precision IEEE-754 doubles.
2. Rounding happens exactly once, at the presentation boundary, using a single canonical
   round-half-away-from-zero algorithm and a frozen per-quantity decimal count
   ([`../SCIENCE_MODEL.md`](../SCIENCE_MODEL.md) §7).
3. A displayed value is **never** written back into domain state.
4. Answer comparison uses one explicit, authored tolerance policy with frozen defaults; its
   parameters are recorded in the scenario provenance manifest and are visible, not hidden.
5. Categorical answers (variable selection, claim, evidence, multiple choice) are compared
   **exactly**, with no tolerance and no fuzzy matching.
6. A sign error fails regardless of magnitude.
7. **Display round-trip safety is an invariant:** for every canonical scenario, reading a displayed
   value and entering it verbatim always passes, because the tolerance floor exceeds the display
   half-increment by at least 4×. A content validator asserts this and reports values that sit
   within `1e-9` of a display rounding boundary as content defects.

## Consequences

- Presentation can be re-styled (more decimals, different instrument skin) without changing any
  correctness outcome.
- Golden fixtures can assert exact authoritative values while separately asserting display strings.
- Content authors carry a small obligation to avoid display-boundary values; the validator makes
  that obligation mechanical instead of a code-review hope.
