import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gateGreen, withGeneratedTestFile } from "./green.js";
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

const PASSING_TEST = `
import assert from "node:assert/strict";
import { test } from "node:test";
import { add } from "../src/math.js";
test("adds", () => { assert.equal(add(2, 3), 5); });
`;

const FAILING_TEST = `
import assert from "node:assert/strict";
import { test } from "node:test";
import { add } from "../src/math.js";
test("adds wrong", () => { assert.equal(add(2, 3), 999); });
`;

test("gateGreen passes a real correct test", async () => {
  const result = await gateGreen(PASSING_TEST, ctx, config);
  assert.equal(result.ok, true);
});

test("gateGreen fails a genuinely broken test, with useful detail", async () => {
  const result = await gateGreen(FAILING_TEST, ctx, config);
  assert.equal(result.ok, false);
  assert.match(result.detail ?? "", /999|AssertionError|fail/i);
});

test("withGeneratedTestFile cleans up the temp file even on failure", async () => {
  let capturedPath = "";
  await withGeneratedTestFile(PASSING_TEST, ctx, config, async (packageRoot, tempRelPath) => {
    capturedPath = path.join(packageRoot, tempRelPath);
    const exists = await fs.access(capturedPath).then(() => true, () => false);
    assert.equal(exists, true);
  });

  const existsAfter = await fs.access(capturedPath).then(() => true, () => false);
  assert.equal(existsAfter, false);
});
