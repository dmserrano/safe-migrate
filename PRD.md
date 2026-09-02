# safemigrate — Migration-Aware Characterization Test Generator

**Status:** design
**Owner:** Dominic Serrano
**Target repo for validation:** `GetStream/Winds` (React + Express + MongoDB, last pushed Oct 2021).
API package has an existing test suite; frontend (React) has none.

---

## Problem

Legacy JavaScript applications accumulate dependency debt. Teams defer major upgrades
because there is no test suite to prove the upgrade didn't break anything. The absence of
tests is the reason the migration doesn't happen, and the migration is the reason nobody
writes tests. Both stay undone.

Dependabot handles the trivial half — patch and minor bumps where nothing breaks. The PRs
it opens for major versions sit red for months.

The gap: **generating a safety net good enough to migrate against, on a codebase that
has none.**

## Why an agent, and why this is hard

Asking an LLM to "write tests for this file" is trivial and nearly worthless. It produces
plausible tests that pass and catch nothing. Two failure modes dominate:

1. **Tests that assert nothing meaningful.** High coverage, zero defect detection.
2. **Tests coupled to framework internals.** They break during the migration they were
   supposed to protect, which is worse than having no tests.

The product is not the prompt. **The product is the verification harness that decides
whether generated tests are worth keeping.** The agent is one step inside a deterministic
loop; almost everything else is ordinary software.

## What this is

A CLI and GitHub Action that, given a repo and a set of dependencies slated for upgrade:

- identifies the modules that upgrade will actually touch
- generates behavior-level characterization tests for them
- **verifies each test catches real defects** (mutation testing) before accepting it
- rejects tests that are flaky, trivial, or coupled to internals
- opens one PR per accepted test, and publishes a report of what it rejected and why

## What this is not

- Not a general-purpose test generator. Target selection is driven by the migration.
- Not a correctness checker. These are *characterization* tests in Feathers' sense — they
  lock in current behavior **including bugs**. The assertion is "this did not change,"
  not "this is right."
- Not autonomous. Every test lands via PR with a human reviewer.

---

## Design principles

**The agent may not modify its own verification.** Test files are the agent's output;
the gates that judge them are not agent-writable. Enforced by path restrictions and a
diff check before any PR opens.

**Generated tests must survive the migration they protect.** Enforced as constraints,
not suggestions. See "Constraint rules" below.

**Reject loudly.** A rejected test with a logged reason is a successful outcome, not a
failure. The rejection log is the most credible artifact this project produces.

**Orchestrator runtime is separate from target runtime.** The agent and harness run on
modern Node. The project under test runs in its own pinned container. The target Node
version is a config parameter, because upgrading it is one of the migrations.

---

## Constraint rules (enforced on generated tests)

| Rule | Reason |
|---|---|
| No Enzyme | No React 18 support. Breaks during the migration by construction. |
| No snapshot tests | Break on any markup change, including harmless ones. |
| No assertions on component internals (`state()`, `instance()`, private fields) | Coupled to framework version. |
| No mocking of the module under test | Tests the mock, not the code. |
| Testing Library queries preferred (`getByRole`, `getByLabelText`) | Behavior-level; RTL API has been stable across React versions. |
| No `waitFor` without an explicit assertion inside | Common source of false-passing async tests. |

Violations are detected statically (AST/lint pass) and rejected before the test is run.

---

## Pipeline

```
  ┌────────────────────────────────────────────────────────────┐
  │  1. SELECT      deterministic — no agent                   │
  │     parse dep graph → find modules importing upgrade       │
  │     targets → rank by churn × complexity → drop covered    │
  ├────────────────────────────────────────────────────────────┤
  │  2. CONTEXT     retrieval — no agent                       │
  │     module source, imports, existing test conventions,     │
  │     fixtures, framework versions in play                   │
  ├────────────────────────────────────────────────────────────┤
  │  3. GENERATE    ← the only agent step                      │
  │     Copilot CLI, constrained by rules above                │
  ├────────────────────────────────────────────────────────────┤
  │  4. GATE: static      constraint rules pass?               │
  │  5. GATE: green       test passes against current code?    │
  │       └─ on fail: feed error back, retry (bounded), then   │
  │          abandon and log                                   │
  │  6. GATE: mutation    Stryker score ≥ threshold?           │
  │       └─ THE differentiating gate                          │
  │  7. GATE: stable      3 consecutive identical runs?        │
  ├────────────────────────────────────────────────────────────┤
  │  8. REPORT      accepted / rejected+reason / mutation      │
  │                 score per module / token cost per test     │
  └────────────────────────────────────────────────────────────┘
```

Gate ordering is cheapest-first and bails on first failure: static costs nothing,
mutation costs minutes. A separate **build gate** (does the production build succeed
after the migration?) runs at `migrate` time, not per-generated-test — see M6.

**Bounded retry:** max 3 generation attempts per module, then abandon and log. Unbounded
retry loops burn tokens and hide real failures.

**Mutation scope:** run Stryker only on the module under test, not the repo. Whole-repo
mutation testing is prohibitively slow.

---

## Metrics (the report)

Per run:
- modules attempted / accepted / rejected, with rejection reason breakdown
- mutation score per accepted test
- tokens consumed per accepted test (cost per unit of real coverage)
- wall-clock per module
- retry distribution

Cost-per-accepted-test is the honest number. Cost per *generated* test is marketing.

---

## Milestones

Sized for 5–10 hrs/week. Each milestone ends with something demonstrable.

### M0 — Baseline (1 week)
Does not require Mongo or a running server — those are M6 prerequisites, for the actual
migration run. What M0 actually needs: `npm install` succeeds (or the failure is
recorded, not papered over — `npm install` will likely fail under npm 7+ peer resolution;
document it, don't silently fix it with `--legacy-peer-deps`), the existing API test
suite executes, and a baseline is recorded to a committed file.

The baseline is a **pre-existing-failure baseline**, not a green/red flag. Gates compare
delta from baseline, not absolute pass/fail: a new failure is a rejection, a pre-existing
failure is ignored, and a pre-existing failure that starts passing is flagged — it
signals a behavior change, which matters because these are characterization tests.

Run the suite 3x. Anything that doesn't produce the same result each run goes on a
quarantine list, excluded from gating — a flaky test can't tell you whether a migration
broke something. Both the baseline file and the quarantine list are **not agent-writable**,
same rule as the verification gates in `src/pipeline/gates/**`.

Frontend component tests run in jsdom in-process and don't need a running app either —
Mongo and a live server only enter the picture at M6, when the actual dependency upgrade
runs against the generated suite.

**Done when:** `npm install` completes (or its failure mode is documented), the existing
API suite runs and its baseline is committed, the 3x-stability pass is done and the
quarantine list (if any) is committed, and one frontend component renders under jsdom
manually to confirm the harness *could* target it later.

### M1 — One test, by hand-driven agent (1–2 weeks)
No pipeline. No config. Manually invoke Copilot CLI on one API module with the constraint
rules in the prompt. Get one behavior-level test that passes.

Build order is **API-first**: the harness (M1–M3) is built and debugged against the API
package, where a passing baseline and human-written tests already exist. The frontend is
the M4/M5 port, not the initial target. The harness itself is domain-agnostic, so it's
cheapest to build and debug where an oracle (the existing suite) already exists; the
frontend is where the tool has more leverage long-term — no existing coverage — and
porting to it later is itself a demonstration of the harness's portability. What differs
between API and frontend targets is prompt/exemplars, jsdom + Testing Library setup, and
the frontend-specific constraint rules (Enzyme, snapshots, component internals) — all of
that is config-shaped, which is the architectural claim this project is testing.

Because the API package already has human-written tests, M1 can also do **ground-truth
calibration**: hold out a module's own existing test, generate against the module with
that test excluded from context, and compare the generated test to the held-out one.
Contamination guard: the module's own test must never appear in context. Sibling-module
tests *are* legitimate context — that's how the agent learns repo conventions — so encode
that distinction in `context.js` (own-test exclusion, sibling-test inclusion) rather than
excluding all existing tests.

If the generated test is structurally near-identical to the held-out test, assume
leakage and investigate the context pipeline before trusting the result. Compare on what
the tests *catch* (mutation score), not on how they read — an Enzyme test and an RTL test
asserting the same behavior look nothing alike, and readability isn't the thing being
validated.

**Done when:** one real passing test exists, you can describe where the agent went wrong
on the way there, and the ground-truth comparison against a held-out API test has run at
least once.

### M2 — Generate + green gate (2 weeks)
Steps 3–5, hardcoded target list. Bounded retry with error feedback.
**Done when:** `safemigrate run` produces N passing tests unattended.

### M3 — Mutation gate (2 weeks) ← the important one
Step 6. Stryker integration, per-module scoping, threshold config.
**Done when:** the tool rejects a test that passed but caught nothing, and logs why.
**This is the milestone that makes the project worth showing.**

Mutation threshold calibration can start early — as soon as M0's baseline exists —
because the API package's human-written tests already pass and can be mutation-tested
without waiting on generation. Method: run Stryker against API modules that have
existing human-written tests, compute a per-module mutation score using **covered**
mutants as the denominator (not all mutants — uncovered mutants say nothing about test
quality), exclude modules with fewer than ~10 covered mutants (too little signal) and
anything on the quarantine or baseline-failure lists, and set the threshold at roughly
the **p25** of that distribution.

Rationale: the gate should reject generated tests that are worse than the repo's own
tests. A threshold the existing suite itself would fail is indefensible — it would mean
generated tests are held to a standard the human-written baseline doesn't meet. Expect
wide variance by module type — logic-heavy modules score high, glue/IO-heavy modules
score low. Start with a single global floor; only split the threshold by module category
if the rejection log shows failures clustering by type. Equivalent mutants (mutants that
change the code without changing observable behavior) are a known limitation — they
depress every module's score and there's no clean automated fix, only tolerance built
into the threshold. This replaces the placeholder 0.6 threshold.

### M4 — Selection + report (1–2 weeks)
Steps 1, 2, 8. Migration-aware target ranking. Run report as markdown artifact. Frontend
port: this is where the harness built against the API package (M1–M3) gets pointed at
the untested React frontend, exercising the config-shaped differences called out in M1.
**Done when:** `safemigrate run --upgrade react@18` picks its own targets.

### M5 — Package (1–2 weeks)
npm CLI + composite GitHub Action wrapping the same core. Config schema.
**Done when:** it runs as a GitHub Agentic Workflow on a schedule and opens PRs.

### M6 — Validate against a real migration (1–2 weeks)
Run the actual dependency upgrade against the generated suite. This is also where the
**build gate** matters: after an upgrade, does the production build succeed? It's cheap
to run and catches breakage that unit tests structurally cannot (e.g. a bundler/type
error with no runtime test coverage), so it runs alongside the generated suite as a
condition of a clean migration, not as an accept/reject gate on individual tests.
Whatever happens is the write-up: clean pass proves the net held; a miss is a finding
about coverage gaps and is arguably more interesting.

**Do not build M4–M5 before M3 works.** Selection and packaging are the easy parts and
are worthless if generation and verification don't hold up.

---

## Public artifacts (what makes this demonstrable)

1. **Fork of Winds** with a PR series — one generated test each, mutation score and
   rationale in every PR description.
2. **The rejection log.** Publish the tests the tool threw away with reasons. Most demos
   in this space show only successes, which reads as marketing. Visible rejections read
   as real engineering.
3. **A 30-second terminal recording** — CLI running against Winds, one test generated,
   one rejected on mutation score.
4. **Write-ups per milestone.** What broke, where the agent failed, what changed as a
   result. Failure modes are the credibility signal.

---

## Open questions

- Copilot CLI vs. Copilot SDK for the generation step — CLI is faster to start, SDK may
  give better control over context. Decide at M2.
- Whether to attempt backend (Express route) tests beyond the M1–M3 calibration use, or
  stay frontend-only as the v1 product surface. Current lean: frontend is the product
  (no existing coverage, more compelling migration story), API is the harness's proving
  ground, not a long-term target in its own right.
- Winds' monorepo layout (api / app / workers) — confirm which package to target first
  for the frontend port at M4.

### Backlog: vulnerability-driven selection (M4+)

Rank targets by CVE severity of the dependencies they import, not just churn ×
complexity — this connects the tool to *why* migrations happen in the first place, not
just which files changed most. Filter to production dependencies and reachable import
paths; raw `npm audit` output is too noisy to rank on directly. This does not rebuild
alerting — Dependabot and GitHub Advisory already do that job — the contribution is
narrower: linking a CVE to the specific modules that need coverage before the fix can
safely ship. Not before M4; selection logic doesn't matter until generation and
verification (M1–M3) already hold up.
