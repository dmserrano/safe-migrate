/**
 * Real Docker via testcontainers — no mocking the container boundary. Slow; run via
 * `npm run test:integration`, not `npm test`.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startTargetRuntime } from "./runtime.js";
import type { SafeMigrateConfig } from "../types.js";

const FIXTURE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../test/fixtures/target-repo");

const config: SafeMigrateConfig = {
  target: { root: FIXTURE_ROOT, package: ".", testGlob: "test/*.test.js" },
  runtime: { image: "node:22-alpine", install: "true", testCommand: "node --test" },
  migration: { upgrades: [] },
  agent: { provider: "claude-cli" },
  gates: { maxGenerationAttempts: 3, mutationScoreThreshold: 0.5, stabilityRuns: 3 },
};

test("startTargetRuntime execs real commands in the pinned target image", async () => {
  const session = await startTargetRuntime(FIXTURE_ROOT, config);
  try {
    const passing = await session.exec("node --test test/math.test.js");
    assert.equal(passing.ok, true);
    assert.equal(passing.exitCode, 0);

    const failing = await session.exec("node -e 'process.exit(7)'");
    assert.equal(failing.ok, false);
    assert.equal(failing.exitCode, 7);
  } finally {
    await session.stop();
  }
});

test("session.exec reuses the same container across calls", async () => {
  const session = await startTargetRuntime(FIXTURE_ROOT, config);
  try {
    // /tmp is container-local (not bind-mounted) — only readable back if this exec
    // landed in the same container as the write, proving persistence across calls.
    await session.exec("echo hello > /tmp/marker.txt");
    const read = await session.exec("cat /tmp/marker.txt");
    assert.equal(read.output.trim(), "hello");
  } finally {
    await session.stop();
  }
});
