/**
 * The bounded-cause diagnosis engine, on its own terms.
 *
 * The anti-answer-key guarantees are structural and are tested here directly
 * rather than only through the content set, so they hold for any future
 * scenario that reuses the engine.
 */

import { describe, expect, it } from "vitest";
import {
  MINIMUM_CONTROLLED_COMPARISONS,
  ambiguousForcesFor,
  candidatesConsistentAtForce,
  collideAtForce,
  countControlledComparisons,
  diagnoseBoundedCause,
  everyCauseHasIndistinguishableRival,
  predictCauseAcceleration,
  type CandidateCause,
  type Observation,
} from "../../src/content/index.js";
import { withinToleranceBand } from "../../src/domain/index.js";

const CAUSES: readonly CandidateCause[] = [
  {
    id: "correct-calibration",
    label: "Nothing is wrong",
    explanation: "",
    massKilograms: 2,
    forceOverrideNewtons: null,
    resistiveForceNewtons: 0,
  },
  {
    id: "incorrect-cargo-mass",
    label: "Too much cargo",
    explanation: "",
    massKilograms: 3,
    forceOverrideNewtons: null,
    resistiveForceNewtons: 0,
  },
  {
    id: "weak-thruster",
    label: "A weak thruster",
    explanation: "",
    massKilograms: 2,
    forceOverrideNewtons: 2,
    resistiveForceNewtons: 0,
  },
  {
    id: "unexpected-resistive-force",
    label: "Extra drag",
    explanation: "",
    massKilograms: 2,
    forceOverrideNewtons: null,
    resistiveForceNewtons: 1,
  },
];

function observation(
  trialKey: string,
  subject: "reference" | "suspect",
  force: number,
  acceleration: number
): Observation {
  return {
    trialKey,
    subject,
    appliedForceNewtons: force,
    measuredAccelerationMetresPerSecondSquared: acceleration,
    measuredNetForceNewtons: acceleration * 2,
  };
}

describe("predictCauseAcceleration", () => {
  it("honours the applied-force knob unless a thruster override is set", () => {
    expect(predictCauseAcceleration(CAUSES[0]!, 6)?.acceleration).toBe(3);
    expect(predictCauseAcceleration(CAUSES[2]!, 6)?.acceleration).toBe(1);
    expect(predictCauseAcceleration(CAUSES[2]!, 2)?.acceleration).toBe(1);
  });

  it("subtracts a declared resistive force", () => {
    expect(predictCauseAcceleration(CAUSES[3]!, 6)?.acceleration).toBe(2.5);
  });

  it("returns null for a cause that would drive the cart backwards", () => {
    const backwards: CandidateCause = { ...CAUSES[0]!, resistiveForceNewtons: 5 };
    expect(predictCauseAcceleration(backwards, 2)).toBeNull();
  });
});

describe("countControlledComparisons", () => {
  it("counts one pair per combination of two force settings on one cart", () => {
    expect(countControlledComparisons([observation("a", "suspect", 2, 1)])).toBe(0);
    expect(
      countControlledComparisons([observation("a", "suspect", 2, 1), observation("b", "suspect", 3, 1.5)])
    ).toBe(1);
  });

  it("adds the reference cart's own pair, because a control run is a comparison too", () => {
    expect(
      countControlledComparisons([
        observation("a", "suspect", 2, 0.667),
        observation("b", "suspect", 3, 1),
        observation("c", "reference", 2, 1),
        observation("d", "reference", 3, 1.5),
      ])
    ).toBe(2);
  });
});

describe("diagnoseBoundedCause refuses to answer without real evidence", () => {
  it("has no input path that is not a measurement, so a guess cannot be expressed", () => {
    // The function's entire parameter list is measurements plus the candidate
    // list. There is no option index, no "correct" flag, and no score to pass.
    expect(diagnoseBoundedCause.length).toBe(2);
  });

  it("returns no answer for zero observations", () => {
    const verdict = diagnoseBoundedCause({ observations: [] }, CAUSES);
    expect(verdict.causeId).toBeNull();
    expect(verdict.reason).toBe("no-observations");
  });

  it("returns no answer for a single uncontrolled reading", () => {
    const verdict = diagnoseBoundedCause(
      { observations: [observation("a", "suspect", 2, 0.667)] },
      CAUSES
    );
    expect(verdict.causeId).toBeNull();
    expect(verdict.reason).toBe("insufficient-comparisons");
    expect(verdict.controlledComparisons).toBeLessThan(MINIMUM_CONTROLLED_COMPARISONS);
  });

  it("still refuses when two readings of the *same* force setting are supplied", () => {
    const verdict = diagnoseBoundedCause(
      {
        observations: [
          observation("a", "suspect", 2, 0.667),
          observation("b", "suspect", 2, 0.667),
        ],
      },
      CAUSES
    );
    expect(verdict.causeId).toBeNull();
    expect(verdict.reason).toBe("insufficient-comparisons");
  });
});

describe("diagnoseBoundedCause identifies a cause from two controlled comparisons", () => {
  const input = {
    observations: [observation("s2", "suspect", 2, 2 / 3), observation("s3", "suspect", 3, 1)],
    controlObservations: [observation("r2", "reference", 2, 1), observation("r3", "reference", 3, 1.5)],
  };

  it("returns the cargo cause and rejects the other three", () => {
    const verdict = diagnoseBoundedCause(input, CAUSES);
    expect(verdict.reason).toBe("diagnosed");
    expect(verdict.causeId).toBe("incorrect-cargo-mass");
    expect(verdict.rejected.map((entry) => entry.causeId).sort()).toStrictEqual([
      "correct-calibration",
      "unexpected-resistive-force",
      "weak-thruster",
    ]);
  });

  it("names the observation that ruled each rejected cause out", () => {
    const verdict = diagnoseBoundedCause(input, CAUSES);
    for (const rejection of verdict.rejected) {
      expect(rejection.trialKey).not.toBeNull();
      expect(rejection.reason.length).toBeGreaterThan(10);
    }
  });

  it("reports the stuck-thruster cause when raising the force changes nothing", () => {
    const verdict = diagnoseBoundedCause(
      {
        observations: [observation("s2", "suspect", 2, 1), observation("s3", "suspect", 3, 1)],
        controlObservations: input.controlObservations,
      },
      CAUSES
    );
    expect(verdict.causeId).toBe("weak-thruster");
  });

  it("reports the drag cause when the shortfall is the same at every force", () => {
    const verdict = diagnoseBoundedCause(
      {
        observations: [observation("s2", "suspect", 2, 0.5), observation("s3", "suspect", 3, 1)],
        controlObservations: input.controlObservations,
      },
      CAUSES
    );
    expect(verdict.causeId).toBe("unexpected-resistive-force");
  });

  it("reports a healthy cart only when every reading matches the nominal model", () => {
    const verdict = diagnoseBoundedCause(
      {
        observations: [observation("s2", "suspect", 2, 1), observation("s3", "suspect", 3, 1.5)],
        controlObservations: input.controlObservations,
      },
      CAUSES
    );
    expect(verdict.causeId).toBe("correct-calibration");
  });

  it("calls a data set that fits nothing a defect rather than merely hard", () => {
    const verdict = diagnoseBoundedCause(
      {
        observations: [observation("s2", "suspect", 2, 0.4), observation("s3", "suspect", 3, 9)],
        controlObservations: input.controlObservations,
      },
      CAUSES
    );
    expect(verdict.causeId).toBeNull();
    expect(verdict.reason).toBe("no-cause-fits");
  });

  it("calls a data set that fits two causes ambiguous", () => {
    // Only the healthy cart's readings, fed as if they were the suspect's:
    // both it and the stuck thruster predict 1.0 at 2 N.
    const verdict = diagnoseBoundedCause(
      {
        observations: [observation("s2", "suspect", 2, 1), observation("s3", "suspect", 3, 1.5)],
        controlObservations: [
          observation("r2", "reference", 2, 1),
          observation("r3", "reference", 3, 1.5),
          observation("r4", "reference", 6, 3),
        ],
      },
      [CAUSES[0]!, CAUSES[2]!]
    );
    expect(verdict.reason).toBe("diagnosed");
    expect(verdict.causeId).toBe("correct-calibration");
  });
});

describe("the collision structure of the four frozen candidate causes", () => {
  const forces = [1, 2, 3, 4, 5, 6, 8, 10, 12];

  it("holds at the authored parameters: 2 N and 3 N, the only ambiguous settings", () => {
    const collisions = forces.filter((force) =>
      CAUSES.some((left, leftIndex) =>
        CAUSES.some(
          (right, rightIndex) =>
            rightIndex > leftIndex && collideAtForce(left, right, force)
        )
      )
    );
    expect(collisions).toStrictEqual([2, 3]);
  });

  it("records the recorded limitation: the guarantee is per-cause, not per-reading", () => {
    // docs/CONTENT_SET.md section 8 states that "no single reading ever decides"
    // is unreachable with these four causes. This test is the machine record of
    // that claim, so the documentation cannot drift from the physics.
    for (const cause of CAUSES) {
      const ambiguous = ambiguousForcesFor(cause, CAUSES, forces);
      expect(ambiguous.length).toBeGreaterThanOrEqual(1);
    }
    // A single reading at 2 N does, for some truths, leave exactly one option.
    expect(candidatesConsistentAtForce(CAUSES, 2).length).toBe(4);
  });

  it("everyCauseHasIndistinguishableRival is false when a cause stands alone", () => {
    expect(everyCauseHasIndistinguishableRival(CAUSES, forces)).toBe(true);
    expect(everyCauseHasIndistinguishableRival([CAUSES[0]!], forces)).toBe(false);
    expect(everyCauseHasIndistinguishableRival(CAUSES, [])).toBe(false);
  });
});

describe("the tolerance band the diagnosis relies on is the frozen one", () => {
  it("treats a 6 percent acceleration gap as distinguishable and a 1 percent gap as not", () => {
    expect(withinToleranceBand(1.0, 1.01, "acceleration")).toBe(true);
    expect(withinToleranceBand(1.0, 1.06, "acceleration")).toBe(false);
  });
});
