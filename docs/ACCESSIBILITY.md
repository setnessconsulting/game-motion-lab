# Motion Lab — accessibility contract

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).

Accessibility is an **architecture requirement**, not a final polish task. A learner must be able to
complete the required scientific reasoning **without precision canvas interaction**.

## 1. The central requirement

> The complete assessed investigation — mission, prediction, controlled configuration, run,
> measurement, recording, comparison, graphing, claim, evidence, and debrief — must be completable
> using only semantic controls, from the keyboard, without needing the canvas renderer.

If a required piece of evidence exists only inside the Phaser canvas, or only as SVG geometry, the
feature is not complete.

## 2. Required capabilities

| Requirement | Binding detail |
| --- | --- |
| Pointer, touch, and keyboard paths | Every essential action is reachable by all three. Pointer and touch may share a path. |
| Visible focus | A visible focus indicator on every focusable control, at high contrast, in every theme. |
| Logical focus order | DOM order matches reading order; focus is never trapped except in a deliberate modal, which returns focus on close. |
| Semantic controls | Real `<button>`, `<input>`, `<select>`, `<table>`-family elements; no clickable `<div>` for essential actions. |
| Non-drag alternatives | Every drag has a discrete alternative (buttons, steppers, sliders with keyboard support, or numeric entry). |
| Reduced motion | `prefers-reduced-motion` removes non-essential motion while preserving instructional meaning. Trajectory playback may jump/step instead of animate. |
| Non-color-only distinctions | Direction, state, selection, validity, and comparison series use shape, label, pattern, or text — never colour alone. |
| 200% zoom / reflow | At 200% zoom and narrow viewports, content reflows without loss of function or two-dimensional scrolling for text. |
| Readable scientific values | Instruments and tables expose values with units as text, at legible size, selectable and screen-reader readable. |
| Screen-reader trial data | Each completed trial is announced as structured data: configuration, changed/controlled variables, measured values with units. |
| Screen-reader evidence | Evidence selection, comparison, claim, and debrief are operable and readable without vision. |
| Semantic graph equivalents | Every graph has an associated data table (and a textual summary) exposing the same series and values. |
| Textual equivalents for essential audio | Any audio carrying required meaning has a visible and screen-reader-accessible text equivalent. |
| Renderer failure recovery | If the renderer fails, a semantic fallback presents the same measurements and the investigation remains completable; science state is untouched. |
| Error identification | Errors and invalid comparisons are announced (`role="alert"`/`aria-live` where appropriate) and described in text, not by colour. |

## 3. What participants must be able to do

The accessibility target is task-completion parity, expressed as observable journeys rather than a
checkbox:

1. **Keyboard journey** — complete a full guided mission with only the keyboard: predict, configure
   a controlled trial, run it, read the measurements, record it, run a second trial, open the
   comparison, read the graph's data table, select evidence, make a claim, and read the debrief.
2. **Screen-reader journey** — complete the same mission with a screen reader, obtaining every value
   required for the claim.
3. **Reduced-motion journey** — complete the mission with reduced motion enabled; instructional
   meaning is preserved even though animation is removed.
4. **Zoom journey** — complete a representative mission at 200% zoom without precision pointing.
5. **Non-colour journey** — complete a comparison task with a colour-vision-deficiency simulation
   active; all distinctions remain legible.
6. **Touch journey** — complete a representative mission on a touch emulation profile.
7. **Renderer-failure journey** — with the renderer forced to fail, complete a mission in the
   semantic fallback.

## 4. Automated versus manual evidence

- **Automated (axe-core, DOM assertions, Playwright journeys)** is used to catch structural
  regressions: missing names, contrast failures detectable by rule, focus order breaks, missing
  table equivalents, live-region misuse. It runs in the qualification lane (ML-14).
- **Manual (human) evidence** is required for: real screen-reader behaviour (NVDA/VoiceOver), real
  keyboard-only fluency, real zoom/reflow at 200%, and reduced-motion judgement. ML-16 owns these
  gates.
- **A passing automated suite is never reported as accessibility sign-off.** axe is assistive, not
  authoritative. No blanket WCAG conformance claim may be made without the corresponding human
  evidence, and no claim may be made for evidence that was not collected.

## 5. Evidence rules

Accessibility evidence must:

- name the exact candidate identity and environment ([`RELEASE.md`](RELEASE.md));
- distinguish automated from manual results;
- record unresolved findings explicitly as **open**, not as passes;
- be re-run when the candidate changes — old evidence does not carry over to a new candidate;
- avoid recording participant names or other personal data ([`PRIVACY.md`](PRIVACY.md)).

## 6. Interaction-design consequences

- Mission controls are React semantic controls first; canvas interaction is an **enhancement**.
- Animated playback has step, pause, restart, and jump-to-end equivalents.
- Graph reading has a numeric/table path and an explicit "read value at time" affordance that is
  keyboard reachable.
- Comparison tables are real tables with headers, captions, and scope.
- Force direction is always redundantly encoded (arrow head + text label + sign), never by colour.

These consequences are binding on ML-06 (renderer), ML-07 (instruments), ML-08 (notebook), ML-09
(graphs), ML-11 (vertical slice), ML-14 (automated qualification), and ML-16 (human review).
