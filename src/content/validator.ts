/**
 * The content validator (GAME-389 / ML-05).
 *
 * `docs/PROVENANCE.md` section 1 requires the content validator to fail
 * closed on an incomplete or inconsistent scenario, and
 * `docs/SCIENCE_MODEL.md` section 7.3 names two jobs specifically: reporting
 * an authoritative value that sits on a display rounding boundary, and
 * checking the display round-trip invariant. This module is those rules, plus
 * the content-authoring rules in `docs/MISSIONS.md` and the coverage rules in
 * `contracts/mission-families.v1.json`.
 *
 * Everything it checks is a *machine* claim. It can prove that a declared
 * force list adds up, that a comparison changed one variable, that a value is
 * inside the frozen band, that a diagnosis is not ambiguous, and that the
 * referenced traces resolve. It cannot prove that the science is *good* or
 * that the prose is *teachable*. Those remain the human gates of GAME-389
 * AC3 and AC4, and nothing in this file should be read as satisfying them.
 *
 * Pure: it reads no file, runs no kernel, and touches no browser global. Its
 * inputs arrive through ./validation-input.ts, which is what lets the same
 * rules run inside a unit test, a content pipeline, or a future build step.
 */

import {
  assessTrialChange,
  assertValidInvestigation,
  type ControlledInvestigation,
} from "../domain/index.js";
import type { QuantityId } from "../science/index.js";
import {
  AUTHORED_BANDS,
  hasAtMostDecimals,
  isDisplayRoundTripSafe,
  isOnDisplayRoundingBoundary,
  isWholeNumber,
} from "./bands.js";
import { findFamily, graphSeverity } from "./families.js";
import {
  diagnoseBoundedCause,
  ambiguousForcesFor,
  everyCauseHasIndistinguishableRival,
  countControlledComparisons,
  predictCauseAcceleration,
  type Observation,
} from "./diagnosis.js";
import { findReadabilityBreaches, measureReadability } from "./readability.js";
import { validateAgainstSchema } from "./schema-validator.js";
import type { ContentValidationInput, TrialEvidenceSummary } from "./validation-input.js";
import type {
  ContentDefect,
  ContentDefectCode,
  FamilyDefinition,
  ScenarioFile,
  ScenarioManifest,
  ScenarioTrial,
} from "./content-types.js";

class DefectSink {
  readonly defects: ContentDefect[] = [];

  add(
    code: ContentDefectCode,
    scenarioId: string,
    path: string,
    message: string
  ): void {
    this.defects.push({ code, scenarioId, path, message });
  }
}

const QUANTITY_IDS: ReadonlySet<string> = new Set<QuantityId>([
  "mass",
  "force",
  "netForce",
  "position",
  "time",
  "velocity",
  "acceleration",
]);

function asQuantity(quantity: string): QuantityId | null {
  return QUANTITY_IDS.has(quantity) ? (quantity as QuantityId) : null;
}

// ---------------------------------------------------------------------------
// Per-scenario rules
// ---------------------------------------------------------------------------

function checkManifestShape(
  sink: DefectSink,
  scenario: ScenarioFile,
  family: FamilyDefinition | null
): void {
  const manifest: ScenarioManifest = scenario.manifest;
  const id = manifest.scenarioId ?? "<unknown>";

  if (family === null) {
    sink.add(
      "unknown-family-id",
      id,
      "manifest.familyId",
      `Family ${String(manifest.familyId)} is not one of the four frozen v1 families`
    );
    return;
  }

  if (!family.difficultyLevels.includes(manifest.difficultyLevel)) {
    sink.add(
      "difficulty-not-offered-by-family",
      id,
      "manifest.difficultyLevel",
      `Family ${family.id} offers ${family.difficultyLevels.join(", ")} but the scenario declares ` +
        `${manifest.difficultyLevel}`
    );
  }

  const familySeverity = graphSeverity(family.graphRequirement.level);
  const scenarioSeverity = graphSeverity(manifest.graphRequirement.level);
  if (scenarioSeverity > familySeverity) {
    sink.add(
      "graph-requirement-exceeds-family",
      id,
      "manifest.graphRequirement.level",
      `Family ${family.id} caps scenarios at ${family.graphRequirement.level} but the scenario ` +
        `declares ${manifest.graphRequirement.level}`
    );
  }
  for (const graph of manifest.graphRequirement.graphs) {
    if (manifest.graphRequirement.level === "none") {
      sink.add(
        "graph-requirement-exceeds-family",
        id,
        "manifest.graphRequirement.graphs",
        `A scenario with level "none" may not list the ${graph} graph`
      );
      continue;
    }
    if (!family.graphRequirement.graphs.includes(graph)) {
      sink.add(
        "graph-requirement-exceeds-family",
        id,
        "manifest.graphRequirement.graphs",
        `Family ${family.id} does not use the ${graph} graph`
      );
    }
  }

  if (manifest.answerKeyBounded !== true) {
    sink.add(
      "guessable-answer-key",
      id,
      "manifest.answerKeyBounded",
      "Every v1 scenario must declare that its answer cannot be obtained without controlled evidence"
    );
  }

  if (manifest.targetStandard !== "NGSS MS-PS2-2") {
    sink.add(
      "schema-invalid",
      id,
      "manifest.targetStandard",
      `The frozen standard is NGSS MS-PS2-2; received ${String(manifest.targetStandard)}`
    );
  }

  const relative = manifest.answerTolerance.relative;
  if (!(relative >= 0.01 && relative <= 0.05)) {
    sink.add(
      "schema-invalid",
      id,
      "manifest.answerTolerance.relative",
      `The authored relative tolerance must sit inside the frozen band 0.01-0.05; received ${relative}`
    );
  }
  if (manifest.answerTolerance.absoluteSource !== "science-conventions.v1.json:quantity.toleranceFloor") {
    sink.add(
      "schema-invalid",
      id,
      "manifest.answerTolerance.absoluteSource",
      "The absolute tolerance must be sourced from the frozen tolerance floors, never authored locally"
    );
  }

  if (manifest.reviewStatus === "reviewed" && manifest.reviewer === null) {
    sink.add(
      "schema-invalid",
      id,
      "manifest.reviewer",
      "A scenario marked reviewed must name its reviewer"
    );
  }

  if (manifest.acceptedEvidence.length < 2) {
    sink.add(
      "evidence-coverage-too-thin",
      id,
      "manifest.acceptedEvidence",
      "A scenario must state at least two kinds of evidence that complete a claim"
    );
  }

  if (manifest.misconceptions.length === 0) {
    sink.add(
      "misconception-uncovered",
      id,
      "manifest.misconceptions",
      "Every scenario must map at least one misconception to authored remediation"
    );
  }
}

function checkAuthoredValues(
  sink: DefectSink,
  scenario: ScenarioFile,
  trial: ScenarioTrial,
  index: number
): void {
  const id = scenario.manifest.scenarioId;
  const base = `design.trials[${index}]`;
  const mass = trial.configuration.cartMassKilograms;
  const span = trial.configuration.observationWindowSeconds;
  const v0 = trial.configuration.initialVelocityMetresPerSecond;

  if (!Number.isFinite(mass) || !Number.isFinite(span) || !Number.isFinite(v0)) {
    sink.add(
      "non-finite-value",
      id,
      `${base}.configuration`,
      "A non-finite configuration value may never enter authored content"
    );
  }

  if (mass < AUTHORED_BANDS.cartMassKilograms.min || mass > AUTHORED_BANDS.cartMassKilograms.max) {
    sink.add(
      "value-outside-frozen-band",
      id,
      `${base}.configuration.cartMassKilograms`,
      `Cart mass ${mass} kg is outside the frozen band ` +
        `${AUTHORED_BANDS.cartMassKilograms.min}-${AUTHORED_BANDS.cartMassKilograms.max} kg`
    );
  }
  if (!hasAtMostDecimals(mass, AUTHORED_BANDS.cartMassKilograms.decimals)) {
    sink.add(
      "value-outside-frozen-band",
      id,
      `${base}.configuration.cartMassKilograms`,
      `Cart mass ${mass} kg carries more than the one authored decimal place`
    );
  }

  if (span <= AUTHORED_BANDS.observationSpanSeconds.min || span > AUTHORED_BANDS.observationSpanSeconds.max) {
    sink.add(
      "value-outside-frozen-band",
      id,
      `${base}.configuration.observationWindowSeconds`,
      `The observation span ${span} s is outside the frozen band ` +
        `0-${AUTHORED_BANDS.observationSpanSeconds.max} s`
    );
  }

  if (
    v0 < AUTHORED_BANDS.initialVelocityMetresPerSecond.min ||
    v0 > AUTHORED_BANDS.initialVelocityMetresPerSecond.max
  ) {
    sink.add(
      "value-outside-frozen-band",
      id,
      `${base}.configuration.initialVelocityMetresPerSecond`,
      `The initial speed ${v0} m/s is outside the frozen band ` +
        `${AUTHORED_BANDS.initialVelocityMetresPerSecond.min}-` +
        `${AUTHORED_BANDS.initialVelocityMetresPerSecond.max} m/s`
    );
  }

  if (trial.appliedForcesNewtons.length === 0) {
    sink.add(
      "value-outside-frozen-band",
      id,
      `${base}.appliedForcesNewtons`,
      "A scenario must declare at least one applied force"
    );
  }
  for (const [forceIndex, force] of trial.appliedForcesNewtons.entries()) {
    if (!isWholeNumber(force)) {
      sink.add(
        "value-not-a-whole-newton",
        id,
        `${base}.appliedForcesNewtons[${forceIndex}]`,
        `Authored applied forces are whole newtons; received ${force}`
      );
    }
    const magnitude = Math.abs(force);
    if (
      magnitude < AUTHORED_BANDS.appliedForceNewtons.minMagnitude ||
      magnitude > AUTHORED_BANDS.appliedForceNewtons.maxMagnitude
    ) {
      sink.add(
        "value-outside-frozen-band",
        id,
        `${base}.appliedForcesNewtons[${forceIndex}]`,
        `Applied force ${force} N is outside the frozen magnitude band ` +
          `${AUTHORED_BANDS.appliedForceNewtons.minMagnitude}-` +
          `${AUTHORED_BANDS.appliedForceNewtons.maxMagnitude} N`
      );
    }
  }

  const resistive = trial.resistiveForceNewtons;
  if (resistive !== null) {
    if (!isWholeNumber(resistive)) {
      sink.add(
        "value-not-a-whole-newton",
        id,
        `${base}.resistiveForceNewtons`,
        `Authored resistive forces are whole newtons; received ${resistive}`
      );
    }
    if (
      resistive < AUTHORED_BANDS.resistiveForceNewtons.min ||
      resistive > AUTHORED_BANDS.resistiveForceNewtons.max
    ) {
      sink.add(
        "value-outside-frozen-band",
        id,
        `${base}.resistiveForceNewtons`,
        `Resistive force ${resistive} N is outside the frozen band ` +
          `${AUTHORED_BANDS.resistiveForceNewtons.min}-${AUTHORED_BANDS.resistiveForceNewtons.max} N`
      );
    }
  }

  for (const [targetIndex, target] of trial.positionTargetsMetres.entries()) {
    if (
      target < AUTHORED_BANDS.positionMetres.min ||
      target > AUTHORED_BANDS.positionMetres.max
    ) {
      sink.add(
        "position-off-track",
        id,
        `${base}.positionTargetsMetres[${targetIndex}]`,
        `Position marker ${target} m is outside the modelled track band ` +
          `${AUTHORED_BANDS.positionMetres.min}-${AUTHORED_BANDS.positionMetres.max} m`
      );
    }
  }
}

function checkNetForceDeclaration(
  sink: DefectSink,
  scenario: ScenarioFile,
  trial: ScenarioTrial,
  index: number,
  summary: TrialEvidenceSummary | undefined,
  declaredMassKilograms: number,
  declaredResistiveForceNewtons: number
): void {
  const id = scenario.manifest.scenarioId;
  const base = `design.trials[${index}]`;
  const declaredNet = trial.appliedForcesNewtons.reduce((total, force) => total + force, 0);
  const declaredResistive = trial.resistiveForceNewtons ?? 0;
  const expectedNet = declaredNet - declaredResistive;

  if (trial.hiddenCause) {
    // A bounded cause is a *deficit* cause: the cart under-accelerates. It is
    // deliberately NOT required to reduce the net force, because the
    // incorrect-cargo-mass cause leaves the delivered force untouched and only
    // the mass is wrong. So the check is on acceleration, against the value the
    // learner would predict from the declared force and the *declared nominal*
    // mass and the *declared* resistance. The trial's own resistive field is
    // exactly the hidden thing under test, so it is not used here.
    if (summary === undefined || !(declaredMassKilograms > 0)) return;
    const learnerNet =
      trial.appliedForcesNewtons.reduce((total, force) => total + force, 0) -
      declaredResistiveForceNewtons;
    const declaredAcceleration = Math.abs(learnerNet) / declaredMassKilograms;
    const measuredAcceleration = Math.abs(summary.accelerationOfTrial);
    if (measuredAcceleration > declaredAcceleration + 1e-9) {
      sink.add(
        "net-force-declaration-mismatch",
        id,
        `${base}.hiddenCause`,
        `A bounded deficit cause must not accelerate the cart more than the declared ` +
          `${declaredAcceleration} m/s^2, but the trial measured ${measuredAcceleration} m/s^2`
      );
    }
    return;
  }

  if (summary === undefined) return;
  const measured = summary.netForceNewtonsOfTrial;
  if (Math.abs(measured - expectedNet) > 1e-9) {
    sink.add(
      "net-force-declaration-mismatch",
      id,
      `${base}.appliedForcesNewtons`,
      `The declared forces sum to ${expectedNet} N but the authoritative trial measured ` +
        `${measured} N; a scenario may not describe one net force and run another`
    );
  }
  if (expectedNet !== trial.configuration.appliedForceNewtons) {
    sink.add(
      "net-force-declaration-mismatch",
      id,
      `${base}.configuration.appliedForceNewtons`,
      `The declared forces sum to ${expectedNet} N but the trial configuration sets ` +
        `${trial.configuration.appliedForceNewtons} N`
    );
  }
}

function checkExecutedValues(
  sink: DefectSink,
  scenario: ScenarioFile,
  summary: TrialEvidenceSummary
): void {
  const id = scenario.manifest.scenarioId;
  const base = `evidence.${summary.trialKey}`;

  for (const [index, sample] of summary.samples.entries()) {
    const values: readonly (readonly [QuantityId, number])[] = [
      ["time", sample.elapsedSeconds],
      ["position", sample.positionMetres],
      ["velocity", sample.velocityMetresPerSecond],
      ["acceleration", sample.accelerationMetresPerSecondSquared],
      ["netForce", sample.netForceNewtons],
    ];
    for (const [quantity, value] of values) {
      if (!Number.isFinite(value)) {
        sink.add(
          "non-finite-value",
          id,
          `${base}.samples[${index}].${quantity}`,
          `Sample ${quantity} is not a finite number; non-finite values may never enter evidence`
        );
        continue;
      }
      if (isOnDisplayRoundingBoundary(value, quantity)) {
        sink.add(
          "value-on-display-rounding-boundary",
          id,
          `${base}.samples[${index}].${quantity}`,
          `${value} sits exactly on a display rounding boundary for ${quantity}, so a reader ` +
            `could round it two ways; move the authored value`
        );
      }
      if (!isDisplayRoundTripSafe(value, quantity)) {
        sink.add(
          "display-round-trip-unsafe",
          id,
          `${base}.samples[${index}].${quantity}`,
          `${value} is further from its display form than the ${quantity} tolerance floor allows`
        );
      }
    }

    if (
      sample.positionMetres < AUTHORED_BANDS.positionMetres.min ||
      sample.positionMetres > AUTHORED_BANDS.positionMetres.max
    ) {
      sink.add(
        "position-off-track",
        id,
        `${base}.samples[${index}].positionMetres`,
        `The authoritative trace leaves the modelled track band at ${sample.positionMetres} m`
      );
    }

    const magnitude = Math.abs(sample.accelerationMetresPerSecondSquared);
    const netForceIsZero = Math.abs(sample.netForceNewtons) < 1e-12;
    if (!netForceIsZero) {
      if (
        magnitude < AUTHORED_BANDS.accelerationMetresPerSecondSquared.minNonZero ||
        magnitude > AUTHORED_BANDS.accelerationMetresPerSecondSquared.max
      ) {
        sink.add(
          "value-outside-frozen-band",
          id,
          `${base}.samples[${index}].accelerationMetresPerSecondSquared`,
          `The emergent acceleration ${magnitude} m/s^2 is outside the frozen band ` +
            `${AUTHORED_BANDS.accelerationMetresPerSecondSquared.minNonZero}-` +
            `${AUTHORED_BANDS.accelerationMetresPerSecondSquared.max} m/s^2`
        );
      }
    } else if (magnitude > 1e-12) {
      sink.add(
        "value-outside-frozen-band",
        id,
          `${base}.samples[${index}].accelerationMetresPerSecondSquared`,
        "A zero net force must give a zero acceleration"
      );
    }
  }

  for (const measurement of summary.measurements) {
    const quantity = asQuantity(measurement.quantity);
    if (quantity === null) {
      sink.add(
        "unreadable-scenario-file",
        id,
        `${base}.measurements`,
        `Measurement ${measurement.id} declares the unknown quantity ${measurement.quantity}`
      );
      continue;
    }
    if (!Number.isFinite(measurement.value)) {
      sink.add(
        "non-finite-value",
        id,
        `${base}.measurements`,
        `Measurement ${measurement.id} is not a finite number`
      );
      continue;
    }
    if (isOnDisplayRoundingBoundary(measurement.value, quantity)) {
      sink.add(
        "value-on-display-rounding-boundary",
        id,
        `${base}.measurements`,
        `Measurement ${measurement.id} (${measurement.value}) sits exactly on a display rounding ` +
          `boundary for ${quantity}`
      );
    }
    if (!isDisplayRoundTripSafe(measurement.value, quantity)) {
      sink.add(
        "display-round-trip-unsafe",
        id,
        `${base}.measurements`,
        `Measurement ${measurement.id} (${measurement.value}) is further from its display form ` +
          `than the ${quantity} tolerance floor allows`
      );
    }
  }
}

function checkReadability(sink: DefectSink, scenario: ScenarioFile): void {
  const id = scenario.manifest.scenarioId;
  const blocks: readonly (readonly [string, string])[] = [
    ["manifest.title", scenario.manifest.title],
    ["manifest.expectedRelationship.statement", scenario.manifest.expectedRelationship.statement],
    ["manifest.debriefExplanation", scenario.manifest.debriefExplanation],
    ...scenario.manifest.acceptedEvidence.map(
      (entry, index): readonly [string, string] => [`manifest.acceptedEvidence[${index}]`, entry]
    ),
    ...scenario.manifest.misconceptions.flatMap(
      (entry, index): readonly (readonly [string, string])[] => [
        [`manifest.misconceptions[${index}].statement`, entry.statement],
        [`manifest.misconceptions[${index}].remediation`, entry.remediation],
      ]
    ),
  ];

  for (const [path, text] of blocks) {
    const metrics = measureReadability(text);
    for (const breach of findReadabilityBreaches(metrics)) {
      sink.add(
        "reading-complexity-too-high",
        id,
        path,
        `Authored copy exceeds the grades 6-8 target: ${breach.metric} is ${breach.observed} ` +
          `(limit ${breach.limit})`
      );
    }
  }
}

function checkAssessedComparisons(
  sink: DefectSink,
  scenario: ScenarioFile,
  investigation: ControlledInvestigation
): void {
  const id = scenario.manifest.scenarioId;
  const trials = scenario.design.trials;
  const baselines = trials.filter((trial) => trial.role === "baseline");

  if (baselines.length === 0) {
    sink.add(
      "misconfigured-investigation",
      id,
      "design.trials",
      "A scenario must name at least one baseline trial for the assessed comparison"
    );
    return;
  }

  // Every comparison is checked inside one subject: a reference trial is never
  // compared against a suspect trial, because two different carts are not a
  // controlled comparison, they are the observation the puzzle is built on.
  for (const subject of ["reference", "suspect"] as const) {
    const subjectBaselines = baselines.filter((trial) => trial.subject === subject);
    if (subjectBaselines.length === 0) continue;
    for (const baseline of subjectBaselines) {
      for (const candidate of trials) {
        if (candidate === baseline || candidate.subject !== subject) continue;
        let assessment;
        try {
          assessment = assessTrialChange(investigation, baseline.configuration, candidate.configuration);
        } catch (error) {
          sink.add(
            "misconfigured-investigation",
            id,
            "design.investigation",
            `The controlled investigation rejected its own configurations: ${String(error)}`
          );
          continue;
        }
        if (assessment.validity === "unchanged") continue;
        if (assessment.validity !== "valid") {
          sink.add(
            "unfair-assessed-comparison",
            id,
            "design.trials",
            `Comparing ${baseline.trialKey} with ${candidate.trialKey} is not a fair test: ` +
              `${assessment.validity}. ${assessment.pedagogy ?? ""}`.trim()
          );
        }
      }
    }
  }
}

function checkDiagnosis(
  sink: DefectSink,
  scenario: ScenarioFile,
  summaries: readonly TrialEvidenceSummary[],
  verdict: ReturnType<typeof diagnoseBoundedCause> | undefined
): void {
  const id = scenario.manifest.scenarioId;
  const causes = scenario.design.candidateCauses ?? [];
  if (causes.length < 2) {
    sink.add(
      "diagnosis-without-candidates",
      id,
      "design.candidateCauses",
      "A diagnosis scenario must offer at least two bounded candidate causes"
    );
    return;
  }
  if (verdict === undefined) {
    sink.add(
      "diagnosis-without-candidates",
      id,
      "design.candidateCauses",
      "The validator was given no executed evidence, so well-posedness was not proven"
    );
    return;
  }
  if (verdict.reason === "insufficient-comparisons") {
    sink.add(
      "ambiguous-diagnosis",
      id,
      "design.trials",
      `The scenario supports only ${verdict.controlledComparisons} controlled comparison(s); ` +
        `at least two are required, so a single reading would decide the answer`
    );
  }
  if (verdict.reason === "ambiguous" || verdict.reason === "no-cause-fits") {
    sink.add(
      "ambiguous-diagnosis",
      id,
      "design.candidateCauses",
      verdict.explanation
    );
  }  // The puzzle must be genuinely hard. Every candidate needs at least one
  // rival it is indistinguishable from at one of the offered force settings,
  // so the learner cannot settle the cause by elimination from a single run.
  // See the note in ./diagnosis.ts and docs/CONTENT_SET.md section 8 for why
  // this is weaker than "no single reading ever decides", and why that weaker
  // form is unreachable with the four frozen causes.
  const forces = [...new Set(summaries.map((summary) => summary.appliedForceNewtons))].sort(
    (left, right) => left - right
  );
  if (forces.length < 2) return;
  if (!everyCauseHasIndistinguishableRival(causes, forces)) {
    const isolated = causes.filter(
      (cause) => ambiguousForcesFor(cause, causes, forces).length === 0
    );
    sink.add(
      "guessable-answer-key",
      id,
      "design.candidateCauses",
      isolated.length === 0
        ? "No applied-force reading leaves a genuine choice between causes, so the diagnosis " +
          "cannot be made from evidence at all"
        : `${isolated.map((cause) => cause.id).join(", ")} can be ruled out from every single ` +
          `reading offered, so the cause never needs two controlled comparisons`
    );
  }

  for (const cause of causes) {
    for (const force of forces) {
      if (predictCauseAcceleration(cause, force) === null) {
        sink.add(
          "diagnosis-without-candidates",
          id,
          "design.candidateCauses",
          `Cause ${cause.id} predicts a net force opposite to the observed direction at ` +
            `${force} N, so it is not a bounded deficit cause`
        );
      }
    }
  }
}

function checkTraceReferences(
  sink: DefectSink,
  scenario: ScenarioFile,
  resolveTrace: (reference: string) => readonly string[] | null
): void {
  const id = scenario.manifest.scenarioId;
  if (scenario.manifest.expectedTraces.length === 0) {
    sink.add(
      "expected-trace-unresolved",
      id,
      "manifest.expectedTraces",
      "Every scenario must cite at least one golden trace that backs its expected values"
    );
    return;
  }
  for (const [index, reference] of scenario.manifest.expectedTraces.entries()) {
    const resolved = resolveTrace(reference);
    if (resolved === null) {
      sink.add(
        "expected-trace-unresolved",
        id,
        `manifest.expectedTraces[${index}]`,
        `The trace reference ${reference} does not resolve to a golden fixture`
      );
    }
  }
}

function checkGoldenAgreement(
  sink: DefectSink,
  scenario: ScenarioFile,
  summary: TrialEvidenceSummary
): void {
  const id = scenario.manifest.scenarioId;
  if (summary.digestMatchesGolden) return;
  const scenarioTrace = scenario.manifest.scenarioId;
  sink.add(
    "expected-trace-mismatch",
    id,
    `evidence.${summary.trialKey}`,
    `The executed trajectory for ${summary.trialKey} does not match the golden trace recorded ` +
      `for ${scenarioTrace}`
  );
}

// ---------------------------------------------------------------------------
// Family- and set-level rules
// ---------------------------------------------------------------------------

function checkFamilyCoverage(
  sink: DefectSink,
  families: readonly FamilyDefinition[],
  scenarios: readonly ScenarioFile[]
): void {
  const byFamily = new Map<string, ScenarioFile[]>();
  for (const scenario of scenarios) {
    const bucket = byFamily.get(scenario.manifest.familyId) ?? [];
    bucket.push(scenario);
    byFamily.set(scenario.manifest.familyId, bucket);
  }

  for (const family of families) {
    const members = byFamily.get(family.id) ?? [];
    if (members.length === 0) {
      sink.add(
        "family-has-no-scenarios",
        family.id,
        "contentSet",
        `The frozen family ${family.id} has no authored scenario`
      );
      continue;
    }

    const covered = new Set(
      members.flatMap((member) => member.manifest.misconceptions.map((entry) => entry.id))
    );
    for (const misconception of family.misconceptions) {
      if (!covered.has(misconception)) {
        sink.add(
          "misconception-uncovered",
          family.id,
          "contracts/mission-families.v1.json",
          `No scenario in ${family.id} maps the frozen misconception ${misconception} to a ` +
            `remediation`
        );
      }
    }

    if (family.graphRequirement.level === "required") {
      const satisfied = members.some(
        (member) => member.manifest.graphRequirement.level === "required"
      );
      if (!satisfied) {
        sink.add(
          "graph-requirement-unmet-by-family",
          family.id,
          "contracts/mission-families.v1.json",
          `Family ${family.id} requires a graph to succeed but no authored scenario does`
        );
      }
    }
    if (family.graphRequirement.level === "optional") {
      const used = members.some(
        (member) =>
          member.manifest.graphRequirement.level === "optional" &&
          family.graphRequirement.graphs.every((graph) =>
            member.manifest.graphRequirement.graphs.includes(graph)
          )
      );
      if (!used) {
        sink.add(
          "graph-requirement-unmet-by-family",
          family.id,
          "contracts/mission-families.v1.json",
          `Family ${family.id} declares an optional ${family.graphRequirement.graphs.join("/")} ` +
            `graph but no authored scenario offers it`
        );
      }
    }
  }

  const anyRequired = scenarios.some(
    (scenario) =>
      scenario.manifest.graphRequirement.level === "required" &&
      scenario.manifest.graphRequirement.graphs.includes("velocity-time")
  );
  if (!anyRequired) {
    sink.add(
      "graph-interpretation-uncovered",
      "<set>",
      "contentSet",
      "No authored scenario requires reading a velocity-time graph, so the mandated " +
        "graph-interpretation requirement is unmet"
    );
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Validate the whole canonical content set.
 *
 * Returns every defect found, ordered by scenario then by rule. An empty
 * array means the set satisfies every machine-checkable content rule; it does
 * not mean the content has been reviewed.
 */
export function validateContentSet(input: ContentValidationInput): readonly ContentDefect[] {
  const sink = new DefectSink();
  const seenIds = new Set<string>();

  for (const scenario of input.scenarios) {
    const id = scenario.manifest?.scenarioId ?? "<unreadable>";
    if (seenIds.has(id)) {
      sink.add("duplicate-scenario-id", id, "manifest.scenarioId", `Scenario id ${id} is used twice`);
      continue;
    }
    seenIds.add(id);

    const violations = validateAgainstSchema(input.schema, scenario.manifest);
    for (const violation of violations) {
      sink.add(
        "schema-invalid",
        id,
        `manifest${violation.path === "" ? "" : `.${violation.path}`}`,
        `Provenance schema: the value ${violation.message}`
      );
    }

    const family = findFamily(scenario.manifest?.familyId ?? "");
    checkManifestShape(sink, scenario, family);

    const investigation = scenario.design?.investigation;
    if (investigation === undefined) {
      sink.add(
        "misconfigured-investigation",
        id,
        "design.investigation",
        "A scenario must declare the controlled investigation its trials run under"
      );
    } else {
      try {
        assertValidInvestigation(investigation);
      } catch (error) {
        sink.add(
          "misconfigured-investigation",
          id,
          "design.investigation",
          `The declared investigation is malformed: ${String(error)}`
        );
      }
      checkAssessedComparisons(sink, scenario, investigation);
    }

    const summaries = input.evidence.get(id) ?? [];
    if (summaries.length === 0) {
      sink.add(
        "evidence-coverage-too-thin",
        id,
        "design.trials",
        "No executed evidence was supplied for this scenario, so none of its values were checked"
      );
    }
    const byTrialKey = new Map(summaries.map((summary) => [summary.trialKey, summary]));
    const declaredMass = scenario.manifest?.initialConditions?.cartMassKilograms ?? 0;
    const declaredResistance = scenario.manifest?.initialConditions?.resistiveForceNewtons ?? 0;
    let hiddenDefeatsObserved = 0;

    for (const [index, trial] of (scenario.design?.trials ?? []).entries()) {
      checkAuthoredValues(sink, scenario, trial, index);
      checkNetForceDeclaration(
        sink,
        scenario,
        trial,
        index,
        byTrialKey.get(trial.trialKey),
        declaredMass,
        declaredResistance
      );
      if (trial.hiddenCause && scenario.manifest?.familyId !== "mystery-cart") {
        sink.add(
          "guessable-answer-key",
          id,
          `design.trials[${index}].hiddenCause`,            "Only a Mystery Cart scenario may declare a hidden cause"
        );
      }
      if (trial.hiddenCause) {
        const summary = byTrialKey.get(trial.trialKey);
        if (summary !== undefined && declaredMass > 0) {
          const declared =
            Math.abs(
              trial.appliedForcesNewtons.reduce((total, force) => total + force, 0) -
                declaredResistance
            ) / declaredMass;
          if (Math.abs(summary.accelerationOfTrial) < declared - 1e-9) hiddenDefeatsObserved += 1;
        }
      }
    }

    if ((scenario.design?.trials ?? []).some((trial) => trial.hiddenCause) && hiddenDefeatsObserved === 0) {
      sink.add(
        "ambiguous-diagnosis",
        id,
        "design.trials",
        "A scenario with a hidden cause must show the deficit on at least one trial; otherwise " +
          "nothing distinguishes a faulty cart from a healthy one"
      );
    }

    for (const summary of summaries) {
      checkExecutedValues(sink, scenario, summary);
      checkGoldenAgreement(sink, scenario, summary);
    }

    if (scenario.manifest?.familyId === "mystery-cart") {
      // Only the suspect cart's readings are evidence *about the cause*. The
      // reference cart is a known-good control whose numbers are explained by
      // the nominal model; feeding them to the diagnosis engine would reject
      // every candidate cause, because none of them describes a healthy cart.
      const suspectSummaries = summaries.filter((summary) => summary.subject === "suspect");
      const referenceSummaries = summaries.filter((summary) => summary.subject === "reference");
      const toObservation = (summary: TrialEvidenceSummary): Observation => ({
        trialKey: summary.trialKey,
        subject: summary.subject,
        appliedForceNewtons: summary.appliedForceNewtons,
        measuredAccelerationMetresPerSecondSquared: summary.accelerationOfTrial,
        measuredNetForceNewtons: summary.netForceNewtonsOfTrial,
      });
      const computed = diagnoseBoundedCause(
        {
          observations: suspectSummaries.map(toObservation),
          controlObservations: referenceSummaries.map(toObservation),
        },
        scenario.design?.candidateCauses ?? []
      );
      checkDiagnosis(sink, scenario, summaries, input.diagnoses.get(id) ?? computed);
      if (computed.controlledComparisons < 2) {
        sink.add(
          "ambiguous-diagnosis",
          id,
          "design.trials",
          `Only ${computed.controlledComparisons} controlled comparison(s) are available; ` +
            `at least two are required by the family contract`
        );
      }
    }

    checkReadability(sink, scenario);
    checkTraceReferences(sink, scenario, input.resolveTrace);
  }

  checkFamilyCoverage(sink, input.families, input.scenarios);
  return sink.defects;
}

/**
 * Re-exported so a caller can compute a diagnosis without importing the
 * diagnosis module directly; the set validator uses the same function.
 */
export { countControlledComparisons, diagnoseBoundedCause };
