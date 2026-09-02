/**
 * STEP 3 — The ONLY agent step.
 *
 * Deliberately thin. If this file grows large, logic is leaking out of the
 * deterministic harness and into the prompt, which is the wrong direction.
 */
import { CONSTRAINTS } from "../constraints.js";

export async function generateTest(ctx, config, priorAttempts = []) {
  const prompt = buildPrompt(ctx, priorAttempts);

  // TODO(M1): shell out to config.agent.provider's CLI (copilot-cli, claude-cli, ...).
  // Do this by hand first before automating — you need to see how it fails before
  // you can design around it. Provider-agnostic: the harness only needs a prompt in,
  // text out; no gate cares which agent produced the test.
  // TODO(M2): capture token usage; cost-per-ACCEPTED-test is the honest metric.
  throw new Error("generateTest not implemented — M1");
}

function buildPrompt(ctx, priorAttempts) {
  const rules = CONSTRAINTS.map((c) => `- ${c.id}: ${c.reason}`).join("\n");

  const feedback = priorAttempts.length
    ? `\nPrevious attempts failed:\n${priorAttempts
        .map((a, i) => `${i + 1}. ${a.failure?.gate}: ${a.failure?.detail ?? ""}`)
        .join("\n")}\n`
    : "";

  return `Write a characterization test for the module below.

A characterization test locks in CURRENT behavior, including bugs. You are not
asserting the code is correct — you are asserting it does not change.

Constraints (violating any of these means the test is rejected):
${rules}

Assert user-visible behavior, not implementation. Prefer Testing Library queries.
${feedback}
Module: ${ctx.modulePath}
${ctx.source ?? ""}`;
}
