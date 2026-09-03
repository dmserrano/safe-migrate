/**
 * STEP 3 — The ONLY agent step.
 *
 * Deliberately thin. If this file grows large, logic is leaking out of the
 * deterministic harness and into the prompt, which is the wrong direction.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { CONSTRAINTS } from "../constraints.js";
import { runProvider } from "./providers.js";
import { resolveTestDir } from "./gates/green.js";
import type { Attempt, Context, SafeMigrateConfig } from "../types.js";

export async function generateTest(
  ctx: Context,
  config: SafeMigrateConfig,
  priorAttempts: Attempt[] = [],
): Promise<{ source: string; tokens?: number }> {
  const prompt = buildPrompt(ctx, config, priorAttempts);
  const packageRoot = path.resolve(config.target.root, config.target.package);

  // Physical exclusion, not just omission from ctx — an agentic provider can and will
  // go looking for the module's own test on its own initiative (observed directly in
  // ticket 02's calibration). See ticket 04's design note: this is the REQUIRED layer,
  // not defense in depth. Restored in `finally` regardless of outcome.
  const excludedAbs = ctx.ownTestPath ? path.resolve(packageRoot, ctx.ownTestPath) : null;
  const excludedTmp = excludedAbs ? `${excludedAbs}.excluded-by-safe-migrate` : null;

  if (excludedAbs && excludedTmp) {
    await fs.rename(excludedAbs, excludedTmp);
  }

  try {
    return await runProvider(prompt, packageRoot, config);
  } finally {
    if (excludedAbs && excludedTmp) {
      await fs.rename(excludedTmp, excludedAbs);
    }
  }
}

function buildPrompt(ctx: Context, config: SafeMigrateConfig, priorAttempts: Attempt[]): string {
  const rules = CONSTRAINTS.map((c) => `- ${c.id}: ${c.reason}`).join("\n");

  // Compute the exact import path rather than let the model guess it — guesses were
  // wrong for own-tests nested deeper than the testGlob's base dir (found live).
  // Extension omitted: import-extension convention varies, taught via the exemplar.
  const testDir = resolveTestDir(ctx, config);
  const packageRoot = path.resolve(config.target.root, config.target.package);
  const relImport = path
    .relative(path.resolve(packageRoot, testDir), path.resolve(packageRoot, ctx.modulePath))
    .replace(/\.[jt]sx?$/, "")
    .split(path.sep)
    .join("/");
  const importPath = `\nYour test file will be saved in "${testDir}/". Import the module under\ntest using exactly this relative path (adjust only the extension, if any, to match\nthe repo's own import convention shown below): "${relImport.startsWith(".") ? relImport : `./${relImport}`}"\n`;

  const feedback = priorAttempts.length
    ? `\nPrevious attempts failed:\n${priorAttempts
        .map((a, i) => `${i + 1}. ${a.failure?.gate}: ${a.failure?.detail ?? ""}`)
        .join("\n")}\n`
    : "";

  const imports = ctx.imports.length
    ? `\nThe module imports: ${ctx.imports
        .map((i) => `${i.specifier} (${i.exportsUsed.join(", ") || "side-effect only"})`)
        .join("; ")}\n`
    : "";

  // The module's OWN test is deliberately never in ctx (see ticket 04's design note) —
  // this exemplar is always a DIFFERENT, sibling test, included to teach real repo
  // conventions without leaking the answer for the module under test.
  const conventions = ctx.conventions
    ? `\nFollow this repo's existing testing conventions, shown below (a test for a\ndifferent module, for style reference only — do not copy its assertions):\n${ctx.conventions}\n`
    : "";

  return `Write a characterization test for the module below.

A characterization test locks in CURRENT behavior, including bugs. You are not
asserting the code is correct — you are asserting it does not change.

Constraints (violating any of these means the test is rejected):
${rules}

Assert user-visible behavior, not implementation. Prefer Testing Library queries.
${importPath}${imports}${conventions}${feedback}
Module: ${ctx.modulePath}
${ctx.source ?? ""}`;
}
