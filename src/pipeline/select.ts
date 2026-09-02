/**
 * STEP 1 — Target selection. Deterministic, no agent.
 *
 * This is what makes the tool MIGRATION-AWARE rather than a generic test generator:
 * it only targets modules the upgrade will actually touch.
 *
 * M4. Hardcode a list until then.
 */
import type { SafeMigrateConfig } from "../types.js";

export async function selectTargets(config: SafeMigrateConfig): Promise<string[]> {
  // TODO(M4):
  //   1. Resolve config.migration.upgrades to package names
  //   2. Walk the import graph; find modules that (transitively) import them
  //   3. Drop modules already covered by an existing test
  //   4. Rank by churn (git log --follow) x cyclomatic complexity
  //   5. Return top N
  throw new Error("selectTargets not implemented — pass --only <path> until M4");
}
