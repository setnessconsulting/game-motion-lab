# Motion Lab — science model, units, and conventions

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).
**Machine-readable form:** [`../contracts/science-conventions.v1.json`](../contracts/science-conventions.v1.json).

This document is the binding science contract. It is implemented by ML-03 (physics kernel) and
relied on by ML-04, ML-07, ML-09, and ML-10. It must be changed only through
[`DECISIONS.md`](DECISIONS.md).

## 1. Scope of the model

The authoritative model is a **deterministic, analytical, one-dimensional point-mass model** in an
**inertial laboratory reference frame**. The subject is a cart on a straight, level,
one-dimensional track.

Frozen properties:

- Motion is one-dimensional. Every kinematic quantity is a signed scalar along the track axis.
- The frame is inertial. The track does not move; there is no accelerating or rotating frame.
- The moving subject is treated as a point mass for science purposes.
- Forces are collinear with the track axis.
- Where the net force is constant over an interval, motion is evaluated from the **closed-form
  analytic solution**, never from numerical integration, a fixed timestep, or a physics engine.
- Where a scenario needs more than one constant regime, the motion is composed of
  **piecewise-constant segments**, each evaluated analytically with continuous boundary conditions.

## 2. Quantities, units, and display precision

SI units are internally authoritative. Display units are the same SI units; there is no unit
conversion in v1.

| Quantity | Symbol | SI unit | Display unit | Display decimals | Tolerance floor |
| --- | --- | --- | --- | --- | --- |
| mass | `m` | kilogram (kg) | kg | 2 | 0.01 kg |
| force (applied / resistive) | `F` | newton (N) | N | 1 | 0.1 N |
| net force | `Fnet` | newton (N) | N | 1 | 0.1 N |
| position | `x` | metre (m) | m | 2 | 0.05 m |
| elapsed time | `t` | second (s) | s | 2 | 0.05 s |
| velocity | `v` | metre per second (m/s) | m/s | 2 | 0.05 m/s |
| acceleration | `a` | metre per second squared (m/s²) | m/s² | 2 | 0.05 m/s² |

Derived-unit identity: `1 N = 1 kg·m/s²`.

**Sign and direction convention (frozen).**

- `+x` is the direction of increasing track coordinate — visually, **to the right**. A right-arrow
  marker on the track is the labelled positive direction and is present whenever a direction is
  asserted.
- A positive force acts in `+x`; a negative force acts in `-x`.
- `v > 0` means the cart moves toward increasing `x`; `v < 0` means toward decreasing `x`.
- `a` has the same sign as `Fnet` because `a = Fnet / m` and `m > 0`.
- The default initial position is `x0 = 0 m` at the start gate; the default initial velocity is
  `v0 = 0 m/s` unless a scenario explicitly declares otherwise.

**Reference-frame contract (frozen).**

- Origin: the start gate, `x = 0`.
- Positive direction: rightward along the track.
- Units are those in the table above.
- The track is at rest in the lab frame for the whole experiment.
- No scenario in v1 may declare a moving or accelerating reference frame.

## 3. Governing relationships

For a segment over which the net force is constant:

```text
Fnet = ΣF                     (signed sum of the collinear forces)
a    = Fnet / m               (requires m > 0)
v(t) = v0 + a·t
x(t) = x0 + v0·t + ½·a·t²
```

Equivalently, and valid for a constant-acceleration segment:

```text
v(t)² = v0² + 2·a·(x(t) − x0)          (used only as an internal consistency check)
x(t) = x0 + ½·(v0 + v(t))·t            (used only as an internal consistency check)
```

**Balanced forces.** If `Fnet = 0` then `a = 0`, `v(t) = v0`, and `x(t) = x0 + v0·t`. A cart at
rest with balanced forces remains at rest. A cart moving with balanced forces continues at
constant velocity. Balanced forces are **not** synonymous with "not moving".

**Force and mass scaling (the two assessed relationships).**

- At fixed mass, doubling `|Fnet|` doubles `|a|` without changing its sign.
- At fixed net force, doubling `m` halves `|a|`.

Learner-facing copy must describe the first as **directly proportional** and the second as
**inversely proportional**, always within the scenario's stated controlled conditions.

**Composition of multiple forces.** Forces are combined by the signed sum along the track axis. In
a canonical scenario where no resistive force is modeled, the applied force is the net force. When
two applied forces oppose, the net force is the signed difference and its sign determines the
direction of acceleration.

## 4. Resistive-force policy (bounded)

A resistive force may exist only when a canonical scenario **explicitly models and declares** it.
It is never implicit and never a silent default.

Frozen v1 resistive model:

- The declared resistive force has a **constant magnitude** opposing the declared direction of
  motion for that segment. The declared direction is part of the scenario declaration; the model
  is undefined for motion in the opposite direction, and a segment whose velocity changes sign is
  rejected (see below).
- Within a segment, `Fnet = F_applied − F_resistive` (with `F_resistive ≥ 0` opposing the
  segment's motion direction), so `Fnet` is constant and the analytic equations in §3 apply
  unchanged.
- The resistive force produces no motion on its own.
- **No reversal inside a segment.** Because `Fnet` is constant within a segment, the velocity can
  only change sign inside a segment when the declared `v0` opposes the net force. The kernel
  exposes the analytic reversal time (`t_reverse = −v0 / a` for `a ≠ 0`), and a scenario whose
  observation window extends past `t_reverse` must split the motion into separate segments at that
  time. A scenario that declares a reversal-crossing window without splitting is a validation
  error, not a silently extrapolated result.

**Explicitly out of scope for v1** (a change requires an owner decision and a `DECISIONS.md`
entry, because it changes the science kernel's solution class):

- velocity-proportional (linear or quadratic) drag, which requires exponential or algebraic
  closed forms rather than polynomial ones;
- static-to-kinetic friction transitions and the `v → 0` reversal discontinuity;
- rolling-resistance or normal-force coupling;
- any resistive force whose magnitude depends on the cart's position or time.

The `v1` kernel must fail closed (reject with a typed validation error) if a scenario asks for an
unsupported force model, rather than approximating it numerically.

## 5. Invalid states and validation

The kernel is a pure function of validated inputs. It must reject, with a typed error rather than a
clamped guess:

| Invalid input | Required behavior |
| --- | --- |
| `m ≤ 0` or non-finite mass | reject |
| non-finite force / position / time / velocity | reject |
| `t < 0` | reject |
| requested sample time beyond a declared trial window | reject (callers must sample inside the window) |
| unsupported force model | reject |
| non-finite or negative resistive magnitude | reject |
| unbalanced scenario declaring more than one independent variable in an assessed comparison | reject at the domain layer (ML-04), not silently |

Non-finite (`NaN`, `±Infinity`) values must never propagate into stored trial evidence.

## 6. Determinism

- The kernel is a pure deterministic function: the same validated inputs always produce
  bit-identical authoritative outputs.
- Motion contains **no randomness**. Any content variation is a content-authoring choice via an
  explicit seeded pseudo-random generator at the content layer
  (`mulberry32`-family), and the seed is recorded in the scenario/trial provenance. Randomness
  never enters the authoritative motion computation.
- Renderer frame rate, `deltaTime`, animation completion callbacks, and pixel positions are
  **inputs to nothing** in the kernel, and there is no API by which they could become one.
- `stateAt(t)` evaluates the exact analytic state at an arbitrary requested time. Sampling is
  performed at requested timestamps; there is no fixed simulation tick.

## 7. Display rounding and answer tolerance (frozen, no hidden rule)

The Epic requires that no hidden tolerance or rounding rule can change correctness. This section is
the entire rule; nothing may be added at the UI layer.

### 7.1 Authoritative values are never rounded

Stored and compared authoritative values are full-precision IEEE-754 doubles. Rounding is applied
only when producing a **string for display**, at the boundary of the presentation layer. A rounded
display value is never written back into domain state, never used for scoring, and never used in a
scientific comparison.

### 7.2 Canonical display-rounding algorithm

Display rounding uses **round-half-away-from-zero** at the frozen decimal count from §2, computed
by exactly:

```text
round(value, dp) = sign(value) * floor(|value| * 10^dp + 0.5) / 10^dp
```

This is the single rounding rule for every displayed quantity. It is not locale-dependent and does
not use `Number.prototype.toLocaleString` for scientific values.

### 7.3 Display round-trip safety (invariant)

For every canonical scenario, every displayed scientific value must satisfy

```text
|round(value, dp) − value| <= tolerance_floor(quantity)
```

Because `tolerance_floor` is at least **2× the half-increment** of the display increment for every
quantity in §2 (see the table in §7.4), a learner who reads a displayed value and enters it
verbatim is always within tolerance, including at an exact rounding half-boundary.

Content authoring must additionally avoid placing an authoritative value within `1e-9` of a display
rounding boundary; the content validator reports any such value as a content defect, because such a
value is the one place where a display string could be read two ways.

### 7.4 Answer comparison

Numeric learner answers are compared against the authoritative value with an authored tolerance:

```text
pass  <=>  |answer − truth| <= max( answerTolerance.relative * |truth|, answerTolerance.absolute[quantity] )
```

Frozen defaults, overridable only downward-to-stricter or upward-to-looser **within a declared
band** and always recorded in the scenario provenance manifest:

| Parameter | Frozen default | Allowed authored band |
| --- | --- | --- |
| `relative` | 0.02 (2%) | 0.01 – 0.05 |
| `absolute[quantity]` | tolerance floor from §2 | fixed (not authorable) |

| Quantity | Tolerance floor | Display increment | Half-increment | Floor ÷ half-increment |
| --- | --- | --- | --- | --- |
| mass | 0.01 kg | 0.01 kg | 0.005 kg | 2 |
| force / net force | 0.1 N | 0.1 N | 0.05 N | 2 |
| position | 0.05 m | 0.01 m | 0.005 m | 10 |
| time | 0.05 s | 0.01 s | 0.005 s | 10 |
| velocity | 0.05 m/s | 0.01 m/s | 0.005 m/s | 10 |
| acceleration | 0.05 m/s² | 0.01 m/s² | 0.005 m/s² | 10 |

For non-numeric answers (multiple choice, claim selection, evidence selection, variable
selection), comparison is **exact** on the authored identifier. There is no fuzzy matching and no
tolerance for categorical answers.

A tolerance is never applied to mask a wrong sign: a sign error fails regardless of magnitude.

## 8. Value ranges

Numeric bands are frozen so the reasoning, not arithmetic, carries the difficulty. Content may
choose values within these bands; values outside a band require a `DECISIONS.md` entry.

| Quantity | Canonical band | Notes |
| --- | --- | --- |
| mass | 1.0 kg – 4.0 kg | one decimal place on authored values (e.g. 1.5 kg) |
| applied force | 1 N – 12 N | whole newtons on authored values |
| resistive force | 0 N – 3 N | whole newtons |
| observed time window | 0 s – 6 s | authored per scenario |
| position along track | −2 m – 12 m | track length is a presentation parameter, not a science limit |
| resulting acceleration | 0.25 m/s² – 12 m/s² | emergent, never authored directly: the closed interval is exactly `[Fnet_min/m_max, Fnet_max/m_min] = [1 N / 4.0 kg, 12 N / 1.0 kg]` |
| initial velocity (where allowed) | −2 m/s – 2 m/s | only where a scenario explicitly declares it |

The bands are mutually consistent by construction: with `m ∈ [1.0, 4.0] kg` and `Fnet` bounded by
the applied and resistive bands, `|a| = |Fnet|/m` stays inside `[0.25, 12] m/s²`.

Track length is presentation, not science: a scenario authors its observation window so that the
authoritative trace stays visually on the modeled track, and the domain reports a track overrun as
a content defect rather than clipping the science.

Authored numbers are chosen so derived values land on clean, checkable magnitudes; authoring must
never require a learner to perform long division or multi-digit multiplication to answer.

## 9. What the renderer may and may not ask

The renderer's only scientific interface is a query on the authoritative model:

- **Allowed:** "give me the authoritative cart state (position, velocity, acceleration, net force)
  at time `t`"; "give me the sample set for this trial"; "give me the trial's final measured
  values".
- **Forbidden:** deriving a measurement from a sprite's on-screen position, a tween's progress, a
  physics-engine body, a collision callback, a camera transform, or a frame counter; writing any
  value back into authoritative state.

There is no API surface by which pixel geometry can produce or modify a scientific value. ML-02
adds an automated import/lint boundary check so this is enforced rather than merely documented.
