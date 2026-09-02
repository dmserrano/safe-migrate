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

export async function run(config, { only } = {}) {
  const targets = only ? [only] : await selectTargets(config);
  const results = [];

  for (const target of targets) {
    results.push(await processTarget(target, config));
  }

  await writeReport(results, config);
  return results;
}

async function processTarget(target, config) {
  const ctx = await assembleContext(target, config);
  const attempts = [];

  for (let i = 0; i < config.gates.maxGenerationAttempts; i++) {
    const { source, tokens } = await generateTest(ctx, config, attempts);

    // Cheap gates first — static check costs nothing, mutation costs minutes.
    const gates = [gateStatic, gateGreen, gateStable, gateMutation];
    let failure = null;

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
  return { target, status: "rejected", attempts, reason: attempts.at(-1).failure };
}
