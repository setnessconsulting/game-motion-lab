# Motion Lab — decision register

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).
**Machine-readable form:** [`../contracts/decisions.v1.json`](../contracts/decisions.v1.json).

This register exists so that no product, science, or architecture decision that can materially
change ML-02 through ML-11 was left implicit. Every entry is one of:

- **Frozen** — decided here, binding on implementation.
- **Delegated** — deliberately decided by a named downstream issue, with explicit guardrails that
  prevent it from changing the science/authority contracts.
- **Owner-gated** — requires a real owner or human action that automation cannot truthfully perform.

Changing a frozen decision requires: a documented implementation finding, an entry below, a Jira
reference, and owner authorization where the change is architectural, privacy-affecting, or alters
learner scope or the science authority.

## Frozen decisions

| ID | Decision | Owned by |
| --- | --- | --- |
| D-001 | The science authority is a pure TypeScript package with no DOM/React/Phaser/storage/network dependency | [`ARCHITECTURE.md`](ARCHITECTURE.md), [ADR 0001](adr/0001-typescript-science-authority.md) |
| D-002 | React and Phaser are presentation only, coupled by a typed view model and bounded intents | [ADR 0002](adr/0002-react-phaser-presentation-boundary.md) |
| D-003 | Motion is analytical and 1D; no physics engine or numerical integrator produces an authoritative value | [ADR 0003](adr/0003-analytical-1d-motion-over-rigid-body-engine.md), [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) |
| D-004 | SI units; `+x` is rightward; `x0 = 0`, `v0 = 0` by default; the lab frame is inertial | [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) §2 |
| D-005 | Governing relations are `Fnet = ΣF`, `a = Fnet/m`, `v(t) = v0 + at`, `x(t) = x0 + v0t + ½at²` | [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) §3 |
| D-006 | A resistive force exists only when explicitly declared, is constant within a segment, and opposes the declared motion; drag and friction transitions are out of v1 | [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) §4 |
| D-007 | Authoritative values are never rounded; display rounding uses one canonical round-half-away-from-zero rule; display values never feed back | [ADR 0004](adr/0004-display-rounding-separated-from-correctness.md), [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) §7 |
| D-008 | Numeric answer tolerance is authored and recorded; categorical answers are compared exactly; a sign error always fails | [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) §7.4 |
| D-009 | One independent variable changes at a time in every assessed comparison; violations are prevented or surfaced as invalid | [`CURRICULUM.md`](CURRICULUM.md), [`MISSIONS.md`](MISSIONS.md) |
| D-010 | v1 is deliberately bounded to the 1D NGSS MS-PS2-2 slice; projectile/rotational/collision/energy/momentum curriculum is out of scope | [`CURRICULUM.md`](CURRICULUM.md) |
| D-011 | Difficulty increases through reasoning burden (Guided → Supported → Independent → Diagnosis → Evidence challenge), not numeric size | [`CURRICULUM.md`](CURRICULUM.md), [`MISSIONS.md`](MISSIONS.md) |
| D-012 | Four canonical mission families are the v1 content set, with Calibration Run, Thruster Test, Cargo Load Test, and Mystery Cart Investigation as defined | [`MISSIONS.md`](MISSIONS.md) |
| D-013 | Thruster Test carries the mandated requirement that ≥1 production scenario needs graph interpretation to succeed | [`MISSIONS.md`](MISSIONS.md) |
| D-014 | Mystery Cart is diagnosed from controlled evidence, never an answer key; single-trial and guess strategies must fail | [`MISSIONS.md`](MISSIONS.md) |
| D-015 | Scored comparators are PhET Forces and Motion: Basics, Algodoo, and Poly Bridge 3; Kerbal Space Program is reference-only and never globally scored | [`COMPARATORS.md`](COMPARATORS.md) |
| D-016 | The quality scorecard rows and their Meets/Below definitions are frozen, including the gate summaries | [`QUALITY_SCORECARD.md`](QUALITY_SCORECARD.md) |
| D-017 | The complete investigation is completable with semantic controls, without precision canvas interaction | [`ACCESSIBILITY.md`](ACCESSIBILITY.md) |
| D-018 | Automated accessibility checks never constitute accessibility sign-off; manual evidence is required and never fabricated | [`ACCESSIBILITY.md`](ACCESSIBILITY.md) |
| D-019 | The learner runtime is local-first with no accounts, trackers, telemetry, LLM calls, or remote learner data | [ADR 0005](adr/0005-local-first-no-learner-telemetry.md), [`PRIVACY.md`](PRIVACY.md) |
| D-020 | No third-party observability SDK ships to measure performance; evidence is collected at development/qualification time | [`PERFORMANCE.md`](PERFORMANCE.md), [`PRIVACY.md`](PRIVACY.md) |
| D-021 | Performance is a measurement methodology plus a pinned ML-02 baseline capture; thresholds are not invented to pass an issue | [`PERFORMANCE.md`](PERFORMANCE.md) |
| D-022 | Every production scenario carries a complete, schema-valid provenance manifest; an unreviewed scenario may not ship | [`PROVENANCE.md`](PROVENANCE.md) |
| D-023 | Every nontrivial asset records origin, tool/author, license, and derivation; unknown-origin assets may not ship | [`PROVENANCE.md`](PROVENANCE.md) |
| D-024 | Released candidates are immutable and identified by source SHA, lockfile digest, version, build hash, prefix, and games-site pointer | [`RELEASE.md`](RELEASE.md) |
| D-025 | Promotion selects an already-qualified artifact without rebuild; rollback is exercised and never mutates immutable artifacts | [`RELEASE.md`](RELEASE.md) |
| D-026 | The technology baseline is frozen: TypeScript, React 19, Vite, Phaser 4.2.1, SVG/React graphs, Vitest, Playwright, axe-core, Figma, Web Audio | [ADR 0006](adr/0006-frozen-technology-baseline.md) |
| D-027 | LevelBest integration is out of scope for GAME-382 and must not be added | GAME-382, [`RELEASE.md`](RELEASE.md) §7 |
| D-028 | ML-11 is a hard gate: no production content expansion or final polish before the vertical slice proves the loop | GAME-382, [`DEFINITION_OF_DONE.md`](DEFINITION_OF_DONE.md) §4 |
| D-029 | Target grade band is 6–8; instructional copy targets a grade 6–7 reading level | [`PRODUCT.md`](PRODUCT.md) |
| D-030 | Session shape is one self-contained mission, target 6–12 minutes, with no hub, currency, or unlock grind | [`PRODUCT.md`](PRODUCT.md) |

## Delegated decisions

These are intentionally **not** decided in ML-01. Each is owned by a named issue and carries
guardrails that prevent it from changing the frozen science/authority contracts. Delegation is not
ambiguity: the *contract* is frozen even though the *value* is authored later.

| ID | Deferred to | Decision left open | Guardrails |
| --- | --- | --- | --- |
| G-01 | ML-02 | Exact performance thresholds/budgets | Thresholds are set **with** the baseline capture and versioned next to it; they may not loosen the methodology, and any loosening is recorded |
| G-02 | ML-02 | Exact package manager/lockfile and CI workflow shape | Must be credential-free and run the same authoritative commands locally |
| G-03 | ML-02 | Lazy-loading strategy for the Phaser chunk | Must not change the science authority or introduce a remote asset/telemetry path |
| G-04 | ML-05 | Exact scenario values, mission copy, and variant seeds within the frozen bands | Must satisfy [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md) §8 and [`MISSIONS.md`](MISSIONS.md) content rules |
| G-05 | ML-05 | Exact golden-trace format | Must remain human-readable enough for independent science review |
| G-06 | ML-07 | Instrument presentation details (layout, widget choice) | Must keep values textually available and never derive from renderer state |
| G-07 | ML-09 | Exact graph domain/scale-selection algorithm, within deterministic rules | Deterministic, tested, labelled, no misleading axes, always a table equivalent |
| G-08 | ML-10 | Exact scoring weights and hint framing | Must keep prediction/validity/evidence/claim separable, reward reasoning not dexterity, never reveal an answer key, and add no FOMO/pressure |
| G-09 | ML-10 | Exact retry bound | Must be unlimited or clearly bounded and non-punitive |
| G-10 | ML-12 | Production art/audio asset list | Must be original, provenance-recorded, and IP-separated from comparators |
| G-11 | ML-13 | Number of variants per family and their value sets | Variants must preserve the assessed relationship and not require re-review of the science contract |
| G-12 | ML-DESIGN | Detailed visual/interaction design and responsive breakpoints | Must not imply science values inconsistent with authoritative state, must preserve semantic DOM controls, must include reduced-motion/non-colour/focus states |

## Owner-gated decisions and gates

These require a real human action and cannot be satisfied by automation:

| ID | Gate | Owner action required | Issue |
| --- | --- | --- | --- |
| O-01 | Production design authority | Provide or approve a real Figma file/handoff (or an equivalent recorded production design authority) | ML-DESIGN (GAME-387) |
| O-02 | Science review | A named reviewer independently reviews scenario science and closes high-severity findings | ML-05, ML-13, ML-16 |
| O-03 | Target-age learner playtest | Observe an actual target-age learner on the exact candidate | ML-11 (experiential), ML-16 |
| O-04 | Manual accessibility review | Keyboard/screen-reader/zoom/reduced-motion/non-colour review by a human | ML-16 |
| O-05 | Real device/browser observation | Observe the candidate on real hardware | ML-16 |
| O-06 | Production promotion authorization | Authorize promoting the exact approved candidate | ML-PROMOTE (GAME-401) |
| O-07 | Rollback authorization | Authorize/serve the production rollback rehearsal | ML-PROMOTE |

**None of O-01…O-07 blocks ML-02 through ML-11 from starting.** They gate ML-11's *experiential
sign-off*, ML-DESIGN's design-authority claim, and the release chain. Each is recorded as pending
until it actually happens, and no document may claim it passed.

## Open decisions

There are **no open decisions that can materially change ML-02 through ML-11.** The only items that
remain open are the delegated values in G-01…G-12 (bounded by their guardrails) and the owner-gated
human gates in O-01…O-07 (which gate later milestones, not the freeze). If implementation reveals
that a frozen decision is materially wrong, the finding is added here and the contract is amended
rather than silently diverging.

## Change log

| Date | Entry | Change |
| --- | --- | --- |
| 2026-09-24 | ML-01 initial freeze | D-001…D-030, G-01…G-12, O-01…O-07 established |
