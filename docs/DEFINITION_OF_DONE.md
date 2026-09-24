# Motion Lab — Definition of Done

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).

An issue is **not** Done because code was written, a branch exists, or a build passed. It is Done
when its acceptance criteria are met **and** the evidence below exists and is bound to an exact
commit. Nothing may be claimed that was not executed.

## 1. Per-issue Definition of Done

An issue may be transitioned to Done only when **all** of the following hold:

1. **Authority respected.** The change stays inside the boundaries in
   [`ARCHITECTURE.md`](ARCHITECTURE.md); no scientific authority moved into the renderer or the
   React layer; no forbidden dependency was introduced.
2. **Scope respected.** Nothing beyond the issue's declared scope was added; in particular no
   curriculum expansion ([`CURRICULUM.md`](CURRICULUM.md)), no LevelBest change, and no story
   borrowing a downstream story's work.
3. **Focused commits.** Commits are reviewable and reference the Jira key. Unrelated work is not
   mixed in.
4. **Verification executed locally.** The issue's authoritative commands were run and their real
   output recorded. `npm run build` alone is not sufficient evidence for a behavioural change.
5. **Tests for the behaviour.** New behaviour has tests at the appropriate level (unit, property,
   golden, architecture-boundary, browser). A behaviour change without a test is not Done.
6. **No unexplained regression.** No previously passing gate was disabled, skipped, or loosened to
   make the issue green. Any waiver is explicit and recorded.
7. **Docs updated.** Any contract, command, or behaviour described in `docs/` or `contracts/` is
   updated in the same change, and `node scripts/verify-contracts.mjs` passes.
8. **Console/network clean.** Qualified browser flows have no unexpected console errors and no
   unintended learner-data transmission.
9. **Evidence recorded on Jira.** Source SHA, PR (if any), materially changed components, exact
   commands run, observed results, known limitations, and any human evidence still **pending**.
10. **Honesty.** No claim of human playtesting, science approval, accessibility sign-off, comparator
    review, real-device testing, production promotion, or rollback unless it actually occurred.

## 2. Epic Definition of Done (GAME-382)

The Epic is Done only when every one of these is true, each backed by durable evidence:

1. Canonical product/science/architecture/UX decisions are committed in this repository.
2. A clean clone builds with documented commands.
3. Deterministic analytical physics and the experiment/evidence contracts are independently
   testable.
4. All four production mission families are complete and science-reviewed.
5. The full loop — prediction → experiment → measure → graph → compare → claim → evidence →
   debrief — is playable.
6. Phaser and React remain subordinate to the deterministic TypeScript science/game state.
7. Accessibility and input-parity evidence is current for the candidate.
8. Science, E2E, accessibility, browser, performance, privacy, provenance, and architecture gates
   pass.
9. Comparator/originality and target-age human gates pass.
10. The exact approved candidate is promoted and rollback is proven.
11. Exact source SHA, build identity, games-site promotion identity, QA/science/human evidence,
    known limitations, and release notes are recorded.
12. Repository docs, Jira, and games-site describe the same final state.
13. No unresolved release-blocking issue remains.

## 3. Immutable candidate and rollback rules

- A candidate is identified by the full identity set in [`RELEASE.md`](RELEASE.md) §2.
- Published artifacts under `motion-lab/<version>/` are immutable; a rebuild is a new version.
- Evidence is bound to a candidate identity. If the candidate changes, the affected evidence is
  **re-run**; it never transfers.
- Promotion selects an already-qualified immutable artifact and does not rebuild it.
- Rollback restores a known-good pointer and never mutates or deletes an immutable artifact, and it
  is **exercised**, not just documented.
- The rollback target is identified before promotion work begins.

## 4. Stop conditions

Work stops and the owner is asked when the next step requires a decision or evidence that automation
cannot truthfully produce:

- an owner product/scope decision (including any curriculum expansion or non-goal change);
- credentials or access not available to the agent;
- a real Figma design action (ML-DESIGN);
- human science review (ML-05, ML-13, ML-16);
- target-age learner playtesting (ML-11 experiential, ML-16);
- manual accessibility sign-off (ML-16);
- real physical-device/browser observation (ML-16);
- production promotion authorization (ML-PROMOTE);
- any destructive or owner-gated action.

Before stopping, every safe preparatory step is completed, and the exact pending gate is recorded.
Simulating a human gate is never acceptable.
