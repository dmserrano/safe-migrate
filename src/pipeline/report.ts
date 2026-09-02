/**
 * STEP 8 — Run report.
 *
 * The rejection log is the most credible artifact this project produces. Publish it.
 * Every demo in this space shows only successes, which reads as marketing.
 */
import type { SafeMigrateConfig, TargetResult } from "../types.js";

export async function writeReport(results: TargetResult[], config: SafeMigrateConfig) {
  const accepted = results.filter((r) => r.status === "accepted");
  const rejected = results.filter((r) => r.status === "rejected");
  const tokens = results.reduce(
    (sum, r) => sum + r.attempts.reduce((s, a) => s + (a.tokens ?? 0), 0), 0);

  // Cost per ACCEPTED test. Cost per generated test is a vanity metric.
  const costPerAccepted = accepted.length ? tokens / accepted.length : null;

  // TODO(M4): write markdown to config.output.reportDir
  // TODO(M4): write each rejected attempt + reason to config.output.rejectionLog
  return { attempted: results.length, accepted: accepted.length,
           rejected: rejected.length, tokens, costPerAccepted };
}
