/**
 * Deterministic replay and evidence verification (GAME-388 / ML-04).
 *
 * Replay re-executes a trial from its provenance alone. It does not replay
 * stored numbers: it rebuilds the motion declaration, re-samples the kernel,
 * re-derives the measurements, and compares. A record that does not reproduce
 * is not evidence, and the domain refuses to score it.
 *
 * This is the mechanism behind acceptance criterion 3 ("it is impossible for
 * the presentation layer to forge a measurement accepted by scoring"). The
 * structural guarantee is that measurements are outputs (see
 * ./measurements.ts); this module is the independent check that a record still
 * agrees with the declaration it claims to have come from.
 */

import { sampleAtTimes, type MotionSample } from "../science/index.js";
import { deriveMeasurements } from "./measurements.js";
import { assertConfigurationWithinBounds } from "./variables.js";
import type {
  ControlledInvestigation,
  ReplayVerdict,
  TrialEvidence,
} from "./experiment-types.js";
import { digestOf } from "./seed.js";

/** The digest covers everything except the digest field itself. */
function evidenceBody(evidence: Omit<TrialEvidence, "integrityDigest">) {
  return {
    provenance: evidence.provenance,
    samples: evidence.samples,
    finalState: evidence.finalState,
    measurements: evidence.measurements,
    unreachedPositionTargetsMetres: evidence.unreachedPositionTargetsMetres,
  } as const;
}

export interface VerifyOptions {
  /**
   * The investigation the trial was run under. Re-running bounds validation
   * during replay is what catches a record whose configuration would not have
   * been accepted in the first place.
   */
  readonly investigation: ControlledInvestigation;
}

/**
 * Reconstruct a trial from provenance alone and report whether the stored
 * record still follows from it.
 */
export function replayTrialEvidence(
  evidence: TrialEvidence,
  options: VerifyOptions
): ReplayVerdict {
  const { provenance } = evidence;
  const trialId = provenance.trialId;

  // Re-check the recorded configuration against the investigation's declared
  // bounds. A record whose configuration would never have been accepted in the
  // first place must not survive replay just because its numbers are stable.
  try {
    assertConfigurationWithinBounds(
      options.investigation,
      provenance.configuration
    );
  } catch (error) {
    return {
      trialId,
      status: "trajectory-divergent",
      divergencePath: "provenance.configuration",
      detail:
        `The recorded configuration is not admissible under the investigation: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let replayedSamples: readonly MotionSample[];
  try {
    replayedSamples = sampleAtTimes(
      provenance.motionDeclaration,
      provenance.sampleTimesSeconds
    );
  } catch (error) {
    return {
      trialId,
      status: "trajectory-divergent",
      divergencePath: "provenance.motionDeclaration",
      detail:
        `Re-sampling the recorded declaration failed: ` +
        `${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const replayedDerived = deriveMeasurements(
    provenance.motionDeclaration,
    replayedSamples,
    provenance.positionTargetsMetres
  );

  if (replayedSamples.length !== evidence.samples.length) {
    return {
      trialId,
      status: "trajectory-divergent",
      divergencePath: "samples.length",
      detail: `Replayed ${replayedSamples.length} samples but the record stores ${evidence.samples.length}`,
    };
  }

  for (let index = 0; index < replayedSamples.length; index += 1) {
    const replayed = replayedSamples[index]!;
    const stored = evidence.samples[index]!;
    if (
      replayed.elapsedSeconds !== stored.elapsedSeconds ||
      replayed.state.positionMetres !== stored.state.positionMetres ||
      replayed.state.velocityMetresPerSecond !== stored.state.velocityMetresPerSecond ||
      replayed.state.accelerationMetresPerSecondSquared !==
        stored.state.accelerationMetresPerSecondSquared ||
      replayed.state.netForceNewtons !== stored.state.netForceNewtons
    ) {
      return {
        trialId,
        status: "trajectory-divergent",
        divergencePath: `samples[${index}]`,
        detail: `Sample ${index} does not follow from the recorded declaration`,
      };
    }
  }

  if (digestOf(evidenceBody(evidence)) !== evidence.integrityDigest) {
    return {
      trialId,
      status: "digest-mismatch",
      divergencePath: "integrityDigest",
      detail:
        "The stored contents do not match the digest recorded with the provenance; " +
        "the record was altered after it was produced",
    };
  }

  // The record reproduces against the kernel, and the digest binds it to the
  // provenance. A measurement that disagrees with the re-derived value is
  // therefore detectable even when the digest was recomputed by the forger.
  const expectedMeasurements = digestOf(replayedDerived.measurements);
  const storedMeasurements = digestOf(evidence.measurements);
  if (expectedMeasurements !== storedMeasurements) {
    return {
      trialId,
      status: "trajectory-divergent",
      divergencePath: "measurements",
      detail:
        "Stored measurements disagree with the measurements re-derived from the recorded declaration",
    };
  }

  return {
    trialId,
    status: "reproduced",
    divergencePath: null,
    detail:
      `Replayed ${replayedSamples.length} authoritative samples and ` +
      `${replayedDerived.measurements.length} derived measurements from provenance alone`,
  };
}

/** True when a record still follows from its own provenance. */
export function isReplayable(evidence: TrialEvidence, options: VerifyOptions): boolean {
  return replayTrialEvidence(evidence, options).status === "reproduced";
}

/**
 * Re-derive the evidence a record *should* contain, without mutating anything.
 *
 * Used by tests and by any caller that needs the authoritative values rather
 * than the stored ones.
 */
export function authoritativeRebuild(evidence: TrialEvidence): {
  readonly samples: readonly MotionSample[];
  readonly measurements: TrialEvidence["measurements"];
} {
  const samples = sampleAtTimes(
    evidence.provenance.motionDeclaration,
    evidence.provenance.sampleTimesSeconds
  );
  return {
    samples,
    measurements: deriveMeasurements(
      evidence.provenance.motionDeclaration,
      samples,
      evidence.provenance.positionTargetsMetres
    ).measurements,
  };
}
