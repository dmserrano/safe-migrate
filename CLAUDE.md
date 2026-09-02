# CLAUDE.md

Read `PRD.md` before writing any code. It carries the reasoning behind the design;
this file carries the working rules.

## What this project is

A migration-aware characterization test generator for legacy JS codebases. It generates
behavior-level tests for modules a dependency upgrade will touch, then **verifies each
test catches real defects** before accepting it.

**The agent is not the product. The verification harness is.** Generation is one step
inside a deterministic loop. If logic starts accumulating in prompts instead of in the
harness, that is a design regression — say so rather than continuing.

Validation target: a fork of `GetStream/Winds` (React + Express + Mongo, last pushed
Oct 2021). The API package has an existing test suite; the frontend does not. The
harness (M1-M3) is built against the API package, where a baseline and human-written
tests already exist; the frontend is the M4/M5 port.

## Build order — this is the important rule

Implement in milestone order. See PRD § Milestones.

    M0 baseline → M1 one test by hand → M2 generate+green → M3 mutation gate
    → M4 selection+report → M5 package → M6 real migration

**Do not implement M4 or M5 before M3 works.** Selection and packaging are the easy parts
and are worthless if generation and verification don't hold up. Unimplemented stubs throw
with a TODO naming their milestone; leave them throwing until their milestone arrives.

**Do not fill in multiple stubs at once** because they look incomplete. They are
deliberately incomplete.

If asked to work on something out of order, flag the ordering problem before proceeding.

## Constraints on generated tests

These are enforced in `src/constraints.js`, and the reasons matter — a test coupled to
framework internals breaks during the migration it was supposed to protect.

- No Enzyme (no React 18 support)
- No snapshot tests (break on harmless markup changes)
- No assertions on component internals (`.state()`, `.instance()`)
- No mocking the module under test
- No `waitFor` with an empty callback
- Prefer Testing Library queries (`getByRole`, `getByLabelText`)

Generated tests are **characterization** tests in Feathers' sense: they lock in current
behavior *including bugs*. The assertion is "this did not change," not "this is correct."
Do not fix bugs discovered while writing tests — capture them.

The regex checks in `constraints.js` are a placeholder. Replace with an AST pass
(`@babel/parser` + traverse) before M3; regex false-positives on strings and comments.

## Architecture rules

**The agent may not modify its own verification.** Test files are agent output; the gates
that judge them are not agent-writable. Never edit `src/pipeline/gates/**` or
`src/constraints.js` in the course of making a generated test pass. The same rule applies
to the M0 pre-existing-failure baseline and quarantine list once they exist — the agent
compares against them, it does not edit them to make a run look cleaner.

**Orchestrator runtime ≠ target runtime.** The harness runs on modern Node. The repo under
test runs in its own pinned container (`config.runtime.image`). The target Node version is
a config parameter because upgrading it is one of the migrations. Never hardcode it.

**Gates run cheapest-first and bail on first failure:** static → green → stable → mutation.
Static costs nothing; mutation costs minutes. Preserve this ordering.

**Rejection is a successful outcome.** A rejected test with a logged reason is the point,
not an error path. The rejection log is the project's most credible public artifact —
never silently drop a rejected attempt.

**Bounded retries.** Max 3 generation attempts per module, then abandon and log. Never
add unbounded retry loops.

## Metrics

Report cost per **accepted** test. Cost per generated test is a vanity metric.
Coverage percentage is not a quality signal here — mutation score is.

## Conventions

- Node 20+, ESM, plain JS (matching the target repo; no TS build step)
- Single package, clean module boundaries. **Not a monorepo** — workspace tooling is
  overhead that buys nothing at this size.
- Two commands over shared internals once M6 lands:
  `generate` (build the net) and `migrate` (run the upgrade against it)

## Open decisions — ask, don't assume

- Copilot CLI vs. Copilot SDK for generation (decide at M2)
- Mutation score threshold (0.6 is a placeholder; M3 sets it from the p25 of covered-mutant
  scores on the API package's existing tests — see PRD § M3)
- Whether backend/API test generation is a v1 product surface or stays a harness proving
  ground only, with frontend as the actual target (see PRD § Open questions)

## Things to do by hand, not with an agent

M0 and M1. Getting `npm install` and the existing API suite running, and invoking
Copilot CLI manually on one API module, is how the failure modes get learned, and
knowing which generated tests to reject is the entire value of this tool. Automate
from M2.
