# Motion Lab — design authority

**Jira authority:** [GAME-382](https://setnessconsulting.atlassian.net/browse/GAME-382) (Epic).
**Delivered by:** [GAME-387](https://setnessconsulting.atlassian.net/browse/GAME-387) (ML-DESIGN).
**Machine-readable form:** [`../contracts/design-system.v1.json`](../contracts/design-system.v1.json).
**Resolves:** delegated decision **G-12** ("detailed visual and interaction design including
responsive breakpoints") from [`decisions.v1.json`](../contracts/decisions.v1.json).
**Addresses:** owner gate **O-01** (production design authority).
**Builds on:** [`PRODUCT.md`](PRODUCT.md), [`SCIENCE_MODEL.md`](SCIENCE_MODEL.md),
[`ACCESSIBILITY.md`](ACCESSIBILITY.md), [`COMPARATORS.md`](COMPARATORS.md), and the ML-04
experiment contract in [`EXPERIMENT_MODEL.md`](EXPERIMENT_MODEL.md).

---

## 1. What this document is, precisely

### 1.1 It is the "equivalent production design authority" branch of AC1

GAME-387 AC1 asks for "a real Figma file/handoff **or equivalent production design authority**".
This document and its contract are that equivalent.

**No Figma file was produced, and none is claimed.** No Figma integration, credential, or
design-tool access was available. [`DEFINITION_OF_DONE.md`](DEFINITION_OF_DONE.md) §4 lists
"a real Figma design action (ML-DESIGN)" as an explicit **stop condition**, and states that
simulating a human gate is never acceptable. So every safe preparatory step was completed and the
exact pending gate is recorded instead of being papered over.

`contracts/decisions.v1.json` records O-01 as an **owner-gated** decision: *"provide or approve a
real Figma file or equivalent recorded production design authority"*, owned by GAME-387. Taking the
equivalent branch discharges the ticket's acceptance criterion; it does **not** discharge the owner
gate. The owner still owes a real Figma file, or an explicit waiver in favour of this.

### 1.2 What it is

A machine-checked specification of every state GAME-387 names, bound to the identifiers the
implementation actually uses. Coverage, design-rule conformance, and honesty are enforced by
`npm run contracts`. The contract fails if a required state is dropped, if a design rule loses its
enforcement mechanism, if a spec/implementation divergence is undeclared, or if this package claims
review that did not happen.

The identifiers in this document are real. `src/ui/ExperimentControls.tsx`, `sceneGeometry`,
`directionWords`, `MISSION_PHASE_ORDER`, and the `--focus` token all exist. Where a state is **not**
implemented, this document says so with `implementationStatus`, and where a specification diverges
from shipped CSS it is recorded as an open finding rather than quietly reconciled.

Contrast ratios quoted below were **measured**, not estimated, and the checker recomputes every one
of them from the shipped stylesheet and renderer palette on each run. Changing a hex value without
updating this package fails `npm run contracts`.

### 1.3 What it is not

- Not a visual design tool file, and therefore not a substitute for one.
- Not human design review, aesthetic approval, or learner-experience sign-off.
- Not evidence that any screen has been seen, used, or judged by a person.
- Not an accessibility conformance claim — [`ACCESSIBILITY.md`](ACCESSIBILITY.md) §4 reserves that
  for ML-16 human evidence.
- Not evidence that a specified screen has been implemented. See §11.
- Not science. This design asserts no science beyond the frozen model and records no science finding.

### 1.4 Fidelity limits

Coverage is **specified, not depicted**. There is no screenshot, wireframe, or rendered mock.
Typography scale, spacing rhythm, iconography, and final art direction are specified as constraints
and tokens; their aesthetic quality is unjudged and belongs to ML-12. Interaction timing budgets are
proposed targets for ML-14 to measure, not measurements.

---

## 2. The one law the design inherits

> **Scientific truth never comes from the renderer.**

That is [`ARCHITECTURE.md`](ARCHITECTURE.md) §1 and ML-06's enforced boundary. For design, it
becomes a concrete rule:

> **No visual may state a scientific value that differs from authoritative domain state.**

Everything in this document is subordinate to that. A design that is beautiful and tells a learner
the wrong acceleration is worse than no design at all, because the learner will reason from it.

Practically, a visual may encode a value only when it is a **pure function** of that value from the
typed view model:

- force direction — arrowhead orientation, the sign of the arrow's displacement, **and** the words in
  the label, never colour alone;
- force magnitude — a fixed linear pixel-per-newton mapping with a declared full-scale cap, so the
  arrow cannot overstate or understate;
- position — the recorded sample's metres mapped to a track span, with no interpolation between
  samples as though the intermediate instants were recorded;
- the track scale — labelled metre ticks, so the scale is legible from the ruler rather than inferred
  from a bar's length.

Verified by `tests/unit/labGeometry.test.ts` and `tests/e2e/realRender.spec.ts`, which assert the
drawn geometry matches the pure function across advancing frames and viewport sizes.

---

## 3. The five design rules, and how each is enforced

| Rule | Requirement | How it is actually enforced |
| --- | --- | --- |
| **DR-01** | Vectors and labels must not imply science values inconsistent with authoritative state | Direction is encoded three ways over. Magnitude is a pure linear map. The scene reads no frame time and uses no tween, so it cannot ease or drift. `sceneGeometry` is a pure function of the view model. |
| **DR-02** | Graphs require semantic/table equivalents | Every graph ships a real `<table>` with the same series and values, plus a textual summary and a keyboard-reachable read-value-at-time control. No assessed question is answerable from graph geometry alone. |
| **DR-03** | Drag may be an enhancement only | No essential action has a drag-only path. Every drag affordance has a keyboard-reachable discrete equivalent — numeric entry, a stepper, or a range input paired with a readable value. |
| **DR-04** | Essential controls remain semantic DOM controls | Real `<button>`, `<input>`, `<select>`, `<fieldset>`, `<table>`. No clickable `<div>`, no ARIA-recreated widget. The canvas is `role="img"` with a label built from the same instrument readings the DOM shows. |
| **DR-05** | No comparator visual cloning | Layout, palette, iconography, copy, art, and audio are original and derived from this repository's own token set. The originality/IP review is ML-16's gate and **has not occurred**. |

DR-05 deserves a blunt note: documenting a direction is not performing the review. The IP boundary
in [`COMPARATORS.md`](COMPARATORS.md) stays absolute regardless — no comparator art, layout, name,
copy, audio, or scene composition may be reproduced under any circumstance.

---

## 4. Visual system

### 4.1 Colour, with measured contrast

Values are transcribed from `src/app/styles.css`; the renderer palette from `COLORS` in
`src/renderer/labScene.ts`. Contrast ratios are **measured**: WCAG 2.x relative luminance per sRGB
pair, then `(lighter + 0.05) / (darker + 0.05)`. The checker recomputes all of them on every run.

| Token | Value | Role |
| --- | --- | --- |
| `--surface` | `#0e1726` | page background |
| `--surface-raised` | `#16243a` | panel background |
| `--surface-sunken` | `#0a111c` | input well, table head, canvas bed |
| `--border` | `#4772ad` | panel and control boundary |
| `--ink` | `#e8f0fa` | primary text |
| `--ink-muted` | `#a9bed8` | secondary text, help text, axis labels |
| `--accent` | `#57d2c2` | primary action, current step, cart body |
| `--accent-ink` | `#04231f` | text on an accent fill |
| `--warn` | `#f2a03d` | force vector, invalid-state cue, fallback border |
| `--focus` | `#ffd166` | focus ring **only**; carries no meaning on its own |

Every text pairing measured clears the 7:1 AAA threshold, the lowest being `--warn` on
`--surface-raised` at **7.33:1** and `--ink-muted` on `--surface-raised` at **8.20:1**. Body text
(`--ink`) ranges 13.56–16.47:1.

In the renderer scene, measured against the scene background `0x0e1726`: force `8.44:1`, cart
`7.24:1`, progress rail `10.08:1`, labels `14.34:1` and `7.44:1`, track edge `3.19:1`, and the metre
ticks `4.25:1` — which matters because the ticks are what carries the scale, so that one is
load-bearing and is kept above the edge rather than merely above the threshold.

### 4.2 Two contrast defects, found by measurement and since fixed

Both were real, both were found because the checker recomputes the ratios instead of trusting this
document, and both are recorded in `resolvedFindings` rather than deleted:

- **OF-01 (was)** — `--border` on `--surface-raised` measured **1.60:1**, below the 3:1 WCAG 1.4.11
  threshold for a UI component boundary. **(now)** `--border` is `#4772ad` at **3.17:1**.
- **OF-02 (was)** — the scene track edge measured **2.21:1** against the scene background.
  **(now)** `0x45689f` at **3.19:1**, with the tick raised to `4.25:1` so the ruler stays the
  brightest scale cue.

Both fixes are **uniform channel scalings** (×1.65 and ×1.30) so hue and relative saturation are
unchanged. A free search for any passing colour returned saturated blues like `#204cff`, which clear
the ratio and would have wrecked the palette's muted character — a passing contrast number is not
the same as a good fix.

The cost is recorded rather than hidden: `--ink` on `--border` falls from `8.47:1` to `4.27:1`.
Nothing places text on the boundary, and the pairing is kept in the measured table with that verdict
so the trade is visible to the next reader.

A design gate that reported those as passing would be worse than useless.

### 4.2 The focus ring

A **3px solid `--focus` outline with a 2px offset and 4px radius**, applied through `:focus-visible`.

Three choices are load-bearing:

1. **Outline, not `box-shadow`.** An outline is not clipped by an ancestor's `overflow`, and it
   survives forced-colors mode.
2. **`:focus-visible`, not `:focus`.** Keyboard focus is visible without flashing a ring at a mouse
   user on every click.
3. **Never suppressed.** No element may set `outline: none` without an equally visible replacement.

Measured contrast of `--focus`: **12.46:1** on surface, **10.81:1** on raised surface.

### 4.3 Typography

Instrument numbers are the design's critical typographic decision: **tabular figures are mandatory**
wherever changing numbers are compared side by side, so digits do not shift horizontally while a
trial plays. The canvas status line is set in monospace for the same reason — a proportional face
would make the cart's readout reflow mid-run.

| Role | Size | Selector |
| --- | --- | --- |
| Page title | `clamp(1.4rem, 1.2rem + 1.2vw, 2rem)` | `.app__header h1` |
| Panel heading | `1.05rem` | `.panel h2` |
| Control label | `0.95rem` | `.field label`, `.fieldset legend` |
| Readout value | `1rem` inherited | `.readouts dd` |
| Help and hint | `0.9rem` | `.panel__hint`, `.field__help` |
| Table cell | `0.9rem` | `th`, `td` |
| Step chip | `0.82rem` | `.phase-list li` |
| Eyebrow | `0.75rem` | `.app__eyebrow` |

Canvas type is monospace: force label 18px, position line 15px, axis label 15px, progress line 14px.

### 4.4 Spacing and radii

`--gap` is `1rem`. The derived rhythm: 0.25rem inside a field, 0.5rem between actions, 1rem panel
padding, 1rem panel stack, 1rem section rhythm. Radii: 10px panel, 8px control, 6px input well,
4px focus ring, 999px step chip.

---

## 5. Layout and responsive behaviour

### 5.1 The three specified layouts

| Breakpoint | Viewport | Columns | Reading order |
| --- | --- | --- | --- |
| **Phone** | 0–599px | 1 | Brief → predict → experiment setup → lab view → instruments → trial record |
| **Tablet** | 600–1023px | 1 | Same order, wider measure, larger panel padding |
| **Desktop** | 1024px+ | 2 | Left: learner-authored inputs. Right: observation surface. Trial record spans full width |

The deliberate choice is that **tablet stays single-column**. Wider viewports are not given a second
column so the reading order of the investigation stays top-to-bottom, and the trial record always
spans full width because a comparison table must never be narrowed into horizontal scrolling.

### 5.2 The shipped grid now matches this specification (OF-03, closed)

This was a divergence and is now **fixed in the shipped CSS rather than in this contract**, because
the contract was already right. The rule used to be `repeat(auto-fit, minmax(320px, 1fr))`, which
reached two columns at **688px** — an arithmetic accident of a 320px floor plus a 16px gap plus 32px
of padding, never a designed breakpoint.

The tempting fix was to raise the floor to 488px, which produces exactly 1024px. That is the wrong
fix: **a fixed `minmax` floor larger than the viewport cannot shrink**, so a 320px phone — and 200%
zoom in a narrow window — would overflow horizontally and break the reflow contract.

What ships instead states the intent and cannot overflow:

```css
.app__grid { grid-template-columns: 1fr; }

@media (min-width: 1024px) {
  .app__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
```

`minmax(0, 1fr)` rather than `minmax(<length>, 1fr)`, so the columns can shrink below any intrinsic
minimum instead of overflowing it. The checker asserts all three properties: the base rule carries no
fixed floor, the media query is at 1024px, and the query uses a zero minimum.

### 5.3 The canvas box

`.lab-region__canvas` uses `aspect-ratio: 720 / 320`, `min-height: 160px`, `max-height: 60vh`. The
Phaser Scale Manager owns canvas sizing in FIT mode so the scene's logical space stays fixed and
independent of the screen — **CSS must never add a second sizing authority to the same element**.

A consequence worth stating: because the logical space is fixed, a viewport change can never change a
metre value. Pixels are presentation only and are never read back.

### 5.4 Reflow at 200% zoom

Reflow with no loss of function and no two-dimensional scrolling for text. Prohibited: a fixed-width
text container; horizontal scrolling to read a sentence, a label, or a unit; a table that forces the
page to scroll sideways to read a value; and text below 0.9rem that exists only to make a layout fit.

Wide tables scroll inside their own bounded, focusable region with a caption naming the columns —
rather than widening the page. The full data is always available in the instrument readouts regardless
of scroll position, so scrolling is a convenience and never the only path.

This has **not** been manually qualified at 200% zoom. That is ML-16's manual lane.

---

## 6. The required state inventory

This is GAME-387's core deliverable: every state the ticket names, specified and bound to real
identifiers. `implementationStatus` is honest — `implemented`, `partial`, or `specified`.

### 6.1 Mission brief, question, and prediction

- **`brief`** *(partial)* — the phase chip list and foundation notice exist; the authored mission brief
  does not. ML-05 content, presented by ML-10. Owner: GAME-389 / GAME-394.
- **`question`** *(specified)* — one screen or less, stating the question and the assessed evidence
  **without naming the answer**. Sourced from `scienceQuestion` in the mission-families contract.
  Owner: GAME-389 / GAME-394.
- **`predict`** *(implemented)* — `src/ui/PredictionForm.tsx`. A textarea plus save, a `role="status"`
  confirmation, and an explicit invitation to revise later. Revising a prediction after seeing
  evidence is part of the method, so **the copy must never imply a prediction is final**.

### 6.2 Variable identification and experiment setup

- **`variable-identification`** *(partial)* — `src/domain/variables.ts` classifies a change as
  `valid`, `unchanged`, `multiple-variables-changed`, or `controlled-variable-changed` and writes
  learner-facing pedagogy for every invalid case, so **no rejection is silent**. What does not exist
  yet is the screen that *shows* the learner which role each variable plays. Design requirement: the
  role is stated **in words, never by colour alone**. Owner: GAME-394.
- **`experiment-setup`** *(implemented)* — `src/ui/ExperimentControls.tsx`. Mass, applied force, and
  initial velocity are range inputs with paired `<output>` readouts; observation window is a number
  input. Help text states the relationship and the sign convention. Bounds are the declared contract
  bounds, and the engine clamps rather than trusting the caller.

### 6.3 Laboratory track, cart, and force presentation

- **`lab-scene`** *(implemented)* — `src/renderer/labScene.ts`, `src/renderer/labGeometry.ts`. Track
  bed with a metre tick every whole metre; cart body with two wheels; force arrow with an arrowhead;
  a `+x` axis marker; a playback rail; a monospace status line. Geometry is a pure function of the
  view model with no frame-time input.

### 6.4 Run, pause, reset, step, replay

- **`run`** *(implemented)* — the playback clock selects which already-computed recorded sample is
  drawn. It cannot change a sample, a measurement, or a result.
- **`pause`** *(implemented)* — toggles Pause/Resume. Paused part-way is distinguished from settled by
  the scene's own **status words**, not by colour.
- **`reset`** *(implemented)* — non-punitive and must never rewrite recorded history. **Design
  requirement:** a confirmation whenever recorded trials exist, because a reset that silently
  discards evidence is a data-loss defect, not a convenience.
- **`step`** *(implemented)* — moves the presentation clock to the next or previous **recorded**
  sample instant. Required **even when reduced motion is off**, because it is what keeps the window
  readable.
- **`replay`** *(implemented)* — re-presents a recorded trial. It must **not** re-run the domain, must
  not create a new trial record, and must not alter any measured value. Deterministic replay that
  re-executes from provenance is a separate ML-04 facility and a different feature.

### 6.5 Measurement instruments and force vectors

- **`instruments`** *(implemented)* — `src/ui/InstrumentPanel.tsx`, `src/viewmodel/instruments.ts`.
  Position, velocity, acceleration, net force, and elapsed time as a description list, plus the
  derived ML-04 measurements. Every reading carries `value`, `displayValue`, `text`, `unit`, and
  `origin`. Configured values are marked `configured` and measured values `measured`, so a learner
  can tell **what they set** from **what happened** — the distinction a controlled investigation
  turns on.
- **`force-vector`** *(implemented)* — arrow length is a base plus a fixed pixel count per newton,
  capped at the largest force the frozen range allows. Direction is stated in words beside it.

**A balanced net force draws no arrow at all** — `fromX` and `toX` are `null`, not zero-length. A
zero-length arrow would read as "no data" rather than "a real measured zero". The balanced label
states the number as well as the reading: `balanced (0.0 N)`. The number is the evidence; "balanced"
is the interpretation of it.

### 6.6 Trial record and evidence notebook

- **`trial-record`** *(partial)* — `src/ui/TrialTable.tsx`. A real table with caption, column headers,
  and row headers, showing configuration and final values. It does **not** yet show provenance,
  measurements, the integrity digest, or the changed-versus-controlled analysis. Owner: GAME-392.
- **`evidence-notebook`** *(specified)* — the ordered, append-only trial list with each trial's role,
  configuration, measurements, and admissibility. **Design requirement:** a learner must be able to
  see at a glance which variable changed between two entries and which were held fixed.

### 6.7 Trial comparison

- **`trial-comparison`** *(specified)* — a real comparison table: each column a trial, each row a
  variable, the independent variable's cells marked as the changed one. Invalid comparisons are
  labelled **in words**, naming the count of changed variables or the controlled variable that moved,
  and never by colour alone. Owner: GAME-392.

### 6.8 Position-time and velocity-time graphs

- **`graph-position-time`** *(specified)* — curvature indicates greater acceleration. Optional for
  cargo-load-test, never the only route to the data. Owner: GAME-393.
- **`graph-velocity-time`** *(specified)* — **slope is the acceleration**. Required by
  thruster-test and mystery-cart, which is what discharges the Epic's graph-interpretation
  requirement. Mystery Cart needs a two-trace overlay to compare slopes.

Full graph contract in §7.

### 6.9 Claim, evidence, and debrief

- **`claim`** *(specified)* — the learner states a claim about a **named measurement**, the
  **direction** of the relationship, and the **variable that explains it**. The design requires all
  three parts rather than accepting free text alone: a claim naming no variable cannot be wrong in a
  way the debrief can correct.
- **`evidence-citation`** *(specified)* — trials cited by checkbox over the notebook. Only replayable
  evidence is admissible; inadmissible citations are refused with a **stated reason** rather than
  silently dropped. Owner: GAME-392.
- **`debrief`** *(specified)* — authored explanation, misconception feedback that points at the
  learner's **own recorded numbers**, and a non-punitive revision path. **Never a score, a timer, or
  an answer key.**

### 6.10 Hints, recovery, and errors

- **`hint`** *(specified)* — nudges toward the method, **never names the answer**. Retry is unlimited
  or clearly bounded and non-punitive, and allocates a new trial ordinal rather than overwriting one.
- **`recovery`** *(implemented)* — `src/host/recovery.ts`. Recovery is per failure stage. A
  `chunk-load` failure offers a **page reload**, because the browser remembers a failed dynamic
  import for the life of the page — this was measured, not assumed, and the qualification lane proved
  a cache-busted URL resolves while the same URL rejects again with no second request. Every other
  stage retries in place. The reload warns **first** that trial records are not stored, so the
  session starts fresh.
- **`error`** *(partial)* — `src/app/ErrorBoundary.tsx` renders `role="alert"`, and validation errors
  have typed codes with learner-facing explanations. Field-level invalid states, their text, and
  their announcement are specified here and **not yet built**.

### 6.11 Loading and renderer-failure fallback

- **`renderer-loading`** *(implemented)* — states that the animated view is starting **and** that every
  number below is available as text, so a slow renderer is never read as a broken page.
- **`renderer-fallback`** *(implemented)* — a dashed (not colour-only) panel naming the failure stage,
  giving the reason, stating that **nothing about the experiment changed**, and offering the correct
  recovery for that stage. The semantic instruments and trial table remain available throughout.

---

## 7. Graph contract (GAME-393 / ML-09)

Every graph obeys all seven principles:

1. authoritative samples only — a graph never interpolates between samples as though the
   intermediate instants were recorded;
2. deterministic domain and scale selection, so the same evidence always draws the same graph;
3. labelled axes carrying SI units, with the unit **in the axis title**;
4. an explicit origin, and never a truncated axis where truncation would change the interpretation;
5. a real table equivalent exposing the same series and the same values;
6. a textual summary;
7. a keyboard-reachable **read-value-at-time** affordance.

| | Position-time | Velocity-time |
| --- | --- | --- |
| Vertical axis | position (m) | velocity (m/s) |
| Horizontal axis | elapsed time (s) | elapsed time (s) |
| Slope means | instantaneous velocity | **acceleration** |
| Curvature means | greater acceleration curves more steeply | not meaningful in v1, where acceleration is constant within a segment |
| Zero reference | the `x0 = 0` start gate | a horizontal trace at zero velocity |
| Required by | — | thruster-test, mystery-cart |

Required states: `empty` (states no trial exists rather than drawing an axis that reads like a zero
measurement), `single-series`, `multi-series-overlay`, `read-value-at-time`, `table-equivalent`,
`textual-summary`, and `insufficient-evidence` (names which trial is missing).

Series encoding: each trial is a series, distinguished by **line style plus a direct label on the
trace plus a row in the table** — never colour alone. The Mystery Cart overlay must name both trials
and **state which slope is larger in words**.

Prohibited: a graph drawn from pixel or sprite positions; smoothed, splined, or fitted data
presented as recorded; an axis without a unit; a truncated axis without an explicit break marker; a
graph as the only route to a value required for a claim.

---

## 8. Control states

Every state GAME-387 names is explicit rather than left to implementation guesswork. The honest
"implemented" column is part of the contract.

| State | Specification | Implemented |
| --- | --- | --- |
| **default** | raised panels on surface, 1px border, 10px radius; primary actions an accent fill with accent-ink text at 8px; secondary transparent with a border; inputs a sunken well at 6px | yes |
| **hover** | visible fill or border change. **Never the only affordance** — hover must not be what makes a control discoverable | no |
| **focus-visible** | 3px solid `--focus` outline, 2px offset, 4px radius, never suppressed | yes |
| **selected** | encoded by at least two of accent fill, weight increase, explicit textual marker, shape change. Trial and evidence selection must **additionally** carry a visible textual marker, because a control relying on fill alone is a colour-only distinction | partially — the current mission step only |
| **disabled** | `opacity: 0.55`, `cursor: not-allowed`. A disabled control is also **non-focusable**, so every one must be paired with visible help text explaining what will enable it | **yes** — styling, and the reason now ships as static text in `src/ui/InstrumentPanel.tsx` (**OF-04**) |
| **error** | stated in words, adjacent to the control, associated by `aria-describedby`, announced through a live region. Colour is a redundant third channel only. The fallback also uses a **dashed** border as well as `--warn` | copy yes, field-level presentation no |
| **non-color** | direction uses arrowhead + words + sign; the ruler uses labelled ticks; the current step uses weight + fill + `aria-current`; validity uses wording; series use line style + label + table row | largely yes |
| **reduced-motion** | playback does not animate and resolves to the end of the window in one step; the panel says reduced motion is on and names Step forward / Step back / Jump to end; CSS animation and transition durations collapse to 0.001ms at one iteration; smooth scrolling disabled. **Every value reachable by watching is reachable by stepping** | yes |
| **forced-colors** | nothing may rely on a background image or a subtle border to convey state | CSS **yes** (**OF-06**) — not yet observed in a real forced-colors browser |
| **zoom-200** | reflow with no loss of function and no two-dimensional scrolling for text | not manually qualified |

### Focus order

DOM order is reading order. Focus is never trapped except in a deliberate modal, which returns focus
on close. The specified order is: mission header → foundation notice → prediction → experiment setup →
lab view region → playback controls → trial table → mission step list → advance step.

### Announcements

The canvas is `role="img"` with an `aria-label` built from **the same instrument readings the visible
readouts use**, so a screen-reader user and a sighted user can never be told different values and a
unit can never be spelled two ways. Live regions: the renderer status line (polite), the prediction
saved confirmation (status), the renderer fallback (status), and the error boundary (alert). No live
region may report a state that differs only in wording from a visual state, and none may update more
than once per recorded sample.

---

## 9. Motion: instructional versus decorative (AC4)

Three categories with different rules. ML-12 polish can never quietly become load-bearing.

### 9.1 Instructional visualization

Motion carrying scientific or procedural meaning. Rules: a **non-motion equivalent must exist and be
keyboard-reachable**; it may not be the only route to any value, relationship, or state change; it
must be removable under reduced motion with meaning preserved; it must be driven by **recorded sample
instants, never frame time**; and it must not pace the investigation — **no next step is gated on an
animation finishing**.

| Motion | Meaning | Non-motion equivalent | Current |
| --- | --- | --- | --- |
| cart travel | position changes with time under the authoritative trace | Step forward / Step back through recorded samples; the trial table's final values | implemented as sample selection, not animation |
| force arrow appearance | net force direction and magnitude | the force label in words; the Net force readout | present or absent from the first frame; never animates |
| playback rail | how far through the recorded window the clock is | the elapsed-time reading, which is the recorded sample's own time | derived from the active index; cannot move a measurement |
| trial-record appearance | a trial became immutable evidence | the new table row and the status announcement | not built (GAME-392) |

### 9.2 Decorative polish

Motion adding nothing scientific. Rules: removable under reduced motion with **zero** meaning loss;
non-authoritative; deterministic where it can affect what is on screen; and it must not delay any
action or gate any next step. Currently: the CSS reduced-motion rule collapses transitions to
0.001ms, but no bespoke transitions are authored. Cart idle motion is **prohibited as specified**.
Success emphasis, if ever authored, may never read as a score or a reward.

### 9.3 Forbidden

Anything that would make the renderer an authority for a science value:

- a tween, easing curve, or interpolation positioning the cart between recorded samples as though the
  intermediate instants were recorded;
- a sprite position or collision outcome used as a measurement;
- a frame counter or elapsed frame time used to advance, ease, or drift the picture;
- any animation whose completion changes domain state.

**Enforced today:** `src/renderer/labScene.ts` reads no frame time, uses no tween, and computes all
geometry through `sceneGeometry`, a pure function of the view model.

### 9.4 Timing — proposed, not measured

State-change feedback visible within 100ms of a committed action; one recorded sample per playback
step with no transition between steps; 150ms panel transitions. These are **targets for ML-14 to
measure**, not measurements, and no gate is claimed. Any deliberate dwell blocking the next trial is
prohibited — scorecard row Q-10 forbids an animation dwell gating the next trial.

---

## 10. Asset and originality direction (AC5)

All Motion Lab art, iconography, typography choices, and audio are **original work**, derived from
this repository's own token set and from the physics the kernel computes. The IP boundary in
[`COMPARATORS.md`](COMPARATORS.md) is absolute: no comparator art, layout, name, copy, audio, or
scene composition may be reproduced.

**Palette lock.** The palette is fixed by §4. ML-12 may not introduce a new hue for a scientific
distinction; a new meaning requires a decision entry.

Direction:

1. **Laboratory instrumentation, not a cartoon world** — a readable apparatus, honest instrument faces,
   and a clear track, in the spirit of a real test bench.
2. **Physics-driven visuals only** — cart, arrow, ruler, and trace are generated from the frozen model,
   so art and science cannot drift apart.
3. **Instrument typography is monospace with tabular figures** wherever numbers change during playback.
4. **One idea per screen** — the learner always knows which single thing this panel is for.
5. **Restraint over spectacle** — ML-12 polish may not add a visual implying a science value the domain
   did not emit.

**Asset provenance.** Every nontrivial shipped asset records `assetId`, `path`, `kind`, `origin`,
`author` or `tool`, `license`, `sourceUrl`, `derivedFrom`, and `notes`, exactly as
[`PROVENANCE.md`](PROVENANCE.md) §2 specifies. An asset of unknown origin may not ship. Generated
assets record tool and parameters so they are reproducible.

**Status, plainly:** no production asset exists, the asset manifest is not authored, and no asset may
ship until it is. The originality and IP review is ML-16's gate and **has not occurred**.

---

## 11. ML-11 vertical-slice coverage (AC2)

GAME-395's slice: mission question → prediction → controlled setup → animated real Phaser run →
measurement → immutable trial record → second trial → graph → comparison → claim → evidence →
explanatory debrief.

| # | Step | States | Implemented | Owner |
| --- | --- | --- | --- | --- |
| 1 | mission question | `brief`, `question` | no | GAME-389 / 394 |
| 2 | prediction | `predict` | **yes** | GAME-394 |
| 3 | controlled setup | `variable-identification`, `experiment-setup` | partial | GAME-394 |
| 4 | animated real Phaser run | `lab-scene`, `run`, `force-vector` | **yes** | GAME-390 |
| 5 | measurement | `instruments` | **yes** | GAME-391 |
| 6 | immutable trial record | `trial-record` | partial | GAME-392 |
| 7 | second trial | `reset`, `experiment-setup` | **yes** | GAME-394 |
| 8 | graph | `graph-position-time`, `graph-velocity-time` | no | GAME-393 |
| 9 | comparison | `trial-comparison`, `evidence-notebook` | no | GAME-392 |
| 10 | claim | `claim` | no | GAME-394 |
| 11 | evidence | `evidence-citation` | no | GAME-392 |
| 12 | explanatory debrief | `debrief`, `hint`, `error`, `recovery` | partial | GAME-394 |

**Coverage is complete. Implementation is not.** Six of the twelve steps are unimplemented or partial,
and GAME-395 is blocked by GAME-394 in the Jira blocker chain regardless. **This design package does
not make ML-11 achievable**, and claiming otherwise would be the exact failure mode this repository
guards against everywhere else.

---

## 12. Acceptance criteria mapping

| AC | Criterion | Status | Honest qualifier |
| --- | --- | --- | --- |
| **1** | A real Figma file/handoff or equivalent production design authority is recorded | **satisfied by the equivalent branch** | No Figma file was produced and none is claimed. O-01 stays owner-gated: the owner must still provide or approve a real Figma file, or waive it in favour of this. |
| **2** | All ML-11 vertical-slice states are covered before ML-11 begins | **satisfied as specification** | Every state is specified. Specifying is not implementing; see §11. |
| **3** | Responsive and accessibility variants are explicit, not left to implementation guesswork | **satisfied** | Variants are explicit, including measured contrast and one declared divergence. Human review has not occurred. |
| **4** | Motion specs distinguish instructional visualization from decorative polish | **satisfied** | Three categories separated, with a non-motion equivalent named for every instructional motion. |
| **5** | Asset/originality direction is documented | **satisfied** | Direction and IP boundary documented. No asset exists; ML-16's review has not occurred. |

---

## 13. Open findings

Recorded as **open, never as passes**. These are not defects in this contract; they are work the
contract identified and assigned. **Both remaining ones cannot be discharged by an automated agent.**

| ID | Severity | Finding | Owner |
| --- | --- | --- | --- |
| OF-05 | medium | No visual design artifact exists — coverage is specified, not depicted, so composition, hierarchy, and aesthetic quality are unjudged | GAME-387 owner / GAME-400 |
| OF-07 | medium | No independent review of this package by a different model or a human. The package was merged to `main` at owner instruction, **which is not a review** | GAME-387 owner |

### Resolved

Closed by the GAME-387 remediation. Kept so the record shows what the defect actually was, rather
than leaving no trace of something that was once real. **A resolved finding is never evidence that
it never existed**, and none of these counts as a quality claim.

| ID | Was | Now | Closed by |
| --- | --- | --- | --- |
| OF-01 | `--border` on `--surface-raised` at 1.60:1, below the 3:1 non-text threshold | `#4772ad` at 3.17:1 | PR #11 |
| OF-02 | scene track edge at 2.21:1 | `0x45689f` at 3.19:1, tick raised to 4.25:1 to keep the ruler the brightest scale cue | PR #11 |
| OF-03 | shipped grid reached two columns at 688px, not the specified 1024px | explicit single-column base plus a 1024px min-width query, using `minmax(0, 1fr)` | PR #11 |
| OF-04 | disabled playback controls gave no reason | the panel states the reason in always-present text and names **Run preview** | PR #11 |
| OF-06 | forced-colors specified but unimplemented | a `forced-colors: active` block re-expresses every indicator as a system colour or border | PR #11 |

**OF-06 is implemented, not qualified.** No indicator has been observed in a real forced-colors
browser; that manual gate is ML-16's and has not happened.

---

## 14. Change control

This contract is frozen under [`DECISIONS.md`](DECISIONS.md) change control. A change requires a
recorded decision with a Jira reference.

- Changing the palette, the token set, a responsive breakpoint, a graph rule, or the
  instructional/decorative motion split is a **material design change** and requires a decision entry.
- Implementing a state this contract specifies is **not** a change to it; recording
  `implementationStatus` moving from `specified` to `implemented` is an update with a Jira reference.
- Recording a new open finding is always allowed and never requires a decision.

The verifier enforces that a required state cannot be dropped and that a divergence must be declared:

```bash
npm run contracts
```
