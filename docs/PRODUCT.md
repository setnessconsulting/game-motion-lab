# Motion Lab — product contract

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).

## Vision

Motion Lab is a **mission-based experimental physics game**. The learner is a junior motion
engineer at a small vehicle-testing laboratory. Problems arrive as engineering missions, and the
learner solves them the way a real engineer does: by designing **controlled experiments**,
measuring, comparing evidence, and defending a claim.

The core experience is one loop:

```text
Mission -> question -> prediction -> identify variables -> configure trial -> run
        -> measure -> record -> graph -> compare -> claim -> cite evidence -> revise/debrief
```

The learner should need **evidence**. A learner must not be able to complete an assessed mission by
memorizing a fact, watching an animation, or clicking until something works.

## Why it exists

The existing free middle-school forces/motion references are strong on simulation and weak on
*instructional boundedness*: they are sandboxes in which a learner can change many things at once
and never has to reason about experimental design. Motion Lab keeps the scientific transparency of
those references while making **controlled investigation, evidence comparison, and claim
construction** the actual game.

## Learner and grade scope

| Property | Frozen value |
| --- | --- |
| Primary target | grades 6–8 |
| Typical learner age | 11–14 |
| Reading level of instructional copy | grade 6–7 plain language; short sentences; defined terms on first use |
| Prior knowledge assumed | arithmetic with decimals; the idea that a push can start or stop something |
| Prior knowledge not assumed | algebra, vectors beyond a signed number line, calculus, trigonometry |
| Assumed device | a browser on a laptop, tablet, or phone; pointer, keyboard, or touch |
| Session shape | one mission = one self-contained session, target 6–12 minutes |
| Full content set | 4 mission families, playable independently in any order the mission select allows |
| Persistence | none required for completion; no account; no cross-session dependency |
| Arithmetic burden | deliberately small (see [`CURRICULUM.md`](CURRICULUM.md)); reasoning burden carries difficulty |

## Session shape

A mission session has bounded phases. Each phase has one job and a visible next step.

1. **Brief** — the engineering mission and its question, in one screen or less.
2. **Predict** — the learner commits to an expectation before measuring.
3. **Design** — the learner identifies the independent, dependent, and controlled variables and
   configures a trial.
4. **Run** — the learner runs the experiment; authoritative motion is presented in the Phaser lab.
5. **Measure and record** — instruments report authoritative values; the trial becomes an
   immutable evidence record.
6. **Compare** — a second (and further) trial is run under a controlled change; the notebook and
   comparison table make the changed and controlled variables explicit.
7. **Graph** — position-time and velocity-time evidence is inspected where the mission requires it.
8. **Claim and evidence** — the learner states a claim and cites the trials/graphs that support it.
9. **Debrief** — authored explanation, misconception feedback, and a non-punitive revision path.

A session must be completable without leaving the mission. There is no hub, no currency, no
level-grind, and no requirement to replay earlier missions to unlock the assessed one.

## Interaction promise

- Every essential action has a pointer path, a keyboard path, and a touch path.
- Every essential action has a **non-drag** alternative.
- Nothing essential requires precision canvas manipulation.
- The renderer is decorative-with-purpose: if it fails, the investigation remains completable in a
  semantic fallback experience, and science state is never corrupted.

## Non-goals (v1)

v1 is explicitly **not**:

- an open-ended physics sandbox or slider toy;
- a 2D rigid-body playground;
- a trivia or worksheet-with-animations product;
- projectile-motion, rotational, torque, or orbital curriculum;
- a collision-dynamics product;
- a free-body-diagram authoring suite;
- an algebra-heavy mechanics course;
- multiplayer, competitive, or leaderboard-driven;
- an account/progression platform;
- an AI tutor or LLM-graded experience;
- a **LevelBest** integration (explicitly outside GAME-382; requires separate authorization);
- a general-purpose motion engine for future games.

Any of the above requires a separate Jira scope decision. It may not be grown inside a Motion Lab
story.

## Product-level anti-patterns

These are defects, not taste differences:

| Anti-pattern | Why it is a defect |
| --- | --- |
| Mission completable by clicking every control in order | Removes the need for evidence |
| Answer discoverable from the renderer without measuring | Renderer has become truth authority |
| Multi-variable change silently accepted in an assessed comparison | Teaches an invalid experimental method |
| A correct claim accepted with no supporting evidence | Removes the evidence requirement |
| Streak/FOMO/loot/timer pressure | Prohibited by [`PRIVACY.md`](PRIVACY.md) and the Epic |
| Required science conveyed only by color, motion, or audio | Violates [`ACCESSIBILITY.md`](ACCESSIBILITY.md) |

## Acceptance of this contract

This document is frozen by GAME-383. Changes require an entry in
[`DECISIONS.md`](DECISIONS.md) with a Jira reference and an owner decision where the change alters
learner scope or a non-goal.
