/**
 * The four canonical v1 mission families (GAME-383 / ML-01, frozen).
 *
 * `contracts/mission-families.v1.json` is the authority. This module is a
 * typed mirror of it so the content layer can reason about families without
 * reading a file at runtime, and a contract check
 * (scripts/verify-contracts.mjs, "canonical content set" group) asserts the
 * mirror and the contract agree field for field. The mirror is therefore a
 * cross-reference, not a second source of truth: if either side moves, the
 * check fails rather than silently drifting.
 */

import type { FamilyDefinition, FamilyId } from "./content-types.js";

export const CONTENT_CONTRACT_VERSION = "motion-lab.content-model/1.0.0";

export const FAMILY_IDS: readonly FamilyId[] = [
  "calibration-run",
  "thruster-test",
  "cargo-load-test",
  "mystery-cart",
];

export const FAMILY_DEFINITIONS: readonly FamilyDefinition[] = [
  {
    id: "calibration-run",
    name: "Calibration Run",
    primaryConcept: "balanced versus unbalanced force and net-force reasoning",
    scienceQuestion: "What is the net force on the cart, and how does the cart's motion reflect it?",
    independentVariable: "two collinear applied forces (or one force versus none)",
    dependentVariable: "resulting motion: rest, constant velocity, or accelerated motion",
    controlledVariables: ["mass", "initialVelocity", "resistiveForce", "observationWindow"],
    expectedRelationship:
      "equal-and-opposite forces give Fnet = 0 and no change in motion; unequal opposing " +
      "forces give a signed nonzero Fnet and a = Fnet/m directed toward the larger force",
    requiredEvidence:
      "at least one balanced trial and one unbalanced trial compared on net force, " +
      "acceleration, and resulting motion",
    misconceptions: [
      "balanced-forces-imply-stopped",
      "constant-push-means-constant-speed",
      "object-stores-force",
    ],
    difficultyLevels: ["guided", "supported", "independent"],
    graphRequirement: {
      level: "none",
      graphs: [],
      note: "numeric instruments suffice",
    },
    answerKeyBounded: true,
  },
  {
    id: "thruster-test",
    name: "Thruster Test",
    primaryConcept: "greater applied force produces greater acceleration at constant mass",
    scienceQuestion:
      "How does the change in the cart's motion depend on the applied force when mass is controlled?",
    independentVariable: "applied force",
    dependentVariable: "acceleration and change in velocity",
    controlledVariables: ["mass", "initialVelocity", "resistiveForce", "observationWindow"],
    expectedRelationship:
      "at constant mass a = Fnet/m, so acceleration is proportional to force; doubling " +
      "force doubles acceleration",
    requiredEvidence:
      "two trials differing only in force with acceleration and/or the velocity-time slope " +
      "compared, naming mass as the controlled variable",
    misconceptions: [
      "more-force-means-bigger-speed",
      "longer-run-means-more-force",
      "force-and-acceleration-unrelated",
    ],
    difficultyLevels: ["guided", "supported", "independent", "evidence-challenge"],
    graphRequirement: {
      level: "required",
      graphs: ["velocity-time"],
      note: "the mandated graph-interpretation requirement: the slope of the velocity-time graph is the acceleration",
    },
    answerKeyBounded: true,
  },
  {
    id: "cargo-load-test",
    name: "Cargo Load Test",
    primaryConcept: "greater mass produces less acceleration at constant applied force",
    scienceQuestion:
      "How does the change in motion depend on the cart's mass when the applied force is controlled?",
    independentVariable: "cart mass",
    dependentVariable: "acceleration and change in velocity",
    controlledVariables: ["appliedForce", "initialVelocity", "resistiveForce", "observationWindow"],
    expectedRelationship:
      "at constant net force a = Fnet/m, so acceleration is inversely proportional to mass; " +
      "doubling mass halves acceleration",
    requiredEvidence:
      "two trials differing only in mass with acceleration compared and the applied force " +
      "explicitly identified as controlled",
    misconceptions: [
      "heavier-cart-accelerates-faster",
      "mass-and-force-changed-together",
    ],
    difficultyLevels: ["guided", "supported", "independent", "evidence-challenge"],
    graphRequirement: {
      level: "optional",
      graphs: ["position-time"],
      note: "a more curved position-time trace indicates greater acceleration; never the only path to the data",
    },
    answerKeyBounded: true,
  },
  {
    id: "mystery-cart",
    name: "Mystery Cart Investigation",
    primaryConcept: "diagnose one bounded hidden cause from controlled experimental evidence",
    scienceQuestion: "Which of the bounded explanations is consistent with the experimental evidence?",
    independentVariable: "learner-chosen comparison variable",
    dependentVariable: "which bounded explanation the evidence supports",
    controlledVariables: ["declared per variant"],
    expectedRelationship:
      "exactly one declared candidate cause is consistent with the controlled comparisons; " +
      "each competing explanation predicts a distinguishable deficit pattern",
    requiredEvidence:
      "at least two controlled comparisons that distinguish the candidate explanations; a " +
      "single uncontrolled observation does not count",
    misconceptions: [
      "one-anomaly-is-enough",
      "unfair-comparison-isolates-a-cause",
      "sibling-compared-under-different-conditions",
    ],
    difficultyLevels: ["independent", "diagnosis", "evidence-challenge"],
    graphRequirement: {
      level: "required",
      graphs: ["velocity-time"],
      note: "at least one variant requires overlaying two velocity-time traces to compare slopes; the semantic table exposes the same data",
    },
    answerKeyBounded: true,
  },
];

/** Look a family up by id, or null when the id is outside the v1 contract. */
export function findFamily(familyId: string): FamilyDefinition | null {
  return FAMILY_DEFINITIONS.find((family) => family.id === familyId) ?? null;
}

/** True when a family offers the given difficulty level. */
export function familyOffersDifficulty(
  family: FamilyDefinition,
  level: string
): boolean {
  return family.difficultyLevels.includes(level as FamilyDefinition["difficultyLevels"][number]);
}

/** The severity ordering used for graph requirements: none < optional < required. */
const GRAPH_SEVERITY: Readonly<Record<FamilyDefinition["graphRequirement"]["level"], number>> = {
  none: 0,
  optional: 1,
  required: 2,
};

export function graphSeverity(level: FamilyDefinition["graphRequirement"]["level"]): number {
  return GRAPH_SEVERITY[level];
}
