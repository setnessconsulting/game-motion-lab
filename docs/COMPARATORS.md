# Motion Lab — comparator registry

**Jira authority:** GAME-382 (Epic). **Frozen by:** GAME-383 (ML-01).
**Machine-readable form:** [`../contracts/comparators.v1.json`](../contracts/comparators.v1.json).
**Consumed by:** [`QUALITY_SCORECARD.md`](QUALITY_SCORECARD.md), ML-16 (human/comparator review).

Comparators are **external quality benchmarks**. They are used to keep Motion Lab honest about
scientific clarity, experimentation, feedback, and presentation. They are never a source of
content, and comparison is never a reason to copy anything.

## Scored comparators

Three comparators are **scored**. Each informs a specific set of scorecard dimensions; no comparator
is scored against Motion Lab globally.

### 1. PhET — Forces and Motion: Basics

*Registry id: `phet-forces-and-motion-basics`.*

- **What it is:** an interactive simulation sandbox for net force, motion, and friction.
- **Dimensions it informs:** scientific clarity; measurement clarity; visual force
  representation; inspectability of state; accessibility of the simulation surface.
- **Why it is the bar:** it makes force, net force, and motion legible and inspectable, with honest
  readouts. Motion Lab must preserve that **science transparency**.
- **Where Motion Lab must differ:** Motion Lab is *more game-like and more instructionally bounded*.
  PhET permits open multi-variable play; Motion Lab makes controlled investigation, evidence, and
  argument the assessed task. Matching PhET's openness would be a regression, not an improvement.
- **Do not borrow:** its layout, control arrangement, colour scheme, copy, or simulation framing.

### 2. Algodoo

*Registry id: `algodoo`.*

- **What it is:** a 2D physics sandbox with drawing tools, measurements, and graphs.
- **Dimensions it informs:** experimentation freedom; visual cause-and-effect; measurement; graphs;
  rapid trial iteration.
- **Why it is the bar:** cause and effect are visible, measurement is immediate, graphs are close to
  the experiment, and iterating is fast.
- **Where Motion Lab must differ:** Motion Lab stays **much more instructionally bounded**. Algodoo's
  strength is unconstrained exploration; Motion Lab's assessed task requires a *controlled*
  comparison, so unbounded freedom is out of scope.
- **Do not borrow:** its tools, UI, scene styling, or "sandbox first" structure.

### 3. Poly Bridge 3

*Registry id: `poly-bridge-3`.*

- **What it is:** a physics puzzle game with a build-test-revise loop.
- **Dimensions it informs:** game feel; immediate feedback; clarity of simulation outcome; rapid
  revision cycle; presentation quality.
- **Why it is the bar:** the loop is tight and satisfying, failure is informative, and revision is
  cheap. Motion Lab must feel rewarding to iterate in.
- **Where Motion Lab must differ:** Motion Lab's iteration is a **scientific** iteration — measuring,
  recording, and comparing — not a structural-engineering iteration. Motion Lab must not adopt a
  budget/economy or star-rating pressure model.
- **Do not borrow:** its visual identity, bridge/vehicle content, art, audio, or level design.

## Reference-only comparator (not globally scored)

### Kerbal Space Program

*Registry id: `kerbal-space-program` (reference-only).*

- **Use:** mission fantasy; scientific agency; the feeling that instruments exist for a purpose.
- **Not scored:** Motion Lab is **never** scored globally against KSP. It is used only to inform
  qualitative discussion of mission framing and instrument purpose during ML-16.
- **Do not borrow:** names, art, audio, story, characters, or any content.

## Scorecard dimension mapping

Each scorecard row in [`QUALITY_SCORECARD.md`](QUALITY_SCORECARD.md) names the comparator (or
`none`) that informs it. The mapping is frozen here:

| Scorecard dimension | Informed by |
| --- | --- |
| Scientific clarity | PhET |
| Measurement clarity / instrument readability | PhET, Algodoo |
| Visual force representation | PhET |
| Inspectability of authoritative state | PhET |
| Experimentation / trial design | Algodoo |
| Visual cause-and-effect | Algodoo |
| Graph usability and honesty | Algodoo |
| Rapid trial iteration | Algodoo, Poly Bridge 3 |
| Game feel / immediate feedback | Poly Bridge 3 |
| Clarity of simulation outcome | Poly Bridge 3 |
| Revision / recovery cycle | Poly Bridge 3 |
| Presentation quality | Poly Bridge 3 |
| Mission clarity (first use) | none (Motion Lab specific) |
| Evidence dependence (cannot win by clicking) | none (Motion Lab specific) |
| Deterministic authority separation | none (Motion Lab specific) |
| Accessibility / input parity | none (Motion Lab specific; higher bar than all comparators) |
| Performance / responsiveness | none (Motion Lab specific) |
| Originality / IP separation | none (Motion Lab specific) |

Motion Lab's accessibility bar is deliberately **higher than every comparator's**; comparator
scores never justify lowering it.

## Originality and IP boundary (binding)

Permitted: learning from a comparator's **mechanics and quality level** and describing the gap in
our own words.

Prohibited, absolutely, in any form:

- comparator **art, sprites, textures, models, or audio**;
- comparator **UI layouts, control placements, or iconography**;
- comparator **names, brands, logos, or trademarks** in the product or its assets;
- comparator **story, characters, mission text, or dialogue**;
- comparator **level designs, track shapes, or scene composition**;
- any **bundled, downloaded, or CDN-fetched** comparator asset.

Every nontrivial asset is recorded in the asset provenance manifest
([`../docs/PROVENANCE.md`](PROVENANCE.md)) with its origin and license, so the IP boundary is
auditable. ML-16 performs an explicit originality/IP review against this section, and an unresolved
originality finding is release-blocking.

## How a future comparison is run

1. Play each scored comparator and the Motion Lab candidate on the **same day**.
2. Score only the dimensions that comparator informs (per the mapping above), never a global score.
3. Record one line of concrete evidence per dimension, in Motion Lab's own words.
4. Note gaps as remediation items; do not import a comparator's solution wholesale.
5. Record observations with date, environment, and the exact candidate identity
   ([`RELEASE.md`](RELEASE.md)).
6. Keep the IP rule absolute.

Comparator availability can change (products have been retired before). If a comparator becomes
unavailable, the profile is retained as a historical benchmark with a note about its availability;
it is not deleted and its dimension mapping is not silently reassigned.
