/**
 * GATE 5 — does the test pass against current code?
 *
 * Runs inside the TARGET runtime container (config.runtime.image). Command is scoped
 * to just the generated test file so a pre-existing repo failure can't get
 * misattributed to it — the rest of the suite never runs in this gate.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { moduleStem } from "../../paths.js";
import { runInTargetRuntime } from "../runtime.js";
import type { Context, SafeMigrateConfig, Gate } from "../../types.js";

const OUTPUT_TAIL_CHARS = 2000;

// Writes the generated test into the target repo's test dir under a unique temp name,
// runs fn, always cleans up. Shared by green and mutation gates.
export async function withGeneratedTestFile<T>(
  source: string,
  ctx: Context,
  config: SafeMigrateConfig,
  fn: (packageRoot: string, tempRelPath: string) => Promise<T>,
): Promise<T> {
  const packageRoot = path.resolve(config.target.root, config.target.package);
  const testDir = ctx.ownTestPath ? path.dirname(ctx.ownTestPath) : globBaseDir(config.target.testGlob);
  const tempRelPath = path.join(testDir, `${moduleStem(ctx.modulePath)}.safe-migrate-generated.${crypto.randomUUID()}.js`);
  const tempAbsPath = path.join(packageRoot, tempRelPath);

  await fs.mkdir(path.dirname(tempAbsPath), { recursive: true });
  await fs.writeFile(tempAbsPath, source, "utf8");

  try {
    return await fn(packageRoot, tempRelPath);
  } finally {
    await fs.rm(tempAbsPath, { force: true });
  }
}

export const gateGreen: Gate = async (source, ctx, config) => {
  return withGeneratedTestFile(source, ctx, config, async (packageRoot, tempRelPath) => {
    const scopedCommand = scopeToFile(config.runtime.testCommand, config.target.testGlob, tempRelPath);
    const result = await runInTargetRuntime(scopedCommand, packageRoot, config);

    return result.ok
      ? { ok: true }
      : { ok: false, detail: result.output.slice(-OUTPUT_TAIL_CHARS) };
  });
};

// Substitute the literal testGlob if present in testCommand; else append the file,
// which most runners (jest, mocha, vitest) accept as a positional scope argument.
export function scopeToFile(testCommand: string, testGlob: string, relPath: string): string {
  return testCommand.includes(testGlob)
    ? testCommand.replaceAll(testGlob, relPath)
    : `${testCommand} ${relPath}`;
}

function globBaseDir(glob: string): string {
  const parts = glob.split("/");
  const idx = parts.findIndex((p) => /[*{}]/.test(p));
  return parts.slice(0, idx === -1 ? parts.length : idx).join("/") || ".";
}
