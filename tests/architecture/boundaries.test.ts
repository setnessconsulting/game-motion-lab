import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Executable architecture boundaries (docs/ARCHITECTURE.md §3, ADR 0001, ADR 0002).
 *
 * The Epic requires the React/Phaser boundary to be enforceable rather than merely
 * documented, so this test reads the real module graph and fails on a forbidden edge.
 * eslint.config.js enforces the same rules for editor feedback; this test is the gate
 * that also runs in CI and locally when ESLint is not the runner.
 */

const SRC = resolve(process.cwd(), "src");

const IMPORT_PATTERNS: readonly RegExp[] = [
  /import\s+[^;]*?from\s*["']([^"']+)["']/g,
  /import\s*["']([^"']+)["']/g,
  /export\s+[^;]*?from\s*["']([^"']+)["']/g,
  /import\s*\(\s*["']([^"']+)["']\s*\)/g,
];

interface SourceFile {
  readonly absolutePath: string;
  readonly relativeToSrc: string;
  readonly folder: string;
  readonly source: string;
  readonly specifiers: readonly string[];
}

function listSourceFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath ?? dir, entry.name));
}

function specifiersOf(source: string): string[] {
  const found = new Set<string>();
  for (const pattern of IMPORT_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) found.add(specifier);
    }
  }
  return [...found];
}

function loadSourceFiles(): SourceFile[] {
  return listSourceFiles(SRC).map((absolutePath) => {
    const relativeToSrc = relative(SRC, absolutePath).split(sep).join("/");
    const [folder = ""] = relativeToSrc.split("/");
    const source = readFileSync(absolutePath, "utf8");
    return { absolutePath, relativeToSrc, folder, source, specifiers: specifiersOf(source) };
  });
}

/** Resolve a specifier to a `src`-relative path, or null when it is an external module. */
function resolveToSrcRelative(file: SourceFile, specifier: string): string | null {
  if (specifier.startsWith("@/")) return specifier.slice(2);
  if (specifier.startsWith(".")) {
    const fromDir = resolve(SRC, file.relativeToSrc, "..");
    return relative(SRC, resolve(fromDir, specifier)).split(sep).join("/");
  }
  return null;
}

/** The first path segment inside `src` a specifier points at, or null when external. */
function targetFolder(file: SourceFile, specifier: string): string | null {
  const resolved = resolveToSrcRelative(file, specifier);
  if (resolved === null) return null;
  const [folder = ""] = resolved.replace(/^\.\//, "").split("/");
  return folder;
}

interface Rule {
  readonly id: string;
  readonly appliesTo: readonly string[];
  readonly forbiddenExternal: readonly string[];
  readonly forbiddenFolders: readonly string[];
  readonly forbiddenTokens: readonly string[];
}

const PURE_FOLDERS = ["science", "domain", "content"];

const RULES: readonly Rule[] = [
  {
    id: "pure-science-domain-content",
    appliesTo: PURE_FOLDERS,
    forbiddenExternal: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "phaser",
      "jsdom",
      "matter-js",
      "rapier",
      "planck",
      "box2d",
      "@dimforge/rapier2d",
    ],
    forbiddenFolders: ["ui", "renderer", "host", "viewmodel", "app"],
    forbiddenTokens: [
      "window.",
      "document.",
      "localStorage",
      "sessionStorage",
      "indexedDB",
      "fetch(",
      "XMLHttpRequest",
      "sendBeacon",
      "process.env",
    ],
  },
  {
    id: "renderer-presentation-only",
    appliesTo: ["renderer"],
    forbiddenExternal: ["react", "react-dom", "matter-js", "rapier", "planck", "box2d"],
    forbiddenFolders: ["science", "domain", "content", "app"],
    forbiddenTokens: ["matter-js", "rapier", "planck", "box2d"],
  },
  {
    id: "view-model-renderer-free",
    appliesTo: ["viewmodel"],
    forbiddenExternal: ["react", "react-dom", "phaser"],
    forbiddenFolders: ["ui", "renderer", "host", "app"],
    forbiddenTokens: ["window.", "document.", "localStorage", "sessionStorage"],
  },
  {
    id: "ui-not-renderer-internals",
    appliesTo: ["ui"],
    forbiddenExternal: ["phaser", "matter-js", "rapier", "planck", "box2d"],
    forbiddenFolders: ["renderer"],
    forbiddenTokens: [],
  },
  {
    id: "host-loads-renderer-lazily",
    appliesTo: ["host"],
    forbiddenExternal: ["phaser"],
    forbiddenFolders: [],
    forbiddenTokens: [],
  },
];

const files = loadSourceFiles();

describe("source inventory", () => {
  it("found the real source tree (so the boundary checks are not vacuous)", () => {
    expect(files.length).toBeGreaterThanOrEqual(15);
    for (const folder of [
      "science",
      "domain",
      "content",
      "viewmodel",
      "ui",
      "renderer",
      "host",
      "app",
    ]) {
      expect(files.some((file) => file.folder === folder)).toBe(true);
    }
  });

  it("keeps the pure packages free of JSX (*.tsx)", () => {
    for (const file of files) {
      if (PURE_FOLDERS.includes(file.folder)) {
        expect(file.relativeToSrc.endsWith(".tsx")).toBe(false);
      }
    }
  });
});

describe("forbidden module edges", () => {
  for (const rule of RULES) {
    it(rule.id, () => {
      const violations: string[] = [];
      for (const file of files) {
        if (!rule.appliesTo.includes(file.folder)) continue;
        for (const specifier of file.specifiers) {
          if (rule.forbiddenExternal.includes(specifier)) {
            violations.push(`${file.relativeToSrc} -> ${specifier}`);
            continue;
          }
          const folder = targetFolder(file, specifier);
          if (folder !== null && rule.forbiddenFolders.includes(folder)) {
            violations.push(`${file.relativeToSrc} -> ${specifier}`);
          }
        }
      }
      expect(violations).toStrictEqual([]);
    });
  }
});

describe("forbidden runtime tokens", () => {
  for (const rule of RULES) {
    if (rule.forbiddenTokens.length === 0) continue;
    it(`${rule.id} tokens`, () => {
      const violations: string[] = [];
      for (const file of files) {
        if (!rule.appliesTo.includes(file.folder)) continue;
        for (const token of rule.forbiddenTokens) {
          if (file.source.includes(token)) {
            violations.push(`${file.relativeToSrc} contains ${token}`);
          }
        }
      }
      expect(violations).toStrictEqual([]);
    });
  }
});

describe("no physics engine is a scientific authority anywhere", () => {
  it("no source file imports a rigid-body or collision engine", () => {
    const engines = ["matter-js", "rapier", "planck", "box2d", "cannon-es", "@dimforge/rapier2d"];
    const violations: string[] = [];
    for (const file of files) {
      for (const specifier of file.specifiers) {
        if (engines.some((engine) => specifier === engine || specifier.startsWith(`${engine}/`))) {
          violations.push(`${file.relativeToSrc} -> ${specifier}`);
        }
      }
    }
    expect(violations).toStrictEqual([]);
  });

  it("the renderer never imports the scientific authority", () => {
    const renderer = files.filter((file) => file.folder === "renderer");
    expect(renderer.length).toBeGreaterThan(0);
    for (const file of renderer) {
      for (const specifier of file.specifiers) {
        const folder = targetFolder(file, specifier);
        expect(folder === "science" || folder === "domain" || folder === "content").toBe(false);
      }
    }
  });

  it("the renderer is loaded as its own chunk, never statically by the science path", () => {
    const scienceOrDomain = files.filter((file) => PURE_FOLDERS.includes(file.folder));
    for (const file of scienceOrDomain) {
      for (const specifier of file.specifiers) {
        expect(specifier.includes("renderer")).toBe(false);
      }
    }
  });

  it("the shipped application cannot reach the content package or its goldens", () => {
    // The golden traces contain the expected answer to every scenario, and the
    // content set is data the application has no reason to import. If an app
    // module could reach it, the anti-answer-key guarantee would depend on
    // discipline rather than on the module graph.
    const application = files.filter((file) =>
      ["app", "ui", "renderer", "host", "viewmodel"].includes(file.folder)
    );
    expect(application.length).toBeGreaterThan(0);
    for (const file of application) {
      for (const specifier of file.specifiers) {
        const folder = targetFolder(file, specifier);
        expect(folder === "content", `${file.relativeToSrc} -> ${specifier}`).toBe(false);
      }
    }
  });
});

describe("the presentation geometry is computable without a browser (GAME-390 / ML-06)", () => {
  // ML-06 acceptance criterion 3 claims the same domain trace renders the same way
  // regardless of refresh rate. The only way to make that checkable rather than hopeful is
  // for the metre-to-canvas mapping to be a pure function that can run in the Node test
  // environment. That requires this file to stay free of Phaser and of the DOM — so the
  // requirement is enforced here, where it cannot be quietly dropped.
  const geometrySource = readFileSync(resolve(SRC, "renderer", "labGeometry.ts"), "utf8");

  it("exists and is the module the scene draws through", () => {
    expect(geometrySource.length).toBeGreaterThan(500);
    expect(geometrySource).toContain("export function sceneGeometry");
  });

  it("imports no Phaser, so it can be loaded where there is no canvas", () => {
    expect(geometrySource).not.toMatch(/from\s+["']phaser["']/);
    expect(geometrySource).not.toMatch(/import\s+Phaser/);
  });

  it("touches no browser global", () => {
    for (const token of ["window.", "document.", "navigator.", "localStorage"]) {
      expect(geometrySource).not.toContain(token);
    }
  });

  it("is imported by the scene rather than reimplemented there", () => {
    // The import list is read, not just the module specifier: a check that only asked
    // "does the scene import from labGeometry" passed a break that dropped `sceneGeometry`
    // from that import, which is exactly the regression this is meant to catch.
    const sceneSource = readFileSync(resolve(SRC, "renderer", "labScene.ts"), "utf8");
    const imported = /import\s*\{([^}]*)\}\s*from\s*["']\.\/labGeometry\.js["']/.exec(sceneSource);
    expect(imported).not.toBeNull();
    expect(imported?.[1] ?? "").toContain("sceneGeometry");
  });

  it("maps positions with the shared function, not with a private formula", () => {
    // A scene that inlined its own metre-to-pixel arithmetic would satisfy every check
    // above while drawing something the pure module never agreed to.
    const sceneSource = readFileSync(resolve(SRC, "renderer", "labScene.ts"), "utf8");
    expect(sceneSource).toContain("sceneGeometry(");
    expect(sceneSource).not.toMatch(/pixelsPerMetre\s*[*/]/);
    expect(sceneSource).not.toMatch(/\/\s*LOGICAL_WIDTH/);
  });

  it("is reachable from the unit suite, which is the environment that proves purity", () => {
    const unitSuite = readFileSync(
      resolve(process.cwd(), "tests", "unit", "labGeometry.test.ts"),
      "utf8"
    );
    expect(unitSuite).toMatch(/from\s+["']\.\.\/\.\.\/src\/renderer\/labGeometry\.js["']/);
  });
});

describe("the renderer cannot be driven by frame time (GAME-390 / ML-06)", () => {
  // AC3 (refresh-rate independence) and AC4 (reduced motion removes motion) are made
  // structural by keeping frame time out of the drawing path entirely: no frame delta, no
  // elapsed clock, no tween. A later milestone that wants animation must change this check
  // and the document deliberately, rather than easing past a boundary nobody was watching.
  const rawScene = readFileSync(resolve(SRC, "renderer", "labScene.ts"), "utf8");
  // Comments are stripped first. The doc comment in that file names the very tokens this
  // check forbids, and a gate that trips over its own explanation is a gate nobody keeps.
  const sceneSource = rawScene
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  it("computes its geometry through the shared pure function", () => {
    expect(sceneSource).toContain("sceneGeometry(");
  });

  for (const token of ["delta", "tweens", ".tween(", "performance.now"] ) {
    it(`never reads ${token}`, () => {
      expect(sceneSource).not.toContain(token);
    });
  }
});

describe("the detector itself works (guards against a vacuous gate)", () => {
  // A synthetic violation must be detected, otherwise a green suite would be meaningless.
  const syntheticFile: SourceFile = {
    absolutePath: "/synthetic",
    relativeToSrc: "science/synthetic.ts",
    folder: "science",
    source: 'import Phaser from "phaser";',
    specifiers: ["phaser"],
  };

  it("flags a science -> phaser import", () => {
    const rule = RULES[0];
    expect(rule).toBeDefined();
    const caught = syntheticFile.specifiers.some((specifier) =>
      (rule as Rule).forbiddenExternal.includes(specifier)
    );
    expect(caught).toBe(true);
  });

  it("flags a science -> ui relative import", () => {
    const rule = RULES[0] as Rule;
    const file: SourceFile = { ...syntheticFile, specifiers: ["../ui/InstrumentPanel.js"] };
    const folder = targetFolder(file, "../ui/InstrumentPanel.js");
    expect(folder).toBe("ui");
    expect(rule.forbiddenFolders.includes(folder as string)).toBe(true);
  });

  it("resolves the @/ alias form too", () => {
    const file: SourceFile = { ...syntheticFile, specifiers: ["@/renderer/index.js"] };
    expect(targetFolder(file, "@/renderer/index.js")).toBe("renderer");
  });
});
