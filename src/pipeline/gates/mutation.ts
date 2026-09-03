/**
 * GATE 6 — does the test actually CATCH anything?
 *
 * Coverage measures lines executed; mutation testing measures defects detected.
 * Scoped to the single module under test — whole-repo mutation is too slow.
 *
 * Stryker runs on the ORCHESTRATOR's own Node, not the target runtime — target images
 * are often too old for current Stryker (e.g. node:14 can't load it). Each mutant's
 * test run is delegated into the already-running target container via `docker exec`,
 * so tests still execute under the target's real Node/deps/services. Test-runner-
 * agnostic: uses Stryker's "command" runner with the same scoped command the green
 * gate builds, rather than assuming jest.
 */
import { Stryker } from "@stryker-mutator/core";
import { INSTRUMENTER_CONSTANTS, LogLevel } from "@stryker-mutator/api/core";
import { scopeToFile, withGeneratedTestFile } from "./green.js";
import { startTargetRuntime } from "../runtime.js";
import type { Gate, SafeMigrateConfig } from "../../types.js";

const Status = {
  Ignored: "Ignored",
  NoCoverage: "NoCoverage",
  Survived: "Survived",
  Killed: "Killed",
  Timeout: "Timeout",
} as const;

interface MutantResult {
  id: string;
  mutatorName: string;
  status: string;
  location: { start: { line: number; column: number } };
}

export interface MutationScore {
  score: number;
  covered: number;
  killed: number;
  survived: MutantResult[];
}

const SURVIVING_STATUSES = new Set<string>([Status.Survived, Status.NoCoverage]);
const KILLED_STATUSES = new Set<string>([Status.Killed, Status.Timeout]);

// Shared by the gate (scores a generated test) and scripts/calibrate-mutation-
// threshold.ts (scores an existing human-written test, to derive the gate's own
// threshold). testRelPath is whatever test file exercises modulePath — generated
// temp file or a real one on disk, this function doesn't care which.
export async function scoreMutation(
  modulePath: string,
  testRelPath: string,
  packageRoot: string,
  config: SafeMigrateConfig,
): Promise<MutationScore> {
  const scopedCommand = scopeToFile(config.runtime.testCommand, config.target.testGlob, testRelPath);
  const session = await startTargetRuntime(packageRoot, config);

  // Stryker resolves mutate globs and config relative to process.cwd() — callers
  // handle one target at a time, so a temporary chdir is safe.
  const originalCwd = process.cwd();
  process.chdir(packageRoot);

  try {
    // -e forwards Stryker's per-mutant env var — docker exec doesn't inherit caller
    // env by default. Without it every mutant runs unmutated code and "survives".
    const dockerExecCommand = `docker exec -e ${INSTRUMENTER_CONSTANTS.ACTIVE_MUTANT_ENV_VARIABLE} ${session.containerId} sh -c ${shellQuote(scopedCommand)}`;

    const stryker = new Stryker({
      mutate: [modulePath],
      testRunner: "command",
      commandRunner: { command: dockerExecCommand },
      logLevel: LogLevel.Error,
      // Else Stryker mutates a copy in its own sandbox dir the fixed-path docker
      // exec above can't see — every mutant would falsely "survive".
      inPlace: true,
    });
    const mutants = (await stryker.runMutationTest()) as MutantResult[];

    // NoCoverage never actually fires — the command runner has no per-mutant coverage
    // analysis, so this only drops Ignored mutants in practice. Kept for intent/in
    // case a future runner does support it.
    const covered = mutants.filter((m) => m.status !== Status.Ignored && m.status !== Status.NoCoverage);
    const killed = covered.filter((m) => KILLED_STATUSES.has(m.status));
    const survived = mutants.filter((m) => SURVIVING_STATUSES.has(m.status));

    return {
      score: covered.length === 0 ? 0 : killed.length / covered.length,
      covered: covered.length,
      killed: killed.length,
      survived,
    };
  } finally {
    process.chdir(originalCwd);
    await session.stop();
  }
}

export const gateMutation: Gate = async (source, ctx, config) => {
  return withGeneratedTestFile(source, ctx, config, async (packageRoot, tempRelPath) => {
    const { score, covered, killed, survived } = await scoreMutation(ctx.modulePath, tempRelPath, packageRoot, config);

    if (score >= config.gates.mutationScoreThreshold) {
      return { ok: true };
    }

    return {
      ok: false,
      detail: `mutation score ${score.toFixed(2)} < threshold ${config.gates.mutationScoreThreshold} (${killed}/${covered} covered mutants killed)`,
      violations: survived.map((m) => ({
        id: m.id,
        reason: `${m.mutatorName} survived at line ${m.location.start.line}`,
      })),
    };
  });
};

// Single-quote for the target container's shell, escaping embedded single quotes.
function shellQuote(command: string): string {
  return `'${command.replaceAll("'", `'\\''`)}'`;
}
