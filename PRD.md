# safe-migrate — Migration-Aware Characterization Test Generator

**Status:** design
**Owner:** Dominic Serrano
**Target repo for validation:** `GetStream/Winds` (React + Express + MongoDB, last pushed Oct 2021).
API package has an existing test suite; frontend (React) has none.

**End goal vs. v1 validation target.** The tool is not "a React 18 migrator for Winds."
The end goal is a repo-agnostic tool for any legacy JS codebase facing any breaking
package upgrade (framework major version, Node runtime, anything Dependabot leaves red).
Winds is the *validation target through M0–M3* — the harness is built and debugged there
because it already has a usable oracle (its API test suite). The config schema
(`safe-migrate.config.js`) is deliberately shaped to generalize from day one — `target`,
`runtime`, and `migration` are already parameters, not hardcoded — so M4/M5 is a
verification pass on that claim (does anything Winds-specific leak into
`src/pipeline/**`?), not a rewrite. See M4 and M6 below for how this affects done-when.

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
  │     Provider-agnostic CLI/SDK, constrained by rules above  │
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
No pipeline. No config. Manually invoke an agent CLI (Copilot, Claude Code, whatever
you have a license for — provider-agnostic by design, see Open Questions) on one API
module with the constraint rules in the prompt. Get one behavior-level test that passes.

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
**Done when:** `safe-migrate run` produces N passing tests unattended.

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

This is also the checkpoint for the end-goal claim in the header: before or alongside the
frontend port, audit `src/pipeline/**` for anything that only works because it's Winds —
a hardcoded path, an assumption about `app`/`api` package layout, a Winds-specific
fixture. Everything repo-specific should already live in `safe-migrate.config.js` or in
prompt exemplars, not in pipeline code. If it doesn't, that's a bug to fix at M4, not a
reason to defer generalization to a later phase — the config schema was written to make
this a verification pass, not a rewrite.

**Done when:** `safe-migrate run --upgrade react@18` picks its own targets, and the
pipeline-code audit above turns up nothing that only works for Winds.

### M5 — Package (1–2 weeks)
npm CLI + composite GitHub Action wrapping the same core. Config schema. "Live" here means
CI/Action-triggerable against the target repo's current default branch — no additional
re-baselining logic beyond what M0's delta-based gating already provides.
**Done when:** it runs as a GitHub Agentic Workflow on a schedule and opens PRs.

### M6 — Validate against a real migration (1–2 weeks)
Run the actual dependency upgrade against the generated suite. This is also where the
**build gate** matters: after an upgrade, does the production build succeed? It's cheap
to run and catches breakage that unit tests structurally cannot (e.g. a bundler/type
error with no runtime test coverage), so it runs alongside the generated suite as a
condition of a clean migration, not as an accept/reject gate on individual tests.
Whatever happens is the write-up: clean pass proves the net held; a miss is a finding
about coverage gaps and is arguably more interesting.

Winds is the intended target, but not a hard requirement — as of this writing it hasn't
been confirmed to boot end-to-end. If Winds can't reach a live-runnable state by M6, run
this milestone against a substitute repo instead (any legacy JS repo with a real breaking
upgrade pending); the substitution is itself acceptable evidence that the tool
generalizes, precisely because M4 was the milestone that made that possible. Don't block
M6 on fixing Winds specifically.

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

- Agent provider for the generation step is deliberately not pinned to one vendor.
  `config.agent.provider` selects it (`copilot-cli`, `claude-cli`, `claude-sdk`,
  `copilot-sdk`, ...); `generate.js` only needs a prompt in, text out, so no gate cares
  which one produced the test. **Resolved at M2 (ticket 05): CLI over SDK for both
  implemented providers** — zero extra dependency, and this step never needed an SDK's
  finer context control, just prompt-in/text-out. `claude-cli` and `copilot-cli` are
  NOT symmetric in practice: `claude-cli` runs `--restricted` (no filesystem tools),
  making it a genuine text-in/text-out call; `copilot-cli` requires `--allow-all-tools`
  to run non-interactively at all and is unavoidably agentic — it explores the
  filesystem on its own initiative and writes its output to a file rather than
  returning text (observed directly in ticket 02's calibration), which is why the
  own-test move-aside/restore in `generate.ts` is load-bearing, not defense in depth.
  `claude-sdk`/`copilot-sdk` remain unimplemented (throw clearly rather than no-op).
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

### Backlog: config-populating `init` step (post-M5)

`safe-migrate.config.js` is hand-authored through M5 — `target`, `runtime`, and
`migration` are written by a human pointing the tool at a repo. A stretch goal: an `init`
(or a `generate`-time pre-pass) that inspects the target repo and proposes values instead
— detected pinned Node/container version, an existing test command, dependency versions
eligible for a major bump — leaving the human to confirm rather than transcribe.

Deliberately out of scope before the config schema itself has stabilized (ticket 17,
M5): inferring wrong values is worse than an honest manual step, since a bad `runtime`
guess silently corrupts the green gate rather than failing loudly. Revisit once the
schema is locked and there's a corpus of real configs (Winds + at least one substitute
repo from M6) to validate detection heuristics against.

### Backlog: mutation score is a floor, not proof of migration-safety (M3+)

Mutation score answers "if a line of this module changes, does the test notice?" — a
proxy for whether a test does anything real. It does not answer the question this tool
actually exists to answer: will the test catch a regression from *the specific
dependency upgrade in play* (a React 18 rendering/timing change, a Mongo driver behavior
change)? A test can score well on arbitrary code mutations while never exercising the
API surface the migration will actually touch. The M1 calibration surfaced this
concretely: a generated characterization test for `isURL` can be solid by mutation-score
standards while having nothing to do with, say, a `normalize-url` major-version bump's
actual behavior changes.

Not solving this now — it needs real data from M3's mutation gate in production first
to know whether it's a real gap in practice or a theoretical one. Possible directions to
revisit later: weighting mutants near the migration's actual API surface more heavily,
or a separate "exercises the changing surface" check alongside (not instead of) mutation
score. Keep mutation score as the M3 floor either way — this is about whether it's
*sufficient*, not whether it's *wrong*.

### Backlog: npm package distribution (post-M5)

The tool should be installable (`npm install -g safe-migrate` / `npx safe-migrate`), not
just run from a checked-out clone. Gaps beyond what already exists (`bin` entry,
`type: module`, `engines`):

- A `files`/`exports` allowlist in `package.json` — nothing currently scopes what a
  publish would ship.
- Config discovery. Today `-c/--config` is a single hardcoded relative flag
  (`./safe-migrate.config.js`). An installed CLI wants `cosmiconfig`-style walk-up
  discovery (`safe-migrate.config.js`, or a `package.json#safe-migrate` key), matching the
  eslint/prettier convention this tool is implicitly promising by shape.
- A repo-relative-assumption audit — anything that currently assumes it's running from
  inside a sibling checkout of safe-migrate rather than `node_modules/.bin` in an
  arbitrary target repo. This is the same audit already scoped in the M4
  pipeline-generalization ticket; distribution just makes it non-optional.
- Versioning/publish process (semver discipline, publish access) — process, not code.

Not blocking M0-M5. Revisit once the harness has proven itself against Winds and the
question shifts from "does this work" to "can someone else install this against their
own repo."

### Backlog: constraint rules are hardcoded to one framework's assumptions (M4+)

`src/constraints.ts`'s `CONSTRAINTS` list (no Enzyme, no snapshots, no internals
assertions, no self-mock, no empty `waitFor`) is a fixed array baked into the harness.
It works only because it happens to match the current target's stack (React/Jest-shaped
tests). A different repo or framework (Vue, Angular, a non-React backend, a repo not
using Jest's `waitFor`/snapshot vocabulary at all) would need different rules, and
there's no seam for that today short of hand-editing this file per target — which
conflicts with the PRD's stated end goal of "any legacy JS repo, any breaking upgrade."

Not solving now — flagged during ticket work while deduping the constraint id strings
into a typed const, as a "we'll need this eventually" observation, not a current defect.
Revisit alongside M4's pipeline-generalization audit (ticket 12): likely direction is
config-driven or framework-detected rule sets rather than one hardcoded list, but that's
a real design decision (how much control does a repo owner get over the rules vs. how
much are they fixed invariants of "characterization test" itself?) worth its own pass,
not a quick fix.
