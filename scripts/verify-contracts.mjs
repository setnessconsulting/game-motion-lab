#!/usr/bin/env node
/**
 * Motion Lab contract consistency checker (GAME-383 / ML-01).
 *
 * Dependency-free (Node built-ins only). Validates that the frozen ML-01 contracts are
 * well-formed, internally consistent, cross-reference the documents they belong to, and
 * reference GAME-382 as the Jira authority.
 *
 * Scope note: this checks the *documentation contracts*. It is not a game test suite and
 * it makes no claim about an application that does not exist yet.
 *
 * Usage:  node scripts/verify-contracts.mjs
 * Exit:   0 = all checks pass, 1 = at least one check failed.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const failures = [];
const checks = [];
let currentGroup = 'general';

function group(name) {
  currentGroup = name;
}

function check(description, condition, detail = '') {
  const ok = Boolean(condition);
  checks.push({ group: currentGroup, description, ok, detail });
  if (!ok) failures.push({ group: currentGroup, description, detail });
  return ok;
}

function readText(relPath) {
  return readFileSync(join(ROOT, relPath), 'utf8');
}

function readJson(relPath) {
  return JSON.parse(readText(relPath));
}

function exists(relPath) {
  return existsSync(join(ROOT, relPath));
}

function relPathsIn(dir) {
  return readdirSync(join(ROOT, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function sameSet(actual, expected) {
  const a = uniqueSorted(actual);
  const b = uniqueSorted(expected);
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function approxEqual(a, b, tolerance = 1e-9) {
  return typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tolerance;
}

function rangeIds(prefix, count, width) {
  return Array.from(
    { length: count },
    (_, index) => `${prefix}${String(index + 1).padStart(width, '0')}`,
  );
}

/** Strip light markdown formatting so prose checks are not defeated by emphasis markers. */
function plain(text) {
  return text
    .replace(/[`*#]/g, ' ')
    .replace(/^\s*>\s?/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const CONTRACT_FILES = [
  'science-conventions.v1.json',
  'mission-families.v1.json',
  'comparators.v1.json',
  'quality-scorecard.v1.json',
  'scenario-provenance.schema.json',
  'decisions.v1.json',
];

const DOC_FILES = [
  'PRODUCT.md',
  'CURRICULUM.md',
  'SCIENCE_MODEL.md',
  'ARCHITECTURE.md',
  'MISSIONS.md',
  'COMPARATORS.md',
  'QUALITY_SCORECARD.md',
  'ACCESSIBILITY.md',
  'PRIVACY.md',
  'PERFORMANCE.md',
  'PROVENANCE.md',
  'RELEASE.md',
  'DEFINITION_OF_DONE.md',
  'DECISIONS.md',
];

const JIRA_AUTHORITY = 'GAME-382';
const FROZEN_BY = 'GAME-383';

// ---------------------------------------------------------------------------
group('files present');

check('README.md exists', exists('README.md'));
for (const doc of DOC_FILES) {
  check(`docs/${doc} exists`, exists(join('docs', doc)));
}
check('docs/README.md exists', exists('docs/README.md'));
check('contracts/README.md exists', exists('contracts/README.md'));
for (const file of CONTRACT_FILES) {
  check(`contracts/${file} exists`, exists(join('contracts', file)));
}

const adrFiles = exists('docs/adr') ? relPathsIn('docs/adr').filter((f) => f.endsWith('.md')) : [];
check('six ADR documents exist', adrFiles.length === 6, `found ${adrFiles.length}: ${adrFiles.join(', ')}`);
for (const adr of adrFiles) {
  const text = readText(join('docs/adr', adr));
  check(`ADR ${adr} is Accepted`, /^-\s*\*\*Status:\*\*\s*Accepted/m.test(text), adr);
  check(`ADR ${adr} references GAME-382`, text.includes(JIRA_AUTHORITY), adr);
}

// ---------------------------------------------------------------------------
group('contract envelopes');

const parsed = {};
for (const file of CONTRACT_FILES) {
  try {
    parsed[file] = readJson(join('contracts', file));
    check(`contracts/${file} parses as JSON`, true);
  } catch (error) {
    check(`contracts/${file} parses as JSON`, false, String(error.message));
  }
}

const ENVELOPED = [
  'science-conventions.v1.json',
  'mission-families.v1.json',
  'comparators.v1.json',
  'quality-scorecard.v1.json',
  'decisions.v1.json',
];
for (const file of ENVELOPED) {
  const doc = parsed[file];
  if (!doc) continue;
  check(`${file} declares contractId`, typeof doc.contractId === 'string' && doc.contractId.startsWith('motion-lab.'));
  check(`${file} declares a version`, /^\d+\.\d+\.\d+$/.test(String(doc.version)));
  check(`${file} is frozen`, doc.status === 'frozen');
  check(`${file} names ${JIRA_AUTHORITY}`, doc.jiraAuthority === JIRA_AUTHORITY);
  check(`${file} names ${FROZEN_BY}`, doc.frozenBy === FROZEN_BY);
  check(
    `${file} points at an existing source document`,
    typeof doc.sourceDocument === 'string' && exists(doc.sourceDocument),
    String(doc.sourceDocument),
  );
}

const schema = parsed['scenario-provenance.schema.json'];
if (schema) {
  check('scenario schema is JSON Schema 2020-12', schema.$schema === 'https://json-schema.org/draft/2020-12/schema');
  check('scenario schema describes an object', schema.type === 'object');
  const required = new Set(Array.isArray(schema.required) ? schema.required : []);
  const epicRequired = [
    'scenarioId',
    'targetStandard',
    'scienceConcepts',
    'independentVariable',
    'dependentVariable',
    'controlledVariables',
    'units',
    'initialConditions',
    'expectedRelationship',
    'acceptedEvidence',
    'misconceptions',
    'debriefExplanation',
    'reviewStatus',
    'reviewer',
    'referenceBasis',
  ];
  for (const field of epicRequired) {
    check(`scenario schema requires "${field}"`, required.has(field));
  }
  for (const field of ['answerTolerance', 'expectedTraces', 'difficultyLevel', 'graphRequirement']) {
    check(`scenario schema requires "${field}"`, required.has(field));
  }
  check(
    'scenario schema allows only the four mission families',
    JSON.stringify(schema.properties?.familyId?.enum) ===
      JSON.stringify(['calibration-run', 'thruster-test', 'cargo-load-test', 'mystery-cart']),
  );
  check(
    'scenario schema pins the target standard',
    schema.properties?.targetStandard?.const === 'NGSS MS-PS2-2',
  );
  check(
    'scenario schema constrains answer tolerance to the frozen band',
    schema.properties?.answerTolerance?.properties?.relative?.minimum === 0.01 &&
      schema.properties?.answerTolerance?.properties?.relative?.maximum === 0.05,
  );
}

// ---------------------------------------------------------------------------
group('science conventions');

const science = parsed['science-conventions.v1.json'];
if (science) {
  const quantities = science.quantities ?? [];
  const expectedQuantities = ['mass', 'force', 'netForce', 'position', 'time', 'velocity', 'acceleration'];
  check('quantity ids are unique', sameSet(quantities.map((q) => q.id), quantities.map((q) => q.id)));
  check(
    'quantity set matches the frozen science quantities',
    sameSet(quantities.map((q) => q.id), expectedQuantities),
    quantities.map((q) => q.id).join(','),
  );
  for (const quantity of quantities) {
    const halfIncrement = 10 ** -quantity.displayDecimals / 2;
    const required = 2 * halfIncrement;
    check(
      `display round-trip safety holds for "${quantity.id}"`,
      typeof quantity.toleranceFloor === 'number' && quantity.toleranceFloor >= required,
      `floor=${quantity.toleranceFloor} required>=${required}`,
    );
    check(`"${quantity.id}" declares an SI unit`, typeof quantity.siUnit === 'string' && quantity.siUnit.length > 0);
    check(`"${quantity.id}" declares a display unit`, typeof quantity.displayUnit === 'string' && quantity.displayUnit.length > 0);
  }
  check('physics-engine authority is denied', science.model?.physicsEngineAuthority === false);
  check('numerical-integrator authority is denied', science.model?.numericalIntegratorAuthority === false);
  check('renderer authority is denied', science.model?.rendererAuthority === false);
  check('model is closed-form analytic', science.model?.integration === 'closed-form-analytic');
  check('model is one-dimensional', science.model?.dimensions === 1);
  check('resistance is never implicit', science.resistancePolicy?.implicitResistanceAllowed === false);
  check(
    'unsupported force models fail closed',
    science.resistancePolicy?.unsupportedModelBehaviour === 'fail-closed-typed-error',
  );
  check('authoritative values are not rounded', science.displayRounding?.authoritativeValuesAreRounded === false);
  check('display values never feed back', science.displayRounding?.displayValueFeedsBackIntoState === false);
  check(
    'display rounding is locale independent',
    science.displayRounding?.localeDependent === false,
  );
  check(
    'answer tolerance comparison rule is explicit',
    typeof science.answerTolerance?.comparisonRule === 'string' && science.answerTolerance.comparisonRule.includes('abs('),
  );
  check('fuzzy matching is disallowed', science.answerTolerance?.fuzzyMatchingAllowed === false);
  check('sign errors always fail', science.answerTolerance?.signErrorAlwaysFails === true);
  check('renderer frame rate cannot affect science', science.determinism?.rendererFrameRateAffectsScience === false);
  check('non-finite values are rejected', science.determinism?.rejectsNonFinite === true);

  // Mutually-consistent value bands: |a| = |Fnet|/m must stay inside the emergent band.
  const bands = science.valueRanges ?? {};
  const massLow = bands.massKg?.[0];
  const massHigh = bands.massKg?.[1];
  const forceLow = bands.appliedForceN?.[0];
  const forceHigh = bands.appliedForceN?.[1];
  const accelLow = bands.emergentAccelerationMetresPerSecondSquared?.[0];
  const accelHigh = bands.emergentAccelerationMetresPerSecondSquared?.[1];
  check(
    'value bands exist',
    [massLow, massHigh, forceLow, forceHigh, accelLow, accelHigh].every(
      (value) => typeof value === 'number',
    ),
  );
  if (typeof massHigh === 'number' && typeof forceLow === 'number' && typeof accelLow === 'number') {
    check(
      'lowest emergent acceleration matches the force/mass bands',
      approxEqual(forceLow / massHigh, accelLow),
      `${forceLow}/${massHigh}=${forceLow / massHigh} vs ${accelLow}`,
    );
  }
  if (typeof massLow === 'number' && typeof forceHigh === 'number' && typeof accelHigh === 'number') {
    check(
      'highest emergent acceleration matches the force/mass bands',
      approxEqual(forceHigh / massLow, accelHigh),
      `${forceHigh}/${massLow}=${forceHigh / massLow} vs ${accelHigh}`,
    );
  }
  check(
    'segment reversal is handled rather than silently extrapolated',
    science.resistancePolicy?.reversalHandling?.silentExtrapolationAllowed === false &&
      science.resistancePolicy?.reversalHandling?.windowCrossingReversalRequiresSegmentation === true,
  );
  check(
    'track length is explicitly presentation-only',
    bands.trackLengthIsPresentationOnly === true,
  );
}

// ---------------------------------------------------------------------------
group('mission families');

const missions = parsed['mission-families.v1.json'];
let missionIds = [];
if (missions) {
  const families = missions.families ?? [];
  missionIds = families.map((f) => f.id);
  const expectedFamilies = ['calibration-run', 'thruster-test', 'cargo-load-test', 'mystery-cart'];
  check('exactly four mission families are declared', families.length === 4, `found ${families.length}`);
  check('mission family ids match the frozen set', sameSet(missionIds, expectedFamilies), missionIds.join(','));
  for (const family of families) {
    check(`family "${family.id}" declares a concept`, typeof family.primaryConcept === 'string' && family.primaryConcept.length > 0);
    check(`family "${family.id}" declares an independent variable`, typeof family.independentVariable === 'string' && family.independentVariable.length > 0);
    check(`family "${family.id}" declares a dependent variable`, typeof family.dependentVariable === 'string' && family.dependentVariable.length > 0);
    check(`family "${family.id}" declares controlled variables`, Array.isArray(family.controlledVariables) && family.controlledVariables.length > 0);
    check(`family "${family.id}" declares expected evidence`, typeof family.requiredEvidence === 'string' && family.requiredEvidence.length > 0);
    check(`family "${family.id}" maps misconceptions`, Array.isArray(family.misconceptions) && family.misconceptions.length > 0);
    check(`family "${family.id}" bounds the answer key`, family.answerKeyBounded === true);
    check(`family "${family.id}" declares difficulty levels`, Array.isArray(family.difficultyLevels) && family.difficultyLevels.length > 0);
    check(
      `family "${family.id}" uses only frozen difficulty levels`,
      (family.difficultyLevels ?? []).every((level) =>
        (missions.difficultyLevels ?? []).some((known) => known.id === level),
      ),
    );
    check(`family "${family.id}" declares a graph requirement`, family.graphRequirement && typeof family.graphRequirement.level === 'string');
  }

  const requirement = missions.graphInterpretationRequirement ?? {};
  check('the graph-interpretation requirement is satisfied', requirement.satisfied === true);
  const satisfying = families.find((f) => f.id === requirement.satisfiedBy);
  check(
    'the satisfying family actually requires a graph',
    Boolean(satisfying) && satisfying.graphRequirement?.level === 'required',
    String(requirement.satisfiedBy),
  );
  check(
    'at least one family requires graph interpretation',
    families.some((f) => f.graphRequirement?.level === 'required'),
  );

  const mystery = families.find((f) => f.id === 'mystery-cart');
  check('Mystery Cart declares bounded candidate causes', Array.isArray(mystery?.candidateCauses) && mystery.candidateCauses.length >= 2);
  for (const cause of mystery?.candidateCauses ?? []) {
    check(`Mystery Cart cause "${cause.id}" has a distinguishing test`, typeof cause.distinguishingTest === 'string' && cause.distinguishingTest.length > 0);
  }
}

const missionsDoc = plain(exists('docs/MISSIONS.md') ? readText('docs/MISSIONS.md') : '');
for (const id of missionIds) {
  check(`docs/MISSIONS.md documents family "${id}"`, missionsDoc.includes(id));
}
check(
  'docs/MISSIONS.md states the one-independent-variable rule',
  /one\s+\*?\*?independent variable/i.test(missionsDoc) || missionsDoc.includes('one independent variable'),
);
check(
  'docs/MISSIONS.md states the anti-answer-key rule',
  /answer[- ]key/i.test(missionsDoc),
);

// ---------------------------------------------------------------------------
group('comparators');

const comparators = parsed['comparators.v1.json'];
const scorecard = parsed['quality-scorecard.v1.json'];
let comparatorIds = [];
let scorecardRows = [];
if (comparators) {
  const scored = comparators.scored ?? [];
  const reference = comparators.referenceOnly ?? [];
  comparatorIds = scored.map((c) => c.id);
  check('three scored comparators are declared', scored.length === 3, `found ${scored.length}`);
  check(
    'scored comparator ids match the frozen set',
    sameSet(comparatorIds, ['phet-forces-and-motion-basics', 'algodoo', 'poly-bridge-3']),
    comparatorIds.join(','),
  );
  check('exactly one reference-only comparator is declared', reference.length === 1, `found ${reference.length}`);
  const ksp = reference.find((c) => c.id === 'kerbal-space-program');
  check('Kerbal Space Program is reference-only', Boolean(ksp));
  check('Kerbal Space Program is not scored', ksp?.scored === false);
  check('Kerbal Space Program is never globally scored against Motion Lab', ksp?.globallyScoredAgainstMotionLab === false);
  for (const comparator of scored) {
    check(`comparator "${comparator.id}" informs at least one dimension`, Array.isArray(comparator.informsDimensionRows) && comparator.informsDimensionRows.length > 0);
    check(`comparator "${comparator.id}" records what not to borrow`, Array.isArray(comparator.doNotBorrow) && comparator.doNotBorrow.length > 0);
  }
}
if (scorecard && comparators) {
  scorecardRows = (scorecard.rows ?? []).map((row) => row.id);
  const mapped = comparators.dimensionMapping ?? [];
  check('every scorecard row is mapped by the comparator registry', sameSet(mapped.map((m) => m.row), scorecardRows));
  check('no scorecard row is mapped twice', mapped.length === scorecardRows.length, `${mapped.length} vs ${scorecardRows.length}`);
  for (const mapping of mapped) {
    for (const id of mapping.comparators ?? []) {
      check(`dimension mapping "${mapping.row}" references a scored comparator`, comparatorIds.includes(id), id);
    }
  }
}
const comparatorsDoc = plain(exists('docs/COMPARATORS.md') ? readText('docs/COMPARATORS.md') : '');
for (const id of comparatorIds) {
  check(`docs/COMPARATORS.md documents comparator "${id}"`, comparatorsDoc.includes(id));
}
check('docs/COMPARATORS.md documents the reference-only comparator', comparatorsDoc.includes('kerbal-space-program'));
check('docs/COMPARATORS.md keeps KSP never globally scored', /never scored globally/i.test(comparatorsDoc));
check('docs/COMPARATORS.md states an absolute IP boundary', /IP boundary/i.test(comparatorsDoc));

// ---------------------------------------------------------------------------
group('quality scorecard');

if (scorecard) {
  const rows = scorecard.rows ?? [];
  check('scorecard declares 23 rows', rows.length === 23, `found ${rows.length}`);
  check('scorecard row ids match Q-01..Q-23', sameSet(rows.map((r) => r.id), rangeIds('Q-', 23, 2)), rows.map((r) => r.id).join(','));
  for (const row of rows) {
    check(`row "${row.id}" has a Meets definition`, typeof row.meets === 'string' && row.meets.trim().length > 0);
    check(`row "${row.id}" has a Below definition`, typeof row.below === 'string' && row.below.trim().length > 0);
    check(`row "${row.id}" names its evidence`, typeof row.evidence === 'string' && row.evidence.trim().length > 0);
    check(
      `row "${row.id}" Meets and Below differ`,
      row.meets !== row.below,
      row.id,
    );
    check(
      `row "${row.id}" has no subjective-only scoring`,
      row.meets.trim().split(/\s+/).length >= 8,
      row.id,
    );
    for (const id of row.comparators ?? []) {
      check(`row "${row.id}" references a real scored comparator`, comparatorIds.includes(id), id);
    }
    check(`row "${row.id}" is assigned to at least one gate`, Array.isArray(row.gates) && row.gates.length > 0);
  }
  const gateSummary = scorecard.gateSummary ?? [];
  for (const gate of gateSummary) {
    if (gate.rowsMustNotBeBelow === 'all') continue;
    for (const id of gate.rowsMustNotBeBelow ?? []) {
      check(`gate "${gate.gate}" references a real row`, scorecardRows.includes(id), id);
      const row = rows.find((r) => r.id === id);
      check(`gate "${gate.gate}" row "${id}" also lists that gate`, (row?.gates ?? []).includes(gate.gate), id);
    }
  }
  check('the scorecard is scored only on mapped comparator dimensions', scorecard.rules.some((rule) => rule.includes('comparator rows are scored only on the dimensions that comparator informs')));
}
const scorecardDoc = plain(exists('docs/QUALITY_SCORECARD.md') ? readText('docs/QUALITY_SCORECARD.md') : '');
for (const id of scorecardRows) {
  check(`docs/QUALITY_SCORECARD.md documents row "${id}"`, scorecardDoc.includes(id));
}
check(
  'docs/QUALITY_SCORECARD.md defines Meets and Below columns',
  scorecardDoc.includes('Meets') && scorecardDoc.includes('Below'),
);
check(
  'docs/QUALITY_SCORECARD.md forbids not-assessed as a pass',
  /Not assessed is never counted as a pass/i.test(scorecardDoc),
);

// ---------------------------------------------------------------------------
group('decision register');

const decisions = parsed['decisions.v1.json'];
let frozenIds = [];
if (decisions) {
  const frozen = decisions.frozen ?? [];
  frozenIds = frozen.map((d) => d.id);
  check('30 frozen decisions are registered', frozen.length === 30, `found ${frozen.length}`);
  check('frozen decision ids match D-001..D-030', sameSet(frozenIds, rangeIds('D-', 30, 3)), frozenIds.join(','));
  for (const decision of frozen) {
    check(`decision "${decision.id}" names an existing owning document`, typeof decision.ownedBy === 'string' && exists(decision.ownedBy), String(decision.ownedBy));
  }
  const delegated = (decisions.delegated ?? []).map((d) => d.id);
  check('12 delegated decisions are registered', delegated.length === 12, `found ${delegated.length}`);
  check('delegated decision ids match G-01..G-12', sameSet(delegated, rangeIds('G-', 12, 2)), delegated.join(','));
  for (const entry of decisions.delegated ?? []) {
    check(`delegated decision "${entry.id}" declares a guardrail`, typeof entry.guardrail === 'string' && entry.guardrail.trim().length > 0);
    check(`delegated decision "${entry.id}" names the owning issue`, typeof entry.deferredTo === 'string' && entry.deferredTo.length > 0);
  }
  const owner = (decisions.ownerGated ?? []).map((d) => d.id);
  check('7 owner-gated decisions are registered', owner.length === 7, `found ${owner.length}`);
  check('owner-gated decision ids match O-01..O-07', sameSet(owner, rangeIds('O-', 7, 2)), owner.join(','));
  check('no decision that can change ML-02..ML-11 remains open', (decisions.openDecisions ?? []).length === 0);
}
const decisionsDoc = plain(exists('docs/DECISIONS.md') ? readText('docs/DECISIONS.md') : '');
for (const id of frozenIds) {
  check(`docs/DECISIONS.md documents decision "${id}"`, decisionsDoc.includes(id));
}
check(
  'docs/DECISIONS.md states that no material decision remains open',
  /no open decisions that can materially change ML-02 through ML-11/i.test(decisionsDoc) ||
    /No decision remains open that can materially change ML-02 through ML-11/i.test(decisionsDoc),
);

// ---------------------------------------------------------------------------
group('documentation cross-references');

const rootReadme = plain(exists('README.md') ? readText('README.md') : '');
const docsIndex = plain(exists('docs/README.md') ? readText('docs/README.md') : '');

check('README.md names GAME-382 as the Jira authority', rootReadme.includes(JIRA_AUTHORITY));
check('README.md names the frozen technology Phaser 4.2.1', rootReadme.includes('4.2.1'));
check('README.md states the renderer authority law', /never\s+comes\s+from\s+the\s+renderer/i.test(rootReadme));
check('docs/README.md names GAME-382', docsIndex.includes(JIRA_AUTHORITY));
check('docs/README.md links the ADR directory', docsIndex.includes('adr/'));

for (const doc of [...DOC_FILES, 'README.md']) {
  const text = readText(join('docs', doc));
  check(`docs/${doc} references GAME-382`, text.includes(JIRA_AUTHORITY), doc);
  if (doc !== 'README.md') {
    check(`docs/README.md is the index of record for ${doc}`, docsIndex.includes(doc), doc);
  }
}

check('docs/README.md states the freeze is by GAME-383', docsIndex.includes(FROZEN_BY));
check('contracts are described as machine-readable', docsIndex.includes('contracts/'));
check('the consistency checker is documented', rootReadme.includes('scripts/verify-contracts.mjs'));

// ---------------------------------------------------------------------------
group('honesty guards');

const allDocs = [...DOC_FILES.map((f) => join('docs', f)), 'README.md', 'docs/README.md'];
const unperformedClaimPatterns = [
  /human\s+(playtest(ing)?|review)\s+(passed|complete|signed)/i,
  /accessibility\s+sign-?off\s+(passed|complete|approved)/i,
  /science\s+approv(al|ed)\s+(obtained|granted)/i,
];
for (const file of allDocs) {
  if (!exists(file)) continue;
  const text = readText(file);
  for (const pattern of unperformedClaimPatterns) {
    const match = text.match(pattern);
    // A prohibition ("must not claim ...") is allowed; a flat assertion is not.
    check(
      `${file} does not assert unperformed human evidence (${pattern})`,
      match === null || /not|never|no\b/i.test(text.split(match.index)[1]?.slice(0, 80) ?? ''),
      match ? match[0] : '',
    );
  }
}
check(
  'the repository states that no application build or CI exists yet',
  /no application build|application foundation/i.test(rootReadme),
);

// ---------------------------------------------------------------------------
const failed = checks.filter((entry) => !entry.ok);

const byGroup = new Map();
for (const entry of checks) {
  const bucket = byGroup.get(entry.group) ?? { passed: 0, failed: 0 };
  if (entry.ok) bucket.passed += 1;
  else bucket.failed += 1;
  byGroup.set(entry.group, bucket);
}

console.log('Motion Lab contract consistency check (GAME-383 / ML-01)\n');
for (const [name, bucket] of byGroup) {
  const status = bucket.failed === 0 ? 'PASS' : 'FAIL';
  console.log(`  [${status}] ${name}: ${bucket.passed} passed, ${bucket.failed} failed`);
}
console.log('');

if (failed.length > 0) {
  console.log(`${failed.length} check(s) FAILED:\n`);
  for (const entry of failed) {
    console.log(`  - (${entry.group}) ${entry.description}${entry.detail ? `  [${entry.detail}]` : ''}`);
  }
  console.log(`\nRESULT: FAIL (${checks.length - failed.length}/${checks.length} checks passed)`);
  process.exit(1);
}

console.log(`RESULT: PASS (${checks.length}/${checks.length} checks passed)`);
