/** @type {import('./src/config.js').SafeMigrateConfig} */
export default {
  // Repo under test. Paths are relative to this root.
  target: {
    root: "../winds",
    package: "app",              // monorepo sub-package, or "." for single-package repos
    testGlob: "src/**/*.test.js",
  },

  // The project under test runs in its OWN runtime, pinned separately from the
  // orchestrator. Upgrading this is itself one of the migrations.
  runtime: {
    image: "node:14",
    services: ["mongo:4.4"],
    install: "npm ci --legacy-peer-deps",  // record WHY if this flag is needed
    testCommand: "npx jest",
  },

  // What the migration will touch. Drives target selection (pipeline step 1).
  migration: {
    upgrades: ["react@18", "react-dom@18", "react-router@6"],
  },

  gates: {
    maxGenerationAttempts: 3,
    mutationScoreThreshold: 0.6,   // arbitrary until M3 produces real data
    stabilityRuns: 3,
  },

  agent: {
    // Provider-agnostic by design — the harness only needs something it can shell
    // out to with a prompt and get text back. "copilot-cli" | "claude-cli" |
    // "claude-sdk" | "copilot-sdk". Pick whatever you have a license/API key for;
    // none of the gates care which one produced the test.
    provider: "copilot-cli",
    maxTokensPerModule: 20000,
  },

  output: {
    reportDir: ".safe-migrate/reports",
    rejectionLog: ".safe-migrate/rejected",   // publish this — it is the credibility artifact
  },
};
