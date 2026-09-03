/**
 * Orchestrator. Deterministic control flow; the agent is one step inside it.
 *
 * Build order matters: get generate + green working (M2), THEN mutation (M3).
 * Do not build select/report until those hold up.
 */
import { selectTargets } from "./select.js";
import { assembleContext } from "./context.js";
import { generateTest } from "./generate.js";
import { gateStatic } from "./gates/static.js";
import { gateGreen } from "./gates/green.js";
import { gateMutation } from "./gates/mutation.js";
import { gateStable } from "./gates/stable.js";
import { writeReport } from "./report.js";
import type { Attempt, Gate, GateFailure, SafeMigrateConfig, TargetResult } from "../types.js";

// Cheap gates first — static check costs nothing, mutation costs minutes.
const DEFAULT_GATES: Gate[] = [gateStatic, gateGreen, gateStable, gateMutation];

export async function run(
  config: SafeMigrateConfig,
  { only, gates }: { only?: string; gates?: Gate[] } = {},
): Promise<TargetResult[]> {
  const targets = only ? [only] : await selectTargets(config);
  const results: TargetResult[] = [];

  for (const target of targets) {
    results.push(await processTarget(target, config, gates ?? DEFAULT_GATES));
  }

  await writeReport(results, config);
  return results;
}

export async function processTarget(
  target: string,
  config: SafeMigrateConfig,
  gates: Gate[] = DEFAULT_GATES,
  generate: typeof generateTest = generateTest,
): Promise<TargetResult> {
  const ctx = await assembleContext(target, config);
  const attempts: Attempt[] = [];

  for (let i = 0; i < config.gates.maxGenerationAttempts; i++) {
    const { source, tokens } = await generate(ctx, config, attempts);

    let failure: GateFailure | null = null;

    for (const gate of gates) {
      const result = await gate(source, ctx, config);
      if (!result.ok) { failure = { gate: gate.name, ...result }; break; }
    }

    attempts.push({ source, tokens, failure });

    if (!failure) {
      return { target, status: "accepted", source, attempts, tokens };
    }
  }

  // Exhausted retries. This is a legitimate outcome, not an error — log it loudly.
  const last = attempts.at(-1)!;
  return { target, status: "rejected", attempts, reason: last.failure! };
}
