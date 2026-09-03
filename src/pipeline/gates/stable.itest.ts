import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gateStable } from "./stable.js";
import type { Context, SafeMigrateConfig } from "../../types.js";

const FIXTURE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../test/fixtures/target-repo");

const config: SafeMigrateConfig = {
  target: { root: FIXTURE_ROOT, package: ".", testGlob: "test/*.test.js" },
  runtime: { image: "node:22-alpine", install: "true", testCommand: "node --test" },
  migration: { upgrades: [] },
  agent: { provider: "claude-cli" },
  gates: { maxGenerationAttempts: 3, mutationScoreThreshold: 0.5, stabilityRuns: 3 },
};

const ctx: Context = { modulePath: "src/math.js", source: null, imports: [], conventions: null, ownTestPath: null };

const STABLE_TEST = `
import assert from "node:assert/strict";
import { test } from "node:test";
import { add } from "../src/math.js";
test("adds", () => { assert.equal(add(2, 3), 5); });
`;

// Fails on every other run, deterministically, by counting on disk — a REAL flaky
// test's mechanism doesn't matter here, only that it's genuinely unstable across
// separate `node --test` process invocations (which don't share memory).
const COUNTER_PATH = path.join(FIXTURE_ROOT, ".flaky-counter");
const FLAKY_TEST = `
import fs from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
test("flaky", () => {
  const p = new URL("../.flaky-counter", import.meta.url);
  let n = 0;
  try { n = Number(fs.readFileSync(p, "utf8")); } catch {}
  fs.writeFileSync(p, String(n + 1));
  assert.equal(n % 2, 0);
});
`;

test("gateStable passes a genuinely deterministic test", async () => {
  const result = await gateStable(STABLE_TEST, ctx, config);
  assert.equal(result.ok, true);
});

test("gateStable catches a test that flips between runs", async () => {
  await fs.rm(COUNTER_PATH, { force: true });
  try {
    const result = await gateStable(FLAKY_TEST, ctx, config);
    assert.equal(result.ok, false);
    assert.match(result.detail ?? "", /flaky/i);
  } finally {
    await fs.rm(COUNTER_PATH, { force: true });
  }
});
