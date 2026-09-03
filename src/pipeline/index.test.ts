/**
 * Control-flow tests for processTarget: gate ordering, bail-on-first-failure,
 * bounded retries. Fake gates/generate — no Docker, no agent CLI.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { processTarget } from "./index.js";
import type { Attempt, Context, Gate, SafeMigrateConfig } from "../types.js";

const FIXTURE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../test/fixtures/target-repo");

function config(overrides: Partial<SafeMigrateConfig["gates"]> = {}): SafeMigrateConfig {
  return {
    target: { root: FIXTURE_ROOT, package: ".", testGlob: "test/*.test.js" },
    runtime: { image: "node:22-alpine", install: "true", testCommand: "node --test" },
    migration: { upgrades: [] },
    agent: { provider: "claude-cli" },
    gates: { maxGenerationAttempts: 3, mutationScoreThreshold: 0.5, stabilityRuns: 3, ...overrides },
  };
}

const okGate: Gate = async () => ({ ok: true });
function failingGate(name: string): Gate {
  const fn: Gate = async () => ({ ok: false, detail: `${name} failed` });
  Object.defineProperty(fn, "name", { value: name });
  return fn;
}

function fakeGenerate(source = "// fake test") {
  return async (_ctx: Context, _config: SafeMigrateConfig, _prior?: Attempt[]) => ({ source });
}

test("accepts when all gates pass, on the first attempt", async () => {
  let generateCalls = 0;
  const generate = async (ctx: Context, cfg: SafeMigrateConfig, prior?: Attempt[]) => {
    generateCalls++;
    return fakeGenerate()(ctx, cfg, prior);
  };

  const result = await processTarget("src/math.js", config(), [okGate, okGate], generate);

  assert.equal(result.status, "accepted");
  assert.equal(result.attempts.length, 1);
  assert.equal(generateCalls, 1);
});

test("bails on the first failing gate — later gates never run", async () => {
  let secondGateCalls = 0;
  const neverCalled: Gate = async () => {
    secondGateCalls++;
    return { ok: true };
  };

  const result = await processTarget(
    "src/math.js",
    config({ maxGenerationAttempts: 1 }),
    [failingGate("firstGate"), neverCalled],
    fakeGenerate(),
  );

  assert.equal(result.status, "rejected");
  assert.equal(secondGateCalls, 0);
  assert.equal(result.reason?.gate, "firstGate");
});

test("retries are bounded at maxGenerationAttempts, then rejects", async () => {
  let attempts = 0;
  const generate = async (ctx: Context, cfg: SafeMigrateConfig, prior?: Attempt[]) => {
    attempts++;
    return fakeGenerate()(ctx, cfg, prior);
  };

  const result = await processTarget("src/math.js", config({ maxGenerationAttempts: 3 }), [failingGate("g")], generate);

  assert.equal(result.status, "rejected");
  assert.equal(attempts, 3);
  assert.equal(result.attempts.length, 3);
});

test("a later attempt can still succeed after earlier ones fail", async () => {
  let call = 0;
  const gate: Gate = async () => {
    call++;
    return call < 3 ? { ok: false, detail: "not yet" } : { ok: true };
  };

  const result = await processTarget("src/math.js", config({ maxGenerationAttempts: 3 }), [gate], fakeGenerate());

  assert.equal(result.status, "accepted");
  assert.equal(result.attempts.length, 3);
});
