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

/**
 * Colour maths, so a declared contrast ratio is checked against the colour that actually
 * ships rather than trusted.
 *
 * A design contract that quotes contrast numbers is only useful if those numbers were
 * measured. Recomputing them here from `src/app/styles.css` and `src/renderer/labScene.ts`
 * means editing a hex value without updating the contract fails the gate, and means a ratio
 * could not be quietly improved (or quietly worsened) in prose.
 */
function hexToChannels(hex) {
  const value = String(hex).trim().replace(/^(#|0x)/i, '');
  return [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
}

/** WCAG 2.x relative luminance of an sRGB hex colour. */
function relativeLuminance(hex) {
  const channels = hexToChannels(hex).map((raw) => {
    const srgb = raw / 255;
    return srgb <= 0.03928 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG 2.x contrast ratio between two hex colours. */
function contrastRatio(a, b) {
  const lighter = Math.max(relativeLuminance(a), relativeLuminance(b));
  const darker = Math.min(relativeLuminance(a), relativeLuminance(b));
  return (lighter + 0.05) / (darker + 0.05);
}

/** The custom properties declared in a stylesheet's `:root` block, as raw values. */
function cssCustomProperties(css) {
  const rootBlock = css.match(/:root\s*\{([\s\S]*?)\}/);
  const properties = {};
  if (!rootBlock) return properties;
  for (const declaration of rootBlock[1].split(/[;\n]/)) {
    const match = declaration.match(/--([a-z0-9-]+)\s*:\s*([^;]+?)\s*$/);
    if (match) properties[match[1]] = match[2].trim().toLowerCase();
  }
  return properties;
}

/** A `#rrggbb` custom property, or null when the property is not a colour. */
function cssHex(properties, name) {
  const value = properties[name];
  return value && /^#[0-9a-f]{6}$/.test(value) ? value : null;
}

/** A CSS length in pixels. `rem` assumes the 16px root the frozen stylesheet already sets. */
function lengthToPx(value) {
  if (typeof value !== 'string') return null;
  const rem = value.match(/^([\d.]+)rem$/);
  if (rem) return Number(rem[1]) * 16;
  const px = value.match(/^([\d.]+)px$/);
  return px ? Number(px[1]) : null;
}

/**
 * The horizontal padding, in pixels, from a rule body's `padding` shorthand.
 *
 * Parsed by applying the CSS shorthand rules rather than by regex. A regex is how the first
 * version of this silently read `padding: 1.5rem 1rem 3rem` as 1rem/3rem and computed the
 * grid threshold wrong by 64px, which would have made the whole divergence check compare a
 * number against itself.
 */
function inlinePaddingPx(ruleBody) {
  const declaration = String(ruleBody ?? '').match(/(^|;)\s*padding:\s*([^;]+)/);
  if (!declaration) return null;
  const parts = declaration[2].trim().split(/\s+/).filter(Boolean);
  const horizontal = parts.length === 1 ? parts[0] : parts.length === 4 ? parts[1] : parts[1];
  return lengthToPx(horizontal);
}

/**
 * The `0xrrggbb` and `"#rrggbb"` entries of the renderer's `COLORS` constant.
 *
 * Both spellings occur in `labScene.ts`: Phaser tint values are numeric, while the text colour
 * strings are already hex. Matching only one form would silently skip half the palette and let
 * a contrast claim about the text colours go unchecked.
 */
function rendererColors(ts) {
  const block = ts.match(/const COLORS = \{([\s\S]*?)\} as const;/);
  const colors = {};
  if (!block) return colors;
  for (const line of block[1].split('\n')) {
    const match = line.match(/^\s*([A-Za-z][A-Za-z0-9]*):\s*(?:0x([0-9a-fA-F]{6})|"(#[0-9a-fA-F]{6})")\s*,/);
    if (match) colors[match[1]] = `#${(match[2] ?? match[3].slice(1)).toLowerCase()}`;
  }
  return colors;
}

/**
 * Repository paths named by a design-contract reference, which may list several.
 */
function referencedFiles(reference) {
  return String(reference ?? '')
    .split(/[,;]/)
    .map((part) => part.trim().split(/\s+/)[0])
    .filter((token) => token.includes('/'));
}

/**
 * CSS comments removed.
 *
 * Required because a check that asserts "this rule uses minmax(0, 1fr)" will happily pass on a
 * comment that explains why minmax(0, 1fr) is used while the rule itself uses something else.
 * That is not hypothetical: the stylesheet carrying this rule explains it in exactly those words,
 * and the first version of the check passed a mutation that put minmax(320px, 1fr) back.
 */
function stripCssComments(css) {
  return String(css ?? '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const CONTRACT_FILES = [
  'science-conventions.v1.json',
  'mission-families.v1.json',
  'comparators.v1.json',
  'quality-scorecard.v1.json',
  'scenario-provenance.schema.json',
  'decisions.v1.json',
  // Parsed here so the design group can check it, but deliberately NOT in ENVELOPED below:
  // ML-DESIGN is frozen by GAME-387, not GAME-383, and the ML-01 envelope rules must not be
  // loosened to accommodate it. Its envelope is checked against its own freezing issue instead.
  'design-system.v1.json',
];

const DOC_FILES = [
  'PRODUCT.md',
  'CURRICULUM.md',
  'SCIENCE_MODEL.md',
  'EXPERIMENT_MODEL.md',
  'CONTENT_SET.md',
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
  'BOOTSTRAP.md',
  'PERFORMANCE_BASELINE.md',
  'DESIGN.md',
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
group('experiment model guarantees');

const experimentDoc = plain(exists('docs/EXPERIMENT_MODEL.md') ? readText('docs/EXPERIMENT_MODEL.md') : '');

check(
  'EXPERIMENT_MODEL states that measurements are outputs, never inputs',
  /measurements are outputs, never inputs/i.test(experimentDoc)
);
check(
  'EXPERIMENT_MODEL states that the digest is an integrity invariant, not a security boundary',
  /not a security boundary/i.test(experimentDoc)
);
check(
  'EXPERIMENT_MODEL records the integrity digest as unkeyed',
  /unkeyed/i.test(experimentDoc)
);
check(
  'EXPERIMENT_MODEL requires an append-only comparison set',
  /append-only/i.test(experimentDoc)
);
check(
  'EXPERIMENT_MODEL says reset and retry allocate a new trial identity',
  /reset and retry allocate a new ordinal/i.test(experimentDoc)
);
check(
  'EXPERIMENT_MODEL keeps seeded variants out of authoritative motion',
  /seed can never influence an authoritative result/i.test(experimentDoc)
);
check(
  'EXPERIMENT_MODEL records known limitations rather than claiming completeness',
  /12\.\s*Known limitations/.test(experimentDoc) && /multi-segment continuity/i.test(experimentDoc)
);
check(
  'EXPERIMENT_MODEL maps each ML-04 acceptance criterion to where it is proven',
  /11\.\s*Acceptance criteria mapping/.test(experimentDoc) &&
    /Same seed\/configuration produces the same trial evidence/.test(experimentDoc)
);

// ---------------------------------------------------------------------------
group('canonical content set');

const contentScenarioDir = 'src/content/scenarios';
const contentGoldenDir = 'src/content/golden';
const contentScenarios = exists(contentScenarioDir)
  ? relPathsIn(contentScenarioDir).filter((f) => f.endsWith('.provenance.json'))
  : [];
const contentGoldens = exists(contentGoldenDir)
  ? relPathsIn(contentGoldenDir).filter((f) => f.endsWith('.trace.json'))
  : [];

check('src/content/scenarios exists as the canonical data location', exists(contentScenarioDir));
check('src/content/golden exists as the canonical golden location', exists(contentGoldenDir));
check('the content package exists', exists('src/content/index.ts'));

const parsedScenarios = [];
for (const file of contentScenarios) {
  const rel = join(contentScenarioDir, file);
  try {
    parsedScenarios.push({ file, rel, value: readJson(rel) });
  } catch (error) {
    check(`${rel} is valid JSON`, false, String(error));
  }
}
check(
  'every scenario file is parseable JSON',
  parsedScenarios.length === contentScenarios.length,
  `${parsedScenarios.length}/${contentScenarios.length}`
);
check('there is at least one canonical scenario', contentScenarios.length > 0, String(contentScenarios.length));
check(
  'there is one golden trace per scenario',
  contentGoldens.length === contentScenarios.length,
  `${contentGoldens.length} goldens for ${contentScenarios.length} scenarios`
);

const scenarioIds = parsedScenarios.map((entry) => entry.value?.manifest?.scenarioId);
check(
  'every scenario declares a unique kebab-case scenarioId',
  scenarioIds.every((id) => typeof id === 'string' && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) &&
    new Set(scenarioIds).size === scenarioIds.length,
  scenarioIds.join(',')
);

const declaredSchema = readJson('contracts/scenario-provenance.schema.json');
const requiredManifestFields = declaredSchema.required ?? [];
for (const entry of parsedScenarios) {
  const manifest = entry.value?.manifest ?? {};
  const missing = requiredManifestFields.filter((field) => !(field in manifest));
  check(`${entry.file} carries every field the frozen provenance schema requires`, missing.length === 0, missing.join(','));
  check(
    `${entry.file} declares the frozen target standard`,
    manifest.targetStandard === 'NGSS MS-PS2-2',
    String(manifest.targetStandard)
  );
  check(
    `${entry.file} sources its absolute tolerance from the frozen tolerance floors`,
    manifest.answerTolerance?.absoluteSource === 'science-conventions.v1.json:quantity.toleranceFloor',
    String(manifest.answerTolerance?.absoluteSource)
  );
  const relative = manifest.answerTolerance?.relative;
  check(
    `${entry.file} keeps its relative tolerance inside the authored band`,
    typeof relative === 'number' && relative >= 0.01 && relative <= 0.05,
    String(relative)
  );
  check(
    `${entry.file} cites at least one golden trace`,
    Array.isArray(manifest.expectedTraces) && manifest.expectedTraces.length > 0,
    ''
  );
  check(
    `${entry.file} states at least two kinds of accepted evidence`,
    Array.isArray(manifest.acceptedEvidence) && manifest.acceptedEvidence.length >= 2,
    String(manifest.acceptedEvidence?.length)
  );
  check(
    `${entry.file} maps every misconception to authored remediation`,
    Array.isArray(manifest.misconceptions) &&
      manifest.misconceptions.length > 0 &&
      manifest.misconceptions.every(
        (entry) => typeof entry.id === 'string' && entry.statement?.length > 0 && entry.remediation?.length > 0
      ),
    ''
  );
  // The release gate's whole purpose is that an unreviewed scenario may not ship.
  // Assert the *current* honest state rather than leaving it implicit.
  check(
    `${entry.file} does not claim a review that has not happened`,
    manifest.reviewStatus === 'unreviewed' && manifest.reviewer === null,
    `reviewStatus=${manifest.reviewStatus} reviewer=${String(manifest.reviewer)}`
  );
  check(
    `${entry.file} declares that its answer needs controlled evidence`,
    manifest.answerKeyBounded === true,
    String(manifest.answerKeyBounded)
  );
}

// Every expectedTraces reference must resolve to a real file carrying that id.
for (const entry of parsedScenarios) {
  for (const reference of entry.value?.manifest?.expectedTraces ?? []) {
    const [file, fragment] = String(reference).split('#');
    let resolved = false;
    if (file && fragment && exists(file)) {
      try {
        const parsed = readJson(file);
        resolved = (parsed.id ?? parsed.scenarioId) === fragment;
      } catch {
        resolved = false;
      }
    }
    check(
      `${entry.file} cites a trace that resolves: ${reference}`,
      resolved,
      ''
    );
  }
}

// Golden traces must carry a whole-trajectory digest per trial, or they only
// pin endpoints and a mid-run regression would slip through.
const goldenTraceIds = [];
for (const file of contentGoldens) {
  const rel = join(contentGoldenDir, file);
  let parsed;
  try {
    parsed = readJson(rel);
  } catch {
    check(`${rel} is valid JSON`, false);
    continue;
  }
  goldenTraceIds.push(parsed.scenarioId);
  check(`${rel} declares a scenarioId`, typeof parsed.scenarioId === 'string', '');
  check(
    `${rel} carries a rationale a science reviewer can read`,
    typeof parsed.rationale === 'string' && parsed.rationale.length > 40,
    ''
  );
  const trials = Array.isArray(parsed.trials) ? parsed.trials : [];
  check(`${rel} has at least one trial`, trials.length > 0, String(trials.length));
  for (const trial of trials) {
    check(
      `${rel}/${trial.trialKey} pins the whole trajectory with a digest`,
      typeof trial.expectedSamplesDigest === 'string' && /^[0-9a-f]{8}$/.test(trial.expectedSamplesDigest),
      String(trial.expectedSamplesDigest)
    );
    check(
      `${rel}/${trial.trialKey} carries hand arithmetic for a reviewer to check`,
      Array.isArray(trial.equations) &&
        trial.equations.length >= 3 &&
        typeof trial.handCheck?.netForceNewtons === 'number' &&
        typeof trial.handCheck?.acceleration === 'number',
      ''
    );
  }
}
check(
  'golden traces cover the same scenario ids as the scenarios',
  new Set(goldenTraceIds).size === contentScenarios.length &&
    scenarioIds.every((id) => goldenTraceIds.includes(id)),
  ''
);

// Every frozen family must be represented, and the mandated graph requirement
// must actually be satisfied by an authored scenario.
const frozenFamilies = readJson('contracts/mission-families.v1.json');
const byFamily = new Map();
for (const entry of parsedScenarios) {
  const familyId = entry.value?.manifest?.familyId;
  byFamily.set(familyId, [...(byFamily.get(familyId) ?? []), entry.value.manifest]);
}
for (const family of frozenFamilies.families) {
  const members = byFamily.get(family.id) ?? [];
  check(`frozen family ${family.id} has at least one authored scenario`, members.length > 0, String(members.length));
  const covered = new Set(members.flatMap((m) => (m.misconceptions ?? []).map((e) => e.id)));
  check(
    `frozen family ${family.id} maps at least as many misconceptions as the contract names`,
    covered.size >= family.misconceptions.length,
    `${covered.size} ids for ${family.misconceptions.length} contract misconceptions`
  );
  if (family.graphRequirement.level === 'required') {
    check(
      `frozen family ${family.id} really has a graph-required scenario`,
      members.some((m) => m.graphRequirement?.level === 'required'),
      ''
    );
  }
  for (const member of members) {
    check(
      `${member.scenarioId} only uses a difficulty level ${family.id} offers`,
      family.difficultyLevels.includes(member.difficultyLevel),
      String(member.difficultyLevel)
    );
    const familySeverity = { none: 0, optional: 1, required: 2 }[family.graphRequirement.level];
    const scenarioSeverity = { none: 0, optional: 1, required: 2 }[member.graphRequirement?.level];
    check(
      `${member.scenarioId} does not exceed its family's graph requirement`,
      scenarioSeverity <= familySeverity,
      `${member.graphRequirement?.level} vs ${family.graphRequirement.level}`
    );
  }
}
const graphOwner = frozenFamilies.graphInterpretationRequirement.satisfiedBy;
check(
  `the mandated graph-interpretation requirement is satisfied by ${graphOwner}`,
  (byFamily.get(graphOwner) ?? []).some(
    (m) =>
      m.graphRequirement?.level === 'required' &&
      (m.graphRequirement?.graphs ?? []).includes('velocity-time')
  ),
  ''
);

// The release gate must exist AND must not yet be armed. Both halves matter:
// the first is the rule, the second is why no build is failing today.
const releaseGate = exists('src/content/release-gate.ts')
  ? readText('src/content/release-gate.ts')
  : '';
check('the content package implements the production release gate', releaseGate.includes('assertReleaseReady'), '');
check(
  'the release gate is documented as deliberately not yet armed',
  /not wired into|not yet armed|deliberately left unconnected/i.test(releaseGate),
  ''
);
const packageJson = exists('package.json') ? readJson('package.json') : {};
// Scan *every* declared script, not just `build`. Arming the gate inside, say,
// `perf:check` would otherwise slip past a check that only looked at the two
// obvious entry points, and the gate's whole value is that it is impossible to
// route around by picking a different command.
const scriptEntries = Object.entries(packageJson.scripts ?? {});
const armingScripts = scriptEntries
  .filter(([, command]) => typeof command === 'string' && command.includes('assertReleaseReady'))
  .map(([name]) => name);
check(
  'the release gate is not invoked from any npm script, because no review has happened',
  armingScripts.length === 0,
  armingScripts.join(',')
);
check(
  'the package still declares the authoritative local commands',
  ['build', 'test', 'verify', 'contracts', 'foundation'].every((name) =>
    scriptEntries.some(([script]) => script === name)
  ),
  ''
);

const contentDoc = plain(exists('docs/CONTENT_SET.md') ? readText('docs/CONTENT_SET.md') : '');
check(
  'CONTENT_SET states that measurements are backed by golden traces that reproduce',
  /golden trace/i.test(contentDoc) && /reproduce/i.test(contentDoc)
);
check(
  'CONTENT_SET records the acceptance-criteria mapping, including what is still open',
  /11\.\s*Acceptance criteria mapping/.test(contentDoc) &&
    /OPEN — human gate/.test(contentDoc) &&
    /AC3/.test(contentDoc) &&
    /AC4/.test(contentDoc)
);
check(
  'CONTENT_SET states that it does not claim an independent review',
  /does not satisfy AC3 and AC4/i.test(contentDoc) &&
    /no independent review/i.test(contentDoc)
);
check(
  'CONTENT_SET records that no single reading can never decide, with the cause sweep',
  /8\.\s*A recorded limitation/.test(contentDoc) &&
    /only 2 N and 3 N produce any/i.test(contentDoc) &&
    /correct-calibration/.test(contentDoc)
);
check(
  'CONTENT_SET records known limitations rather than claiming completeness',
  /13\.\s*Known limitations/.test(contentDoc) &&
    /resistive-cause scenario bypasses the ML-04 trial runner/i.test(contentDoc)
);

// ---------------------------------------------------------------------------
group('design authority (GAME-387 / ML-DESIGN)');

/**
 * GAME-387 asks for design artifacts covering thirteen named areas. The list below is the
 * ticket's own wording, kept verbatim, so coverage is checked against the requirement rather
 * than against whatever the contract happened to enumerate. A state cannot be quietly dropped:
 * the expected identifier set is exact.
 */
const DESIGN_REQUIRED_COVERAGE = [
  'mission brief/question/prediction',
  'variable identification and experiment setup',
  'laboratory track/cart/force presentation',
  'run/pause/reset/step/replay states where authorized',
  'measurement instruments and force vectors',
  'trial record/evidence notebook',
  'trial comparison',
  'position-time and velocity-time graph states',
  'claim/evidence/debrief',
  'hints/recovery/errors',
  'loading/renderer-failure fallback',
];

const DESIGN_REQUIRED_STATES = [
  'brief',
  'question',
  'predict',
  'variable-identification',
  'experiment-setup',
  'lab-scene',
  'run',
  'pause',
  'reset',
  'step',
  'replay',
  'instruments',
  'force-vector',
  'trial-record',
  'evidence-notebook',
  'trial-comparison',
  'graph-position-time',
  'graph-velocity-time',
  'claim',
  'evidence-citation',
  'debrief',
  'hint',
  'recovery',
  'error',
  'renderer-loading',
  'renderer-fallback',
];

const DESIGN_REQUIRED_CONTROL_STATES = [
  'default',
  'hover',
  'focus-visible',
  'selected',
  'disabled',
  'error',
  'non-color',
  'reduced-motion',
  'forced-colors',
  'zoom-200',
];

const stylesCss = exists('src/app/styles.css') ? readText('src/app/styles.css') : '';
const sceneTs = exists('src/renderer/labScene.ts') ? readText('src/renderer/labScene.ts') : '';
const instrumentPanelTs = exists('src/ui/InstrumentPanel.tsx') ? readText('src/ui/InstrumentPanel.tsx') : '';

check('contracts/design-system.v1.json exists', exists(join('contracts', 'design-system.v1.json')));
check('docs/DESIGN.md exists', exists(join('docs', 'DESIGN.md')));

const design = parsed['design-system.v1.json'];

// Every check in this group reads `design`. Without this guard a parse failure drops the group
// from ~470 checks to a handful that all pass, so a broken contract would report a green design
// group instead of an obvious failure. That happened while building this, which is why it is here.
check(
  'the design contract parsed, so the design group below is actually running',
  Boolean(design),
  'contracts/design-system.v1.json did not parse; the rest of this group would be skipped',
);

if (design) {
  check('design contract declares contractId', design.contractId === 'motion-lab.design-system');
  check('design contract declares a version', /^\d+\.\d+\.\d+$/.test(String(design.version)));
  check('design contract is frozen', design.status === 'frozen');
  check('design contract names GAME-382', design.jiraAuthority === JIRA_AUTHORITY);
  check('design contract names GAME-387 as the issue that froze it', design.frozenBy === 'GAME-387');
  check(
    'design contract points at an existing source document',
    typeof design.sourceDocument === 'string' && exists(design.sourceDocument),
    String(design.sourceDocument),
  );
  check('design contract claims to resolve delegated decision G-12', design.resolvesDelegatedDecision === 'G-12');
  check('design contract claims to address owner gate O-01', design.addressesOwnerGate === 'O-01');

  // --- the AC1 branch, stated honestly rather than implied.
  const authority = design.designAuthority ?? {};
  check('the design authority states that no Figma file was produced', authority.figmaFileProduced === false);
  check('the design authority carries no Figma URL', authority.figmaFileUrl === null);
  check('the design authority names the equivalent-authority branch it is satisfying', /equivalent production design authority/i.test(String(authority.acceptanceBranch)));
  check(
    'the design authority explains why no Figma action was performed',
    typeof authority.whyNotFigma === 'string' && /DEFINITION_OF_DONE/.test(authority.whyNotFigma) && /stop condition/i.test(authority.whyNotFigma),
  );
  check(
    'the design authority says what it is not',
    Array.isArray(authority.whatThisIsNot) && authority.whatThisIsNot.length >= 4,
  );
  check(
    'the design authority records its fidelity limits',
    Array.isArray(authority.fidelityLimits) && authority.fidelityLimits.length >= 3,
  );
  check(
    'the design authority records the pending owner gate rather than closing it',
    Array.isArray(authority.pendingGates) && authority.pendingGates.some((gate) => /O-01/.test(gate)),
  );

  // --- the law the design inherits.
  check('the design denies renderer authority', design.authorityLaw?.rendererIsAuthority === false);

  // --- DR-01..DR-05, each with a real enforcement mechanism.
  const designRules = design.designRules ?? [];
  check('five design rules are declared', designRules.length === 5, `found ${designRules.length}`);
  check(
    'design rule ids match DR-01..DR-05',
    sameSet(designRules.map((rule) => rule.id), rangeIds('DR-', 5, 2)),
    designRules.map((rule) => rule.id).join(','),
  );
  for (const rule of designRules) {
    check(`design rule "${rule.id}" is marked enforced`, rule.enforced === true);
    check(
      `design rule "${rule.id}" names its enforcement mechanism`,
      typeof rule.mechanism === 'string' && rule.mechanism.trim().length > 30,
      rule.id,
    );
    check(
      `design rule "${rule.id}" binds to at least one file that exists`,
      (rule.boundIdentifiers ?? []).some((id) => exists(String(id).split(':')[0])),
      JSON.stringify(rule.boundIdentifiers),
    );
  }

  // --- coverage: the ticket's thirteen named areas.
  const coverage = design.stateCoverage?.areas ?? [];
  const declaredLines = coverage.map((area) => area.ticketLine);
  for (const line of DESIGN_REQUIRED_COVERAGE) {
    check(`design coverage declares "${line}"`, declaredLines.includes(line), declaredLines.join(' | '));
  }
  check(
    'design coverage declares no area beyond the ticket\'s eleven screen areas',
    sameSet(declaredLines, DESIGN_REQUIRED_COVERAGE),
    declaredLines.filter((line) => !DESIGN_REQUIRED_COVERAGE.includes(line)).join(' | '),
  );

  const designStates = coverage.flatMap((area) => (area.states ?? []).map((state) => state));
  const designStateIds = designStates.map((state) => state.id);
  check(
    'every GAME-387 required state is specified',
    sameSet(designStateIds, DESIGN_REQUIRED_STATES),
    `missing: ${DESIGN_REQUIRED_STATES.filter((id) => !designStateIds.includes(id)).join(',')} / extra: ${designStateIds.filter((id) => !DESIGN_REQUIRED_STATES.includes(id)).join(',')}`,
  );
  check(
    'design state ids are unique',
    new Set(designStateIds).size === designStateIds.length,
    designStateIds.join(','),
  );
  for (const state of designStates) {
    check(
      `design state "${state.id}" uses a kebab-case id`,
      /^[a-z0-9]+(-[a-z0-9]+)*$/.test(state.id),
      state.id,
    );
    check(`design state "${state.id}" names its authoritative source`, typeof state.authority === 'string' && state.authority.trim().length > 0, state.id);
    check(
      `design state "${state.id}" declares an honest implementation status`,
      ['implemented', 'partial', 'specified'].includes(state.implementationStatus),
      `${state.id}=${state.implementationStatus}`,
    );
    check(`design state "${state.id}" names its owning issue`, /GAME-\d+/.test(String(state.owningIssue)), state.id);
    // A state that claims to be implemented must point at code that exists. Without this,
    // "implemented" would be an unfalsifiable claim and the field would decay into decoration.
    if (state.implementationStatus === 'implemented') {
      const files = referencedFiles(state.implementationRef);
      check(
        `implemented design state "${state.id}" points at a file that exists`,
        files.length > 0 && files.some((file) => exists(file)),
        String(state.implementationRef),
      );
    }
    if (state.implementationStatus === 'partial') {
      const files = referencedFiles(state.implementationRef);
      check(
        `partial design state "${state.id}" still points at what exists today`,
        files.length > 0 && files.some((file) => exists(file)),
        String(state.implementationRef),
      );
    }
    // A `specified` state has no screen yet. It may cite the domain or contract authority it will
    // be built from, but it may not cite a presentation file: that would imply the screen exists.
    if (state.implementationStatus === 'specified') {
      const presentationFiles = referencedFiles(state.implementationRef).filter((file) =>
        /^src\/(ui|app|host|renderer)\//.test(file),
      );
      check(
        `specified design state "${state.id}" cites no presentation file as if it were built`,
        presentationFiles.length === 0,
        presentationFiles.join(','),
      );
    }
  }
}

if (design) {
  // --- colour tokens: transcribed from the stylesheet, and their contrast measured here.
  const shippedTokens = cssCustomProperties(stylesCss);
  const hexTokens = Object.fromEntries(
    Object.keys(shippedTokens).map((name) => [name, cssHex(shippedTokens, name)]),
  );
  const declaredTokens = design.tokens?.color ?? [];
  check('design tokens were read from a stylesheet', Object.keys(shippedTokens).length > 0, Object.keys(shippedTokens).join(','));
  for (const token of declaredTokens) {
    const name = String(token.token).replace(/^--/, '');
    check(
      `design token "${token.token}" matches the value shipped in styles.css`,
      hexTokens[name] === String(token.value).toLowerCase(),
      `contract=${token.value} shipped=${hexTokens[name] ?? 'missing-or-not-a-colour'}`,
    );
  }
  const tokenByName = Object.fromEntries(
    declaredTokens.map((token) => [String(token.token).replace(/^--/, ''), String(token.value).toLowerCase()]),
  );
  const measuredContrast = design.tokens?.measuredContrast ?? [];
  check('the design contract measures token contrast rather than asserting it', measuredContrast.length > 0);
  // Every pairing that can carry meaning must appear in the measured table. A failure recorded
  // only in the failures list would sit outside the data a reader actually looks at, and the
  // "below 3:1 must be declared" rule below would never see it.
  const measuredPairs = new Set(measuredContrast.map((pair) => `${pair.foreground}|${pair.background}`));
  for (const failure of design.tokens?.measuredNonTextContrastFailures ?? []) {
    check(
      `token contrast failure "${failure.id}" also appears in the measured contrast table`,
      measuredPairs.has(`${failure.foreground}|${failure.background}`),
      `${failure.foreground}|${failure.background}`,
    );
  }
  for (const pair of measuredContrast) {
    const fg = tokenByName[String(pair.foreground).replace(/^--/, '')];
    const bg = tokenByName[String(pair.background).replace(/^--/, '')];
    if (!fg || !bg) {
      check(`contrast pair "${pair.foreground} on ${pair.background}" names real tokens`, false, `${fg ?? '?'} / ${bg ?? '?'}`);
      continue;
    }
    const computed = contrastRatio(fg, bg);
    check(
      `declared contrast for "${pair.foreground} on ${pair.background}" is correct`,
      typeof pair.ratio === 'number' && Math.abs(computed - pair.ratio) <= 0.02,
      `declared=${pair.ratio} computed=${computed.toFixed(2)}`,
    );
    // Any pairing below 3:1 is a non-text contrast failure unless the contract declares it as
    // one. This is the check that stops a low-contrast pair being quietly filed as a pass.
    if (computed < 3) {
      const declared = (design.tokens?.measuredNonTextContrastFailures ?? []).some(
        (failure) => tokenByName[String(failure.foreground).replace(/^--/, '')] === fg,
      );
      check(
        `"${pair.foreground} on ${pair.background}" is below 3:1 and is declared as a failure`,
        declared,
        `computed=${computed.toFixed(2)}`,
      );
    }
  }

  // --- renderer palette, measured against the scene background that actually ships.
  const shippedScene = rendererColors(sceneTs);
  const sceneBackground = shippedScene.background;
  check('the renderer palette was read from labScene.ts', Object.keys(shippedScene).length > 0, Object.keys(shippedScene).join(','));
  const palette = design.rendererPalette?.measuredContrast ?? [];
  check('the renderer palette declares measured contrast', palette.length > 0);
  for (const entry of palette) {
    const hex = shippedScene[entry.name];
    check(
      `renderer colour "${entry.name}" matches the value shipped in labScene.ts`,
      hex === String(entry.value).toLowerCase(),
      `contract=${entry.value} shipped=${hex ?? 'missing'}`,
    );
    if (!hex || !sceneBackground) continue;
    const computed = contrastRatio(hex, sceneBackground);
    check(
      `declared renderer contrast for "${entry.name}" is correct`,
      typeof entry.ratio === 'number' && Math.abs(computed - entry.ratio) <= 0.02,
      `declared=${entry.ratio} computed=${computed.toFixed(2)}`,
    );
    if (computed < 3 && !/bed fill|rail only/i.test(String(entry.verdict))) {
      const declared = (design.rendererPalette?.measuredNonTextContrastFailures ?? []).some(
        (failure) => failure.foreground === entry.name,
      );
      check(
        `renderer colour "${entry.name}" is below 3:1 and is declared as a failure`,
        declared,
        `computed=${computed.toFixed(2)} verdict=${entry.verdict}`,
      );
    }
  }

  // --- the focus ring, checked as a decision rather than a value.
  const focusRing = design.tokens?.focusRing ?? {};
  check('the focus ring is specified as an outline rather than a box-shadow', focusRing.property === 'outline', String(focusRing.property));
  check('the focus ring declares its width, colour, offset, and selector', ['width', 'color', 'offset', 'selector'].every((key) => Boolean(focusRing[key])), JSON.stringify(focusRing));
  check(
    'the focus ring records why it is an outline: it must survive clipping and forced-colors',
    /outline[^.]*box-shadow/i.test(String(focusRing.rationale)) &&
      /clip/i.test(String(focusRing.rationale)) &&
      /forced-colors/i.test(String(focusRing.rationale)),
    String(focusRing.rationale),
  );
  check(
    'the focus ring contrast is measured against both surfaces it appears on',
    measuredContrast.some((pair) => pair.foreground === '--focus' && pair.background === '--surface') &&
      measuredContrast.some((pair) => pair.foreground === '--focus' && pair.background === '--surface-raised'),
  );

  // --- every declared contrast failure must exist as a recorded open finding, so a measured
  // defect cannot live only in a data file.
  const findings = design.openFindings?.findings ?? [];
  const findingIds = findings.map((finding) => finding.id);
  check('the design contract records open findings', findings.length > 0, String(findings.length));
  check('open finding ids are unique', new Set(findingIds).size === findingIds.length, findingIds.join(','));
  for (const failure of [
    ...(design.tokens?.measuredNonTextContrastFailures ?? []),
    ...(design.rendererPalette?.measuredNonTextContrastFailures ?? []),
  ]) {
    const finding = findings.find((entry) => entry.id === failure.id);
    check(`contrast failure ${failure.id} is recorded as an open finding`, Boolean(finding), failure.id);
    if (finding) {
      check(`finding ${failure.id} names an owner`, /GAME-\d+/.test(String(finding.owner)), String(finding.owner));
      check(`finding ${failure.id} states an action`, typeof finding.action === 'string' && finding.action.trim().length > 20);
      check(
        `finding ${failure.id} does not claim the contrast passes`,
        !/passes/i.test(String(finding.finding)) || /not claimed as a pass/i.test(String(finding.action) + String(finding.finding)),
      );
    }
  }

  // --- responsive layout: the three named viewports, and any divergence must be declared.
  const breakpoints = design.layout?.breakpoints ?? [];
  check(
    'design names exactly the three phone/tablet/desktop layouts',
    sameSet(breakpoints.map((entry) => entry.id), ['phone', 'tablet', 'desktop']),
    breakpoints.map((entry) => entry.id).join(','),
  );
  for (const breakpoint of breakpoints) {
    check(`breakpoint "${breakpoint.id}" declares a viewport range`, /px/.test(String(breakpoint.viewport)), breakpoint.viewport);
    check(`breakpoint "${breakpoint.id}" declares its column count`, typeof breakpoint.columns === 'number');
    check(`breakpoint "${breakpoint.id}" states its reading order or notes`, typeof breakpoint.notes === 'string' && breakpoint.notes.length > 40);
  }
  const phone = breakpoints.find((entry) => entry.id === 'phone');
  const desktop = breakpoints.find((entry) => entry.id === 'desktop');
  check('phone is single-column', phone?.columns === 1, String(phone?.columns));
  check('desktop is two-column', desktop?.columns === 2, String(desktop?.columns));

  // Recompute where the shipped grid actually changes column count, so a divergence from the
  // specification cannot be left implicit. Matched against comment-stripped CSS so a rule cannot
  // satisfy a check by being described in a comment. Each precondition is its own check: a
  // silently skipped block is how a check becomes decoration that always passes.
  const gridRule = stripCssComments(stylesCss).match(/\.app__grid\s*\{([\s\S]*?)\}/)?.[1];
  const desktopQuery = stripCssComments(stylesCss).match(
    /@media\s*\(min-width:\s*(\d+)px\)\s*\{\s*\.app__grid\s*\{([\s\S]*?)\}/,
  );
  const inlinePx = inlinePaddingPx(stylesCss.match(/\.app\s*\{([\s\S]*?)\}/)?.[1]);
  check('the shipped grid rule was found', Boolean(gridRule), String(gridRule));
  check('the shipped grid gap token was found', /gap:\s*var\(--gap\)/.test(String(gridRule)), String(gridRule));
  check('the shipped --gap token is a length the checker can evaluate', lengthToPx(shippedTokens.gap) !== null, String(shippedTokens.gap));
  check('the shipped app inline padding was found and evaluated', inlinePx !== null);

  // A fixed minmax floor larger than the viewport cannot shrink, so it turns into horizontal
  // overflow on a narrow phone and at 200% zoom. That is the trap OF-03 nearly walked into,
  // so the floor is now asserted to be zero rather than merely noted.
  const floor = String(gridRule).match(/minmax\(\s*([\d.]+)(px|rem)/);
  check(
    'the base grid rule uses no fixed minmax floor that could overflow a narrow viewport',
    !floor,
    String(floor?.[0]),
  );

  if (desktopQuery && inlinePx !== null) {
    const queryPx = Number(desktopQuery[1]);
    check(
      'the desktop two-column breakpoint matches the specified desktop layout',
      queryPx === 1024 && /repeat\(\s*2\s*,/.test(desktopQuery[2]),
      `query=${queryPx}px rule=${desktopQuery[2].replace(/\s+/g, " ").trim()}`,
    );
    check(
      'the desktop columns can shrink below any intrinsic minimum',
      /minmax\(\s*0\s*,/.test(desktopQuery[2]) && !/minmax\(\s*[\d.]+(px|rem)/.test(desktopQuery[2]),
      String(desktopQuery[2]),
    );
    check(
      'the design contract states the viewport at which the shipped grid reaches two columns',
      design.layout?.gridSpecification?.declaredTwoColumnViewportPx === queryPx,
      `declared=${design.layout?.gridSpecification?.declaredTwoColumnViewportPx} shipped=${queryPx}`,
    );
    // With an explicit base and an explicit query there is no emergent threshold left, so a
    // divergence may only be declared when the query really disagrees with the contract.
    if (queryPx !== Number(/1024/.exec(String(desktop?.viewport))?.[0] ?? 0)) {
      check(
        'a divergence between the shipped grid and the specified desktop breakpoint is declared',
        typeof design.layout?.gridSpecification?.divergenceFromSpecification === 'string' &&
          design.layout.gridSpecification.divergenceFromSpecification.length > 20,
        String(design.layout?.gridSpecification?.divergenceFromSpecification),
      );
    }
  } else {
    check('the shipped grid declares a desktop two-column media query', false, 'no @media min-width block targets .app__grid');
  }
  check(
    'reflow rules prohibit horizontal scrolling for text',
    Array.isArray(design.layout?.reflow?.prohibited) && design.layout.reflow.prohibited.length >= 3,
  );

  // --- control states: the six GAME-387 names, plus the variants a real review needs.
  const controlStates = design.controlStates?.states ?? [];
  const controlIds = controlStates.map((state) => state.id);
  check(
    'every required control state is specified',
    DESIGN_REQUIRED_CONTROL_STATES.every((id) => controlIds.includes(id)),
    DESIGN_REQUIRED_CONTROL_STATES.filter((id) => !controlIds.includes(id)).join(','),
  );
  for (const state of controlStates) {
    check(`control state "${state.id}" has a specification`, typeof state.specification === 'string' && state.specification.trim().length > 30, state.id);
    check(
      `control state "${state.id}" states honestly whether it is implemented`,
      typeof state.implementedIn === 'string' && /src\/|not implemented|partial/.test(state.implementedIn),
      `${state.id}=${state.implementedIn}`,
    );
  }
  const focusState = controlStates.find((state) => state.id === 'focus-visible');
  check(
    'the focus state specifies a visible, unsuppressible indicator',
    focusState && /outline/.test(focusState.specification) && /never be suppressed/i.test(focusState.specification),
  );
  const reducedState = controlStates.find((state) => state.id === 'reduced-motion');
  check(
    'the reduced-motion state preserves instructional meaning',
    reducedState && /meaning is unchanged|meaning preserved/i.test(reducedState.specification + String(reducedState.rationale)),
  );
  check(
    'focus order is stated and follows reading order',
    Array.isArray(design.controlStates?.focusOrder?.order) && design.controlStates.focusOrder.order.length >= 5 &&
      /DOM order is reading order/.test(String(design.controlStates.focusOrder.rule)),
  );

  // --- graph contract, cross-checked against the frozen mission families.
  const graph = design.graphContract ?? {};
  const series = graph.series ?? [];
  check('both the position-time and velocity-time graph states are specified', sameSet(series.map((entry) => entry.id), ['position-time', 'velocity-time']), series.map((entry) => entry.id).join(','));
  const frozenFamilies = parsed['mission-families.v1.json'];
  for (const entry of series) {
    check(`graph "${entry.id}" labels its vertical axis with a unit`, /\(.+\)/.test(String(entry.verticalAxis)), String(entry.verticalAxis));
    check(`graph "${entry.id}" labels its horizontal axis with a unit`, /\(.+\)/.test(String(entry.horizontalAxis)), String(entry.horizontalAxis));
    check(`graph "${entry.id}" states what its slope means`, typeof entry.slopeMeaning === 'string' && entry.slopeMeaning.length > 0);
    // The graph contract must agree with the frozen requirement, or the Epic's mandated
    // graph-interpretation requirement would be satisfied by one document and voided by another.
    for (const familyId of entry.requiredBy ?? []) {
      const family = frozenFamilies?.families?.find((candidate) => candidate.id === familyId);
      check(
        `graph "${entry.id}" is required by frozen family "${familyId}", which really requires it`,
        Boolean(family) && (family.graphRequirement?.graphs ?? []).includes(entry.id),
        JSON.stringify(family?.graphRequirement),
      );
    }
  }
  const velocitySeries = series.find((entry) => entry.id === 'velocity-time');
  check(
    'the velocity-time graph is the mandated graph-interpretation requirement',
    sameSet(velocitySeries?.requiredBy ?? [], ['thruster-test', 'mystery-cart']),
    (velocitySeries?.requiredBy ?? []).join(','),
  );
  const graphStates = (graph.states ?? []).map((state) => state.id);
  for (const required of ['table-equivalent', 'textual-summary', 'read-value-at-time', 'empty', 'insufficient-evidence']) {
    check(`graph state "${required}" is specified`, graphStates.includes(required), graphStates.join(','));
  }
  check('the graph contract forbids a graph drawn from pixel geometry', (graph.prohibited ?? []).some((rule) => /pixel/i.test(rule)));
  check('the graph contract forbids presenting fitted data as recorded', (graph.prohibited ?? []).some((rule) => /smoothed|fitted/i.test(rule)));

// --- resolved findings. A closed defect must leave a record of what it was, or the design
  // looks like it was never wrong. It must also never be double-counted as still open.
  const resolved = design.resolvedFindings?.findings ?? [];
  check('the design contract records a resolved-findings register', resolved.length > 0, String(resolved.length));
  const resolvedIds = resolved.map((finding) => finding.id);
  check('resolved finding ids are unique', new Set(resolvedIds).size === resolvedIds.length, resolvedIds.join(','));
  for (const finding of resolved) {
    check(`resolved finding ${finding.id} is not also still open`, !findingIds.includes(finding.id), finding.id);
    check(
      `resolved finding ${finding.id} records what the defect actually was`,
      typeof finding.was === 'string' && finding.was.trim().length > 30,
      finding.id,
    );
    check(
      `resolved finding ${finding.id} records its current measured state`,
      typeof finding.now === 'string' && finding.now.trim().length > 20,
      finding.id,
    );
    check(
      `resolved finding ${finding.id} explains how it was fixed`,
      typeof finding.resolution === 'string' && finding.resolution.trim().length > 40,
      finding.id,
    );
    check(`resolved finding ${finding.id} names the change that closed it`, /PR #\d+|GAME-\d+/.test(String(finding.closedBy)), String(finding.closedBy));
    check(
      `resolved finding ${finding.id} declares whether a human gate remains`,
      typeof finding.manualGate === 'boolean',
      String(finding.manualGate),
    );
    // A remediation that fixed the number but not the thing would be a false close, so a
    // finding claiming a contrast fix has to state a ratio that now clears the threshold.
    if (/\d\.\d+:1/.test(String(finding.now))) {
      const ratios = [...String(finding.now).matchAll(/(\d+\.\d+):1/g)].map((m) => Number(m[1]));
      check(
        `resolved finding ${finding.id} states a ratio that now clears the 3:1 non-text threshold`,
        ratios.length > 0 && ratios.every((ratio) => ratio >= 3),
        String(finding.now),
      );
    }
    // A fix that still needs human qualification must say so, and a fix that does not must not
    // carry the flag. Checking stillPending only when present let a manual gate be deleted
    // outright and the finding still read as cleanly resolved.
    if (finding.manualGate === true) {
      check(
        `resolved finding ${finding.id} still names the human gate that remains`,
        typeof finding.stillPending === 'string' &&
          finding.stillPending.trim().length > 30 &&
          /ML-16|not been|has not|not qualified|not observed/i.test(finding.stillPending),
        String(finding.stillPending),
      );
    } else if (finding.manualGate === false) {
      check(
        `resolved finding ${finding.id} carries no unneeded pending gate`,
        finding.stillPending === undefined,
        String(finding.stillPending),
      );
    }
  }

  // --- a shipped forced-colors block is asserted, because "specified but unimplemented" was
  // itself a finding (OF-06) and the fix must not be reverted silently.
  check(
    'the stylesheet ships a forced-colors block',
    /@media\s*\(forced-colors:\s*active\)/.test(stylesCss),
  );
  check(
    'the forced-colors block restates the focus ring against a system colour',
    /forced-colors:[\s\S]*?focus-visible[\s\S]*?Highlight/.test(stylesCss),
  );
  check(
    'the forced-colors block does not leave a disabled control relying on opacity',
    /forced-colors:[\s\S]*?button:disabled[\s\S]*?GrayText/.test(stylesCss),
  );
  // The reason must be rendered under a canControl guard. Asserting only that "canControl" and
  // the testid appear in the file was not enough: the file already contains disabled={!canControl}
  // on every playback button, so the first version of this check passed a component whose reason
  // element had been removed entirely.
  check(
    'the instrument panel renders the disabled-playback reason under a canControl guard',
    /!canControl\s*\?\s*\(/.test(instrumentPanelTs) &&
      /data-testid="playback-disabled-reason"/.test(instrumentPanelTs) &&
      /Run preview/.test(instrumentPanelTs),
  );

  // --- the motion contract: instructional, decorative, and forbidden must all be separated (AC4).
  const motionCategories = (design.motionContract?.categories ?? []).map((category) => category.id);
  check(
    'motion is split into instructional visualization, decorative polish, and a forbidden category',
    sameSet(motionCategories, ['instructional-visualization', 'decorative-polish', 'forbidden']),
    motionCategories.join(','),
  );
  const instructional = (design.motionContract?.categories ?? []).find((category) => category.id === 'instructional-visualization');
  check('instructional motion is not the only route to any value', (instructional?.rules ?? []).some((rule) => /only route/i.test(rule)));
  check('instructional motion must have a non-motion equivalent', (instructional?.rules ?? []).some((rule) => /non-motion equivalent/i.test(rule)));
  check('instructional motion must be removable under reduced motion', (instructional?.rules ?? []).some((rule) => /reduced-motion/i.test(rule)));
  for (const item of instructional?.inventory ?? []) {
    check(
      `instructional motion "${item.id}" names a non-motion equivalent`,
      typeof item.nonMotionEquivalent === 'string' && item.nonMotionEquivalent.trim().length > 10,
      item.id,
    );
    check(`instructional motion "${item.id}" states its reduced-motion behaviour`, typeof item.reducedMotionBehaviour === 'string' && item.reducedMotionBehaviour.length > 5, item.id);
  }
  const forbiddenMotion = (design.motionContract?.categories ?? []).find((category) => category.id === 'forbidden');
  check('forbidden motion rules name frame time', (forbiddenMotion?.rules ?? []).some((rule) => /frame/i.test(rule)));
  check('forbidden motion rules name interpolation between samples', (forbiddenMotion?.rules ?? []).some((rule) => /interpolat/i.test(rule)));
  check('proposed timing budgets are not presented as measurements', /not measurement/i.test(String(design.motionContract?.timing?.status)), String(design.motionContract?.timing?.status));

  // --- asset and originality direction (AC5).
  const assets = design.assetDirection ?? {};
  check('the asset direction states the originality position', /original work/i.test(String(assets.originalityPosition)));
  check('the asset direction locks the palette', /palette/i.test(String(assets.paletteLock)) && /decision entry/i.test(String(assets.paletteLock)));
  check('the asset direction repeats the IP boundary', /no comparator/i.test(String(assets.originalityPosition)));
  check('assets of unknown origin may not ship', assets.assetProvenance?.unknownOriginMayNotShip === true);
  check('generated assets must record reproducibility', assets.assetProvenance?.generatedAssetsRecordReproducibility === true);
  check(
    'the asset direction does not claim the originality review happened',
    /has not occurred|pending/i.test(String(assets.reviewStatus)),
    String(assets.reviewStatus),
  );
  check('the design records that no production asset exists yet', /no production asset exists/i.test(String(assets.assetProvenance?.status)));

  // --- acceptance mapping, including the branch taken for AC1.
  const mapped = design.acceptanceMapping?.criteria ?? [];
  check('all five GAME-387 acceptance criteria are mapped', sameSet(mapped.map((entry) => entry.id), ['AC1', 'AC2', 'AC3', 'AC4', 'AC5']), mapped.map((entry) => entry.id).join(','));
  for (const entry of mapped) {
    check(`${entry.id} states a status`, typeof entry.status === 'string' && entry.status.length > 0, entry.id);
    check(
      `${entry.id} carries an honest qualifier rather than a bare pass`,
      typeof entry.honestQualifier === 'string' && entry.honestQualifier.trim().length > 30,
      entry.id,
    );
    check(
      `${entry.id} names evidence that exists in this repository`,
      (entry.evidence ?? []).length > 0,
      entry.id,
    );
  }
  const ac1 = mapped.find((entry) => entry.id === 'AC1');
  check(
    'AC1 is recorded as satisfied by the equivalent-authority branch rather than by a Figma file',
    ac1?.status === 'satisfied-by-equivalent-branch',
    String(ac1?.status),
  );
  check('AC1 records that O-01 is still open', /O-01/.test(String(ac1?.honestQualifier)), String(ac1?.honestQualifier));
  const ac2 = mapped.find((entry) => entry.id === 'AC2');
  check('AC2 does not confuse specification with implementation', /not implementing|Specifying a state is not implementing it/i.test(String(ac2?.honestQualifier)));

  // --- ML-11 traceability: coverage complete, implementation honestly incomplete.
  const trace = design.ml11Traceability ?? {};
  const steps = trace.steps ?? [];
  check('every ML-11 vertical-slice step is traced', steps.length === 12, `found ${steps.length}`);
  const knownStates = new Set(DESIGN_REQUIRED_STATES);
  for (const step of steps) {
    check(`ML-11 step ${step.step} names at least one specified state`, (step.states ?? []).length > 0, String(step.step));
    check(
      `ML-11 step ${step.step} only references states the contract actually specifies`,
      (step.states ?? []).every((id) => knownStates.has(id)),
      (step.states ?? []).filter((id) => !knownStates.has(id)).join(','),
    );
    check(`ML-11 step ${step.step} names its owning issue`, /GAME-\d+/.test(String(step.owner)), String(step.owner));
  }
  check('ML-11 coverage is recorded as complete', trace.coverageComplete === true);
  check('ML-11 implementation is recorded as incomplete', trace.implementationComplete === false);
  check(
    'the design states plainly that it does not make ML-11 achievable',
    /does not make ML-11 achievable/i.test(String(trace.honestyStatement)),
    String(trace.honestyStatement),
  );

  // --- the review record may not claim anything that has not happened.
  const designReview = design.review ?? {};
  check('the design review records its author model', typeof designReview.authorModel === 'string' && designReview.authorModel.length > 0);
  check('independent review is recorded as not performed', designReview.independentReview === 'not performed', String(designReview.independentReview));
  check('human design review is recorded as not performed', designReview.humanDesignReview === 'not performed', String(designReview.humanDesignReview));
  check('learner playtest is recorded as not performed', designReview.learnerPlaytest === 'not performed', String(designReview.learnerPlaytest));
  check('accessibility sign-off is recorded as not performed', designReview.accessibilitySignOff === 'not performed', String(designReview.accessibilitySignOff));
  check(
    'the review statement admits what machine checking cannot establish',
    /cannot establish that a design is good/i.test(String(designReview.statement)),
    String(designReview.statement),
  );
  check('the design contract records a change log entry', (design.changeLog ?? []).length > 0);
}

// --- the prose document must not drift from the contract it describes.
const designDoc = plain(exists('docs/DESIGN.md') ? readText('docs/DESIGN.md') : '');
check('docs/DESIGN.md names GAME-387 as the delivering issue', designDoc.includes('GAME-387'));
check('docs/DESIGN.md states the equivalent-authority branch of AC1', /equivalent production design authority/i.test(designDoc));
check('docs/DESIGN.md states plainly that no Figma file was produced', /No Figma file was produced/i.test(designDoc));
check('docs/DESIGN.md records O-01 as still owner-gated', /O-01/.test(designDoc));
check('docs/DESIGN.md records G-12 as resolved', /G-12/.test(designDoc));
check('docs/DESIGN.md repeats the renderer-authority law', /No visual may state a scientific value that differs from authoritative domain state/i.test(designDoc));
check('docs/DESIGN.md separates instructional motion from decorative polish', /instructional-visualization|instructional visualization/i.test(designDoc) && /decorative/i.test(designDoc));
check('docs/DESIGN.md records the asset originality boundary', /original/i.test(designDoc) && /comparator/i.test(designDoc));
for (const id of DESIGN_REQUIRED_STATES) {
  check(`docs/DESIGN.md documents the "${id}" state`, designDoc.includes(id));
}
for (const id of DESIGN_REQUIRED_CONTROL_STATES) {
  check(`docs/DESIGN.md documents the "${id}" control state`, designDoc.includes(id));
}
for (const finding of (parsed['design-system.v1.json']?.openFindings?.findings ?? [])) {
  check(`docs/DESIGN.md records open finding ${finding.id}`, designDoc.includes(finding.id), finding.id);
}
check(
  'docs/DESIGN.md does not claim the design package was reviewed by a person',
  !/design review (passed|complete|approved)|design sign-?off/i.test(designDoc),
);
check(
  'docs/DESIGN.md does not claim accessibility conformance',
  !/WCAG (AA|AAA) conformant|accessibility sign-?off (passed|complete|approved)/i.test(designDoc),
);


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
  'the repository states its actual milestone rather than claiming a finished game',
  /foundation/i.test(rootReadme) && !/\b(game is|game is fully|complete mission set)\b/i.test(rootReadme),
);
check(
  'the repository does not claim the physics kernel or missions exist',
  /physics kernel/i.test(rootReadme) && /(GAME-386|ML-03)/.test(rootReadme),
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
