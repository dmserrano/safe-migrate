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
import type { Gate } from "../../types.js";

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

const SURVIVING_STATUSES = new Set<string>([Status.Survived, Status.NoCoverage]);
const KILLED_STATUSES = new Set<string>([Status.Killed, Status.Timeout]);

export const gateMutation: Gate = async (source, ctx, config) => {
  return withGeneratedTestFile(source, ctx, config, async (packageRoot, tempRelPath) => {
    const scopedCommand = scopeToFile(config.runtime.testCommand, config.target.testGlob, tempRelPath);
    const session = await startTargetRuntime(packageRoot, config);

    // Stryker resolves mutate globs and config relative to process.cwd() — this
    // process handles one target at a time (see pipeline/index.ts), so a temporary
    // chdir is safe.
    const originalCwd = process.cwd();
    process.chdir(packageRoot);

    try {
      // -e forwards Stryker's per-mutant env var — docker exec doesn't inherit caller
      // env by default. Without it every mutant runs unmutated code and "survives".
      const dockerExecCommand = `docker exec -e ${INSTRUMENTER_CONSTANTS.ACTIVE_MUTANT_ENV_VARIABLE} ${session.containerId} sh -c ${shellQuote(scopedCommand)}`;

      const stryker = new Stryker({
        mutate: [ctx.modulePath],
        testRunner: "command",
        commandRunner: { command: dockerExecCommand },
        logLevel: LogLevel.Error,
        // Else Stryker mutates a copy in its own sandbox dir the fixed-path docker
        // exec above can't see — every mutant would falsely "survive".
        inPlace: true,
      });
      const mutants = (await stryker.runMutationTest()) as MutantResult[];

      // Covered mutants only — uncovered says nothing about test quality (PRD
      // threshold-calibration method: p25 of covered-mutant scores).
      const covered = mutants.filter((m) => m.status !== Status.Ignored && m.status !== Status.NoCoverage);
      const killed = covered.filter((m) => KILLED_STATUSES.has(m.status));
      const score = covered.length === 0 ? 0 : killed.length / covered.length;

      if (score >= config.gates.mutationScoreThreshold) {
        return { ok: true };
      }

      const survived = mutants.filter((m) => SURVIVING_STATUSES.has(m.status));
      return {
        ok: false,
        detail: `mutation score ${score.toFixed(2)} < threshold ${config.gates.mutationScoreThreshold} (${killed.length}/${covered.length} covered mutants killed)`,
        violations: survived.map((m) => ({
          id: m.id,
          reason: `${m.mutatorName} survived at line ${m.location.start.line}`,
        })),
      };
    } finally {
      process.chdir(originalCwd);
      await session.stop();
    }
  });
};

// Single-quote for the target container's shell, escaping embedded single quotes.
function shellQuote(command: string): string {
  return `'${command.replaceAll("'", `'\\''`)}'`;
}
