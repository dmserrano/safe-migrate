#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import { program } from "commander";
import { run } from "./pipeline/index.js";
import type { SafeMigrateConfig } from "./types.js";

program
  .name("safe-migrate")
  .description("Migration-aware characterization test generator")
  .option("-c, --config <path>", "config file", "./safe-migrate.config.js")
  .option("--only <path>", "single module (use until selection lands at M4)")
  .option("--dry-run", "generate and gate, but do not write or commit")
  .action(async (opts: { config: string; only?: string; dryRun?: boolean }) => {
    // opts.config is relative to the CALLER's cwd, not this file's location —
    // resolve it explicitly before import(), which otherwise resolves relative
    // to cli.js itself.
    const configFsPath = path.resolve(process.cwd(), opts.config);
    const config: SafeMigrateConfig = (await import(pathToFileURL(configFsPath).href)).default;

    // config.target.root is documented as relative to the config file itself (so a
    // config can live anywhere and still say "the repo is next to me"), not to the
    // caller's cwd — same class of bug as the config-path resolution above.
    config.target.root = path.resolve(path.dirname(configFsPath), config.target.root);

    const results = await run(config, { only: opts.only });
    console.table(results.map(({ target, status }) => ({ target, status })));
  });

program.parse();
