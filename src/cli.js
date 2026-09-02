#!/usr/bin/env node
import { program } from "commander";
import { run } from "./pipeline/index.js";

program
  .name("safemigrate")
  .description("Migration-aware characterization test generator")
  .option("-c, --config <path>", "config file", "./safemigrate.config.js")
  .option("--only <path>", "single module (use until selection lands at M4)")
  .option("--dry-run", "generate and gate, but do not write or commit")
  .action(async (opts) => {
    const config = (await import(opts.config)).default;
    const results = await run(config, { only: opts.only });
    console.table(results.map(({ target, status }) => ({ target, status })));
  });

program.parse();
