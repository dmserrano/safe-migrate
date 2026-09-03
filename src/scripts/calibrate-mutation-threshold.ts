#!/usr/bin/env node
/**
 * PRD § M3 calibration: derive gates.mutationScoreThreshold from the target repo's own
 * human-written tests instead of guessing. Rejecting generated tests against a bar the
 * existing suite itself would fail is indefensible.
 *
 * Method: for each given module with an existing test (discovered via
 * assembleContext's own-test matching), score that REAL test through the same mutation
 * gate mechanics generated tests go through. Modules with <10 covered mutants are
 * dropped (too little signal). Threshold = p25 of the remaining scores.
 *
 * One-time-per-repo tool, not part of the generate/gate pipeline — run by hand, not
 * invoked by `safe-migrate run`. Not agent-writable at run time for the same reason
 * gates aren't: it measures the bar, it doesn't get to move it to pass.
 *
 * Usage: node dist/scripts/calibrate-mutation-threshold.js -c <config> <modulePath...>
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { program } from "commander";
import { assembleContext } from "../pipeline/context.js";
import { scoreMutation } from "../pipeline/gates/mutation.js";
import type { SafeMigrateConfig } from "../types.js";

const MIN_COVERED_MUTANTS = 10;

program
  .name("calibrate-mutation-threshold")
  .description("Derive gates.mutationScoreThreshold from the target repo's own tests")
  .requiredOption("-c, --config <path>", "target's safe-migrate config file")
  .argument("<modulePaths...>", "module paths (relative to target.package) with existing tests")
  .action(async (modulePaths: string[], opts: { config: string }) => {
    const configFsPath = path.resolve(process.cwd(), opts.config);
    const config: SafeMigrateConfig = (await import(pathToFileURL(configFsPath).href)).default;
    config.target.root = path.resolve(path.dirname(configFsPath), config.target.root);
    const packageRoot = path.resolve(config.target.root, config.target.package);

    const scores: number[] = [];

    for (const modulePath of modulePaths) {
      const ctx = await assembleContext(modulePath, config);
      if (!ctx.ownTestPath) {
        console.log(`SKIP ${modulePath}: no existing test found (own-test match)`);
        continue;
      }

      const result = await scoreMutation(modulePath, ctx.ownTestPath, packageRoot, config);
      const qualifies = result.covered >= MIN_COVERED_MUTANTS;
      console.log(
        `${qualifies ? "" : "SKIP (low signal) "}${modulePath}: score=${result.score.toFixed(3)} ` +
        `covered=${result.covered} killed=${result.killed}`,
      );
      if (qualifies) scores.push(result.score);
    }

    if (scores.length === 0) {
      console.log("\nNo qualifying modules — cannot compute a threshold.");
      return;
    }

    scores.sort((a, b) => a - b);
    const p25 = scores[Math.floor(0.25 * (scores.length - 1))];
    console.log(`\n${scores.length} qualifying modules, sorted scores: [${scores.map((s) => s.toFixed(3)).join(", ")}]`);
    console.log(`p25 mutationScoreThreshold: ${p25.toFixed(3)}`);
  });

program.parseAsync();
