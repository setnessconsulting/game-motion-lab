#!/usr/bin/env node
/**
 * Motion Lab foundation consistency checker (GAME-384 / ML-02).
 *
 * Dependency-free. Asserts the executable foundation invariants that the ML-02
 * acceptance criteria name and that scripts/verify-contracts.mjs does not cover:
 * the frozen stack pins, the package boundaries existing as real directories, the
 * required commands existing, the CI workflow being present, and the repository
 * claiming no learner-runtime network or analytics path.
 *
 * Scope note: this checks repository structure and declared commands. It does not run
 * the game and makes no claim about behaviour that was not executed.
 *
 * Usage:  node scripts/verify-foundation.mjs
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const failures = [];
let passed = 0;

function check(description, condition, detail = "") {
  if (condition) {
    passed += 1;
    return true;
  }
  failures.push({ description, detail });
  return false;
}

function readJson(relPath) {
  return JSON.parse(readFileSync(join(ROOT, relPath), "utf8"));
}

function exists(relPath) {
  return existsSync(join(ROOT, relPath));
}

// ---------------------------------------------------------------------------
const pkg = exists("package.json") ? readJson("package.json") : null;
check("package.json exists", pkg !== null);

if (pkg) {
  check("package is private (it is not published to a registry)", pkg.private === true);
  check("the supported Node major is pinned", pkg.engines?.node === "24.x", String(pkg.engines?.node));
  check(".nvmrc exists", exists(".nvmrc"));

  check(
    "Phaser is pinned to the frozen version 4.2.1 (ADR 0006)",
    pkg.dependencies?.phaser === "4.2.1",
    String(pkg.dependencies?.phaser)
  );
  check(
    "React is the frozen major (19)",
    typeof pkg.dependencies?.react === "string" && pkg.dependencies.react.startsWith("19"),
    String(pkg.dependencies?.react)
  );
  check(
    "React DOM matches React's major",
    typeof pkg.dependencies?.["react-dom"] === "string" &&
      pkg.dependencies["react-dom"].startsWith("19"),
    String(pkg.dependencies?.["react-dom"])
  );

  for (const script of [
    "dev",
    "build",
    "typecheck",
    "lint",
    "test",
    "test:e2e:run",
    "test:phaser-render",
    "test:a11y",
    "contracts",
    "foundation",
    "perf:baseline",
    "perf:check",
    "verify",
  ]) {
    check(`npm script "${script}" is declared`, typeof pkg.scripts?.[script] === "string");
  }

  // No learner-runtime analytics/LLM/telemetry dependency may be introduced
  // (docs/PRIVACY.md, ADR 0005).
  const allDeps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  const forbidden = [
    "@sentry/",
    "mixpanel",
    "amplitude",
    "posthog",
    "segment",
    "google-analytics",
    "gtag",
    "openai",
    "anthropic",
    "@langchain",
    "supabase",
    "firebase",
  ];
  const offending = Object.keys(allDeps).filter((name) =>
    forbidden.some((needle) => name === needle || name.startsWith(needle))
  );
  check("no analytics, telemetry, LLM or backend dependency is declared", offending.length === 0, offending.join(", "));
  check("no runtime production dependency beyond the frozen stack", Object.keys(pkg.dependencies ?? {}).length === 3, Object.keys(pkg.dependencies ?? {}).join(", "));
}

// ---------------------------------------------------------------------------
const REQUIRED_DIRS = [
  "src/science",
  "src/domain",
  "src/viewmodel",
  "src/ui",
  "src/renderer",
  "src/host",
  "src/app",
  "tests/unit",
  "tests/architecture",
  "tests/e2e",
];
for (const directory of REQUIRED_DIRS) {
  check(`${directory}/ exists as a package boundary`, exists(directory));
}

// Each boundary module must expose a public entry point.
for (const entry of ["src/science/index.ts", "src/domain/index.ts", "src/viewmodel/index.ts", "src/renderer/index.ts"]) {
  check(`${entry} is the package entry point`, exists(entry));
}

// The pure packages must contain no JSX file (docs/ARCHITECTURE.md §3).
for (const pure of ["src/science", "src/domain"]) {
  if (!exists(pure)) continue;
  const tsx = readdirSync(join(ROOT, pure), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tsx"))
    .map((entry) => entry.name);
  check(`${pure}/ contains no .tsx (it is a pure TypeScript package)`, tsx.length === 0, tsx.join(", "));
}

// ---------------------------------------------------------------------------
check("index.html exists (the static entry document)", exists("index.html"));
check(
  "the Vite base is relative so the build mounts under a versioned prefix",
  exists("vite.config.ts") && readFileSync(join(ROOT, "vite.config.ts"), "utf8").includes('base: "./"')
);
check("tsconfig enables strict mode", exists("tsconfig.json") && readFileSync(join(ROOT, "tsconfig.json"), "utf8").includes('"strict": true'));
check("the science/domain import boundary is enforced in lint config", exists("eslint.config.js") && readFileSync(join(ROOT, "eslint.config.js"), "utf8").includes("no-restricted-imports"));
check("the CI workflow is present", exists(".github/workflows/ci.yml"));
check(
  "CI is credential-free (no secrets are referenced)",
  exists(".github/workflows/ci.yml") &&
    !/secrets\./.test(readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8"))
);
check(
  "CI runs the same authoritative local commands",
  exists(".github/workflows/ci.yml") &&
    ["npm run typecheck", "npm run lint", "npm run test", "npm run build", "npm run perf:check"].every(
      (command) => readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8").includes(command)
    )
);

// ---------------------------------------------------------------------------
check("the performance baseline record exists", exists("performance/baseline.json"));

// GAME-384 acceptance criterion 3 names Lighthouse explicitly. These checks make the
// Lighthouse row an inspectable artifact rather than a claim in a document.
check(
  "a Lighthouse capture script exists",
  exists("scripts/lighthouse-baseline.mjs")
);
check(
  "the Lighthouse capture is an npm script",
  typeof pkg?.scripts?.["perf:lighthouse"] === "string",
  pkg?.scripts?.["perf:lighthouse"] ?? "missing"
);
check(
  "CI runs the Lighthouse capture",
  exists(".github/workflows/ci.yml") &&
    readFileSync(join(ROOT, ".github/workflows/ci.yml"), "utf8").includes("npm run perf:lighthouse")
);
check(
  "the bundle baseline folds in the Lighthouse record",
  /lighthouse/i.test(readFileSync(join(ROOT, "scripts/perf-baseline.mjs"), "utf8"))
);
check(
  "the Lighthouse capture drives the repository's own Chromium, not a downloaded browser",
  /playwright-core/.test(readFileSync(join(ROOT, "scripts/lighthouse-baseline.mjs"), "utf8"))
);
if (exists("performance/lighthouse.json")) {
  const lighthouseRecord = JSON.parse(readFileSync(join(ROOT, "performance/lighthouse.json"), "utf8"));
  check(
    "the Lighthouse record declares that no score is an enforced threshold",
    lighthouseRecord.thresholds?.enforced === false &&
      typeof lighthouseRecord.thresholds?.reason === "string"
  );
  check(
    "the Lighthouse record is labelled a lab measurement, not field data",
    /lab measurement/i.test(lighthouseRecord.measurementLabel ?? "") &&
      /not field data/i.test(lighthouseRecord.measurementLabel ?? "")
  );
  check(
    "the Lighthouse record names the throttling model it was measured under",
    typeof lighthouseRecord.metrics?.throttling?.cpuSlowdownMultiplier === "number" &&
      typeof lighthouseRecord.metrics?.throttling?.throughputKbps === "number"
  );
  check(
    "the Lighthouse record states the hosting compression assumption",
    typeof lighthouseRecord.hostingAssumption === "string" &&
      lighthouseRecord.hostingAssumption.length > 0
  );
}
// ---------------------------------------------------------------------------
// GAME-385 / ML-HOST: the games-site host contract. These checks keep the delivery path an
// inspectable artifact rather than a paragraph in a document.
const hostIdentity = exists("host-identity.json") ? readJson("host-identity.json") : null;
check("the host identity is declared once", hostIdentity !== null);
check(
  "the host identity names the games-site slug",
  hostIdentity?.gameSlug === "motion-lab",
  hostIdentity?.gameSlug ?? "missing"
);
check(
  "the host identity names the entry document",
  hostIdentity?.entryFile === "index.html",
  hostIdentity?.entryFile ?? "missing"
);
check(
  "the host identity names the games-site asset prefix base",
  hostIdentity?.assetPrefixBase === "/game-assets",
  hostIdentity?.assetPrefixBase ?? "missing"
);
check(
  "the host identity carries a release qualifier, so the version is immutable rather than a bare package version",
  typeof hostIdentity?.releaseQualifier === "string" && hostIdentity.releaseQualifier.length > 0
);
check(
  "one module owns the host identity so the scripts cannot disagree",
  exists("scripts/lib/host-identity.mjs")
);
check(
  "the nested host server exists and refuses the domain root",
  exists("scripts/nested-host-server.mjs") &&
    /only beneath \$\{PREFIX\}\/|assumed domain-root deployment/.test(
      readFileSync(join(ROOT, "scripts/nested-host-server.mjs"), "utf8")
    )
);
check(
  "a release manifest script exists",
  exists("scripts/create-release-manifest.mjs")
);
check(
  "the release manifest records source identity, not just a version",
  ["sourceSha", "dependencyLockIdentity", "releaseVersion", "entryFile", "files"].every((field) =>
    readFileSync(join(ROOT, "scripts/create-release-manifest.mjs"), "utf8").includes(field)
  )
);
check(
  "the release manifest is verifiable against drift",
  readFileSync(join(ROOT, "scripts/create-release-manifest.mjs"), "utf8").includes("--check")
);
for (const script of ["serve:nested-host", "release:manifest", "release:check", "test:host", "test:host:run"]) {
  check(
    `the npm script "${script}" is wired`,
    typeof pkg?.scripts?.[script] === "string",
    pkg?.scripts?.[script] ?? "missing"
  );
}
check(
  "the aggregate gate runs the host lane and the release identity check",
  typeof pkg?.scripts?.verify === "string" &&
    ["release:check", "test:host:run"].every((script) => pkg.scripts.verify.includes(script))
);
check(
  "the host lane exists and asserts that no request escapes the version prefix",
  exists("tests/host/nestedAssetBase.spec.ts") &&
    /escaped the version prefix/.test(readFileSync(join(ROOT, "tests/host/nestedAssetBase.spec.ts"), "utf8"))
);
check(
  "the host lane reads the prefix from the shared identity module rather than restating it",
  exists("playwright.host.config.ts") &&
    /host-identity\.mjs/.test(readFileSync(join(ROOT, "playwright.host.config.ts"), "utf8"))
);
check(
  "release metadata is excluded from the learner payload metric",
  exists("scripts/lib/bundle-scope.mjs") &&
    /release-manifest\.json/.test(readFileSync(join(ROOT, "scripts/lib/bundle-scope.mjs"), "utf8")) &&
    /bundle-scope/.test(readFileSync(join(ROOT, "scripts/check-bundle-budget.mjs"), "utf8"))
);
check(
  "docs/RELEASE.md records the established asset prefix and the host lane",
  exists("docs/RELEASE.md") &&
    /\/game-assets\/motion-lab\/<version>\//.test(readFileSync(join(ROOT, "docs/RELEASE.md"), "utf8")) &&
    /npm run test:host/.test(readFileSync(join(ROOT, "docs/RELEASE.md"), "utf8"))
);
check(
  "docs/RELEASE.md does not claim a promotion or a rollback occurred",
  !/\bpromoted to production\b/i.test(readFileSync(join(ROOT, "docs/RELEASE.md"), "utf8"))
);

check(
  "docs/PERFORMANCE_BASELINE.md documents the Lighthouse row",
  exists("docs/PERFORMANCE_BASELINE.md") &&
    /lighthouse/i.test(readFileSync(join(ROOT, "docs/PERFORMANCE_BASELINE.md"), "utf8"))
);
check(
  "the bootstrap/setup documentation exists",
  exists("docs/BOOTSTRAP.md")
);
check(
  "the README documents the local commands",
  exists("README.md") &&
    ["npm run verify", "npm run build", "npm run test"].every((command) =>
      readFileSync(join(ROOT, "README.md"), "utf8").includes(command)
    )
);

// The repository must not claim an unexecuted human gate passed.
const CLAIM_PATTERNS = [
  /accessibility\s+sign-?off\s+(passed|complete|approved)/i,
  /science\s+review\s+(passed|approved|complete)/i,
  /CI\s+(is\s+)?green(?![a-z])/i,
];
for (const file of ["README.md", "docs/BOOTSTRAP.md", "docs/PERFORMANCE_BASELINE.md"]) {
  if (!exists(file)) continue;
  const text = readFileSync(join(ROOT, file), "utf8");
  for (const pattern of CLAIM_PATTERNS) {
    const match = text.match(pattern);
    check(
      `${file} does not assert unexecuted evidence (${pattern})`,
      match === null,
      match ? match[0] : ""
    );
  }
}

// ---------------------------------------------------------------------------
console.log(
  "Motion Lab foundation consistency check (GAME-384 / ML-02, extended by GAME-385 / ML-HOST)\n"
);
if (failures.length > 0) {
  console.log(`${failures.length} check(s) FAILED:\n`);
  for (const failure of failures) {
    console.log(`  - ${failure.description}${failure.detail ? `  [${failure.detail}]` : ""}`);
  }
  console.log(`\nRESULT: FAIL (${passed}/${passed + failures.length} checks passed)`);
  process.exit(1);
}
console.log(`RESULT: PASS (${passed}/${passed} checks passed)`);
