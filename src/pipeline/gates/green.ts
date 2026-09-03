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
import type { Gate } from "../../types.js";

const OUTPUT_TAIL_CHARS = 2000;

export const gateGreen: Gate = async (source, ctx, config) => {
  const packageRoot = path.resolve(config.target.root, config.target.package);
  const testDir = ctx.ownTestPath ? path.dirname(ctx.ownTestPath) : globBaseDir(config.target.testGlob);
  const tempRelPath = path.join(testDir, `${moduleStem(ctx.modulePath)}.safemigrate-generated.${crypto.randomUUID()}.js`);
  const tempAbsPath = path.join(packageRoot, tempRelPath);

  await fs.mkdir(path.dirname(tempAbsPath), { recursive: true });
  await fs.writeFile(tempAbsPath, source, "utf8");

  try {
    const scopedCommand = scopeToFile(config.runtime.testCommand, config.target.testGlob, tempRelPath);
    const result = await runInTargetRuntime(scopedCommand, packageRoot, config);

    return result.ok
      ? { ok: true }
      : { ok: false, detail: result.output.slice(-OUTPUT_TAIL_CHARS) };
  } finally {
    await fs.rm(tempAbsPath, { force: true });
  }
};

// Substitute the literal testGlob if present in testCommand; else append the file,
// which most runners (jest, mocha, vitest) accept as a positional scope argument.
function scopeToFile(testCommand: string, testGlob: string, relPath: string): string {
  return testCommand.includes(testGlob)
    ? testCommand.replaceAll(testGlob, relPath)
    : `${testCommand} ${relPath}`;
}

function globBaseDir(glob: string): string {
  const parts = glob.split("/");
  const idx = parts.findIndex((p) => /[*{}]/.test(p));
  return parts.slice(0, idx === -1 ? parts.length : idx).join("/") || ".";
}
