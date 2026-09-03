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
import type { Attempt, Context, SafeMigrateConfig } from "../types.js";

export async function generateTest(
  ctx: Context,
  config: SafeMigrateConfig,
  priorAttempts: Attempt[] = [],
): Promise<{ source: string; tokens?: number }> {
  const prompt = buildPrompt(ctx, priorAttempts);
  const packageRoot = path.resolve(config.target.root, config.target.package);

  // Physical exclusion, not just omission from ctx — an agentic provider can and will
  // go looking for the module's own test on its own initiative (observed directly in
  // ticket 02's calibration). See ticket 04's design note: this is the REQUIRED layer,
  // not defense in depth. Restored in `finally` regardless of outcome.
  const excludedAbs = ctx.ownTestPath ? path.resolve(packageRoot, ctx.ownTestPath) : null;
  const excludedTmp = excludedAbs ? `${excludedAbs}.excluded-by-safemigrate` : null;

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

function buildPrompt(ctx: Context, priorAttempts: Attempt[]): string {
  const rules = CONSTRAINTS.map((c) => `- ${c.id}: ${c.reason}`).join("\n");

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
${imports}${conventions}${feedback}
Module: ${ctx.modulePath}
${ctx.source ?? ""}`;
}
