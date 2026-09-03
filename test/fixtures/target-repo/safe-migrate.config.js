/**
 * Config for the integration-test fixture — NOT a real target repo. Trivial, no
 * dependencies, boots in seconds. Real target-repo config lives in
 * safe-migrate.config.example.js.
 */
export default {
  target: {
    root: "./",
    package: ".",
    testGlob: "test/*.test.js",
  },
  runtime: {
    image: "node:22-alpine",
    install: "true", // no dependencies — nothing to install
    testCommand: "node --test",
  },
  migration: {
    upgrades: [],
  },
  gates: {
    maxGenerationAttempts: 3,
    mutationScoreThreshold: 0.5,
    stabilityRuns: 3,
  },
  agent: {
    provider: "claude-cli",
  },
};
