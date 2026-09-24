# Motion Lab — release contract

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).
**Executed by:** ML-15 (candidate), ML-16 (human qualification), ML-PROMOTE (promotion/rollback), ML-18 (closeout).

Games-site owns hosting, the catalog, the selected production version pointer, promotion, and
rollback. This repository owns source, tests, the production build, and the request. The delivery
path and host contract are established by ML-HOST (GAME-385) following
`setnessconsulting/games-site`'s own `docs/game-release-contract.md`.

## 1. Release types and hosting shape

Motion Lab ships as a **static web** artifact:

```text
slug:     motion-lab
kind:     static-web
entry:    index.html
prefix:   motion-lab/<version>/
```

The Vite build uses a relative base by default so the artifact can be mounted beneath the versioned
prefix without rewriting asset URLs. Path/base compatibility is proven by ML-HOST using a bounded
non-production placeholder.

## 2. Immutable candidate identity

A released candidate is identified by **all** of the following, recorded together:

| Identity | Source |
| --- | --- |
| source Git SHA | `setnessconsulting/game-motion-lab` |
| dependency lockfile identity/digest | `package-lock.json` at that SHA |
| release version | immutable version string, e.g. `2026.09.24-slice.1` |
| aggregate build hash | hash over the built payload |
| per-file hashes, sizes, content types | release manifest |
| published prefix | `motion-lab/<version>/` |
| games-site promotion identity | games-site commit SHA that selects the version |
| automated qualification evidence | ML-14 record bound to the source SHA |
| human/comparator/science/accessibility evidence | ML-16 record bound to the candidate |

**Immutability rule.** Objects below an already-published `motion-lab/<version>/` prefix are
immutable. A rebuild always produces a **new** version; it never overwrites an accepted version. If
the candidate changes, its identity changes and the affected evidence must be re-run against the
new identity — old evidence does not transfer.

## 3. Qualification sequence

1. **ML-14 — automated qualification.** Science/golden/property fixtures, architecture-boundary
   tests, content/provenance validation, representative E2E, pointer/keyboard/touch journeys, axe
   checks plus explicit manual-gate placeholders, reduced-motion/non-colour/mute flows, cross-browser
   smoke, real-render lane, console/network assertions, clean production build, bundle/LCP/CLS deltas
   against the pinned ML-02 baseline, latency/long-task/memory checks, privacy assertion, and
   deterministic replay. Evidence is bound to the exact SHA.
2. **ML-15 — immutable non-production candidate.** Publish the exact ML-14-qualified build as a
   versioned, immutable, **non-production** candidate. Production stays `coming-soon`. Verify hosted
   asset paths, deep-linking/reload, console cleanliness, and a representative mission on the exact
   candidate.
3. **ML-16 — human/comparator qualification.** Comparator review against the scorecard's mapped
   dimensions, independent code/product review, science review of the *actual candidate*, manual
   accessibility review (keyboard, screen reader, zoom, reduced motion, non-colour), target-age
   learner playtest, real-device/browser observation, and originality/IP review. Remediation
   produces a **new** candidate and re-runs the affected evidence.
4. **ML-PROMOTE — promotion and rollback.** Promote exactly the ML-16-approved artifact. No rebuild
   between approval and promotion.

## 4. Promotion contract

Promotion is a reviewed change in `setnessconsulting/games-site`:

1. the catalog entry moves from `coming-soon` to `playable`;
2. the exact immutable release version and `kind` are selected;
3. repository CI and the hosted preview qualification pass on the exact candidate;
4. the reviewed change is merged; its merge SHA is the **games-site production promotion identity**.

Promotion must not rebuild the game. It selects an already-published, already-qualified artifact.

## 5. Rollback contract

- Rollback restores the **previous known-good** catalog release pointer and deploys that games-site
  revision. It never deletes or overwrites immutable game artifacts.
- The rollback target must be **known before** promotion work begins (recorded during ML-15).
- Rollback is **exercised**, not merely documented: ML-PROMOTE switches the production alias to the
  known-good deployment, verifies the collection and direct play route resolve correctly on both the
  Pages hostname and the custom domain, then restores the approved deployment if promotion remains
  accepted.
- The evidence records the exact deployments/commits before, during, and after the rehearsal, and
  confirms no immutable object was mutated.

## 6. Human qualification is never fabricated

The Epic forbids claiming unperformed human work. Specifically, this repository must not claim:

- human playtesting that did not occur;
- science approval that was not given by a named reviewer;
- accessibility sign-off without the corresponding manual evidence;
- comparator review that was not performed;
- real-device/browser testing that was not observed;
- production promotion that did not happen;
- rollback that was not exercised.

Where a human gate is pending, it is recorded as **pending** with the exact candidate identity, and
the release chain stops there.

## 7. LevelBest boundary

Motion Lab's release is a standalone games-site release. **No LevelBest change is part of any Motion
Lab issue.** A future LevelBest integration requires separate planning and authorization after
GAME-382 is complete.

## 8. Post-release reconciliation

ML-18 confirms that the repository documentation, Jira child statuses, and the live production state
describe the **same** final artifact: final source SHA, build identity, games-site pointer identity,
automated qualification result, human evidence, rollback evidence, mission inventory, dependency
decisions, asset provenance, known limitations, release notes, and README/docs consistency. Only
then may the Epic be closed.
