/**
 * Dogfooding: mutation-tests safe-migrate's OWN src/ against its own unit suite (npm
 * test) — not gates/mutation.ts, which mutation-tests TARGET modules via docker exec.
 * No container here: our own tests run as plain host subprocesses, so Stryker's
 * normal sandbox copy (not inPlace) just works.
 *
 * Rebuilds (tsc) per mutant via the command runner, coverage analysis off — same
 * tradeoff as mutation.ts, no value in jest/mocha-runner's in-process coupling here.
 *
 * Needs STRYKER_DASHBOARD_API_KEY to actually publish; CI no-ops without it. Excludes
 * the Docker-boundary files (runtime.ts, the gates) from mutate scope — npm test
 * doesn't exercise them, they'd just show as uniformly "survived."
 */
export default {
  mutate: [
    "src/**/*.ts",
    "!src/**/*.test.ts",
    "!src/**/*.itest.ts",
    "!src/cli.ts",
    "!src/scripts/**",
    "!src/pipeline/runtime.ts",
    "!src/pipeline/gates/green.ts",
    "!src/pipeline/gates/mutation.ts",
    "!src/pipeline/gates/stable.ts",
    "!src/pipeline/generate.ts",
    "!src/pipeline/providers.ts",
  ],
  testRunner: "command",
  commandRunner: { command: "npm run build && node --test 'dist/**/*.test.js'" },
  reporters: ["clear-text", "dashboard"],
  coverageAnalysis: "off",
};
