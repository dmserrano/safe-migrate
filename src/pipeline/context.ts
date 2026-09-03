/**
 * STEP 2 — Context assembly. Retrieval, not generation.
 *
 * Quality of generated tests depends more on this than on prompt wording.
 * Under-supplying context is the most likely cause of bad output at M1/M2.
 *
 * Scope for M2 (this ticket): a single hardcoded `--only` target. Full retrieval for
 * arbitrary auto-selected targets (fixtures, repo-wide framework-version detection) is
 * ticket 14 (M4) — out of scope here.
 */
import fs from "node:fs/promises";
import path from "node:path";
import fg from "fast-glob";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { moduleStem } from "../paths.js";
import type { Context, ImportSummary, SafeMigrateConfig } from "../types.js";

export async function assembleContext(
  modulePath: string,
  config: SafeMigrateConfig,
): Promise<Context> {
  const packageRoot = path.resolve(config.target.root, config.target.package);
  const absModulePath = path.resolve(packageRoot, modulePath);

  const source = await fs.readFile(absModulePath, "utf8");
  const imports = extractImports(source);

  const testFiles = await fg(config.target.testGlob, { cwd: packageRoot, absolute: true });
  const stem = moduleStem(modulePath);

  const ownTestAbs = testFiles.find((f) => moduleStem(f).replace(/\.(test|spec)$/, "") === stem) ?? null;

  // The own test is excluded from context; a DIFFERENT sibling test (if any) is
  // included as a conventions exemplar, to teach the repo's real testing idioms
  // without leaking the answer for the module under test.
  const siblingTestAbs = testFiles.find((f) => f !== ownTestAbs) ?? null;
  const conventions = siblingTestAbs ? await fs.readFile(siblingTestAbs, "utf8") : null;

  return {
    modulePath,
    source,
    imports,
    conventions,
    ownTestPath: ownTestAbs ? path.relative(packageRoot, ownTestAbs) : null,
  };
}

function extractImports(source: string): ImportSummary[] {
  let ast: t.File;
  try {
    ast = parse(source, { sourceType: "module", plugins: ["jsx", "typescript"] });
  } catch {
    // If the module under test doesn't parse, generation will fail downstream anyway —
    // context assembly shouldn't be the thing that crashes the pipeline over it.
    return [];
  }

  const imports: ImportSummary[] = [];
  traverse(ast, {
    ImportDeclaration(nodePath) {
      const specifier = nodePath.node.source.value;
      const exportsUsed = nodePath.node.specifiers
        .map((s) => {
          if (t.isImportDefaultSpecifier(s)) return "default";
          if (t.isImportNamespaceSpecifier(s)) return "*";
          if (t.isImportSpecifier(s)) {
            return t.isIdentifier(s.imported) ? s.imported.name : s.imported.value;
          }
          return null;
        })
        .filter((x): x is string => x !== null);
      imports.push({ specifier, exportsUsed });
    },
  });
  return imports;
}
