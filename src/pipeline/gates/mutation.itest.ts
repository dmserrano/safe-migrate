/**
 * Regression guard for two bugs found by hand this session: docker exec not
 * forwarding Stryker's active-mutant env var, and its sandbox dir being invisible to
 * the fixed-path docker exec (fixed via inPlace). Both silently make every mutant
 * "survive" — that's exactly the failure mode this catches.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { scoreMutation } from "./mutation.js";
import type { SafeMigrateConfig } from "../../types.js";

const FIXTURE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test/fixtures/target-repo");

const config: SafeMigrateConfig = {
  target: { root: FIXTURE_ROOT, package: ".", testGlob: "test/*.test.js" },
  runtime: { image: "node:22-alpine", install: "true", testCommand: "node --test" },
  migration: { upgrades: [] },
  agent: { provider: "claude-cli" },
  gates: { maxGenerationAttempts: 3, mutationScoreThreshold: 0.5, stabilityRuns: 3 },
};

const REAL_TEST_REL_PATH = "test/math.test.js"; // the fixture's own real test

test("a real test kills a nonzero share of mutants", { timeout: 120_000 }, async () => {
  const result = await scoreMutation("src/math.js", REAL_TEST_REL_PATH, FIXTURE_ROOT, config);
  assert.ok(result.covered > 0, "expected at least one covered mutant");
  assert.ok(result.killed > 0, "a real test with real assertions should kill at least one mutant");
  assert.ok(result.score > 0);
});

test("a trivial test kills nothing", { timeout: 120_000 }, async () => {
  const weakTestPath = "test/weak.itest-temp.test.js";
  const fs = await import("node:fs/promises");
  const absPath = path.join(FIXTURE_ROOT, weakTestPath);
  await fs.writeFile(
    absPath,
    `
    import assert from "node:assert/strict";
    import { test } from "node:test";
    import { add, isEven } from "../src/math.js";
    test("functions exist", () => {
      assert.equal(typeof add, "function");
      assert.equal(typeof isEven, "function");
    });
    `,
    "utf8",
  );

  try {
    const result = await scoreMutation("src/math.js", weakTestPath, FIXTURE_ROOT, config);
    assert.equal(result.killed, 0);
    assert.equal(result.score, 0);
  } finally {
    await fs.rm(absPath, { force: true });
  }
});
