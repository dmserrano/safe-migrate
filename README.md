<div align="center">

# safe-migrate

**Verified characterization tests for JS apps facing breaking dependency upgrades.**

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node >=20](https://img.shields.io/badge/node-%3E%3D20-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![status: pre-alpha](https://img.shields.io/badge/status-pre--alpha-orange)](#status)

[Why](#why) · [How it works](#how-it-works) · [Quickstart](#quickstart) · [Constraints](#constraints-on-generated-tests) · [Status](#status) · [Roadmap](#roadmap)

</div>

---

JS apps fall behind on dependencies fast. Dependabot will tell you a package is a couple
major versions behind — it won't tell you whether upgrading is safe. Without tests that actually
exercise current behavior, "is this safe to merge" becomes a manual audit every time, so
the PR sits red and the debt compounds.

**safemigrate** generates that safety net on demand: characterization tests for the
modules a specific upgrade will touch, verified against real defects before they're kept.

## Why

Asking an LLM to "write tests for this file" is easy and nearly worthless — it produces
plausible tests that pass and catch nothing. Two failure modes dominate:

- **Tests that assert nothing meaningful.** High coverage, zero defect detection.
- **Tests coupled to framework internals.** They break during the exact migration they
  were supposed to protect — worse than no test at all.

safemigrate treats generation as the *cheap, disposable* step and verification as the
product:

> **The agent is not the product. The verification harness is.**

Every generated test has to survive a gate pipeline before it's allowed to exist. Gates
run cheapest-first and bail on the first failure:

```mermaid
flowchart LR
    A["SELECT<br/>dep graph → touched modules"] --> B["CONTEXT<br/>source, fixtures, conventions"]
    B --> C["GENERATE<br/>agent, constrained"]
    C --> D{"static gate<br/>free"}
    D -- fail --> R["rejected + logged"]
    D -- pass --> E{"green gate<br/>seconds"}
    E -- "fail, retry ≤3" --> C
    E -- "fail, exhausted" --> R
    E -- pass --> F{"mutation gate<br/>minutes"}
    F -- fail --> R
    F -- pass --> G{"stability gate<br/>3x identical"}
    G -- fail --> R
    G -- pass --> H["REPORT<br/>accepted"]
```

- **static** — AST pass rejects Enzyme, snapshots, internals-poking, self-mocking
- **green** — does it pass against the code as it exists today?
- **mutation** — does it actually *catch* injected bugs, via [Stryker](https://stryker-mutator.io)?
  This is the gate that separates safemigrate from "LLM writes some tests."
- **stability** — does it pass 3 consecutive identical runs, or is it flaky?

A rejected test with a logged reason is a **successful outcome**, not an error path — the
rejection log is the most credible artifact this tool produces. Most demos in this space
show only successes; that reads as marketing.

### Runtime separation

The orchestrator and the code under test never share a Node version. The orchestrator
runs modern Node; the target repo runs in its own pinned container, because upgrading
*that* runtime is itself one of the migrations this tool needs to support:

```mermaid
flowchart TB
    subgraph Orchestrator["orchestrator — modern Node 20+, this repo's own runtime"]
        SEL["SELECT / CONTEXT"]
        GEN["GENERATE — agent call"]
        STATIC["static gate — AST check"]
        REPORT["REPORT"]
    end
    subgraph Container["target runtime container — config.runtime.image, pinned"]
        GREEN["green gate — run test against current code"]
        MUT["mutation gate — Stryker, scoped to one module"]
        STABLE["stability gate — 3x run"]
    end
    SEL --> GEN --> STATIC
    STATIC -- pass --> GREEN
    STATIC -. reject .-> REPORT
    GREEN --> MUT --> STABLE --> REPORT
```

## How it works

```
$ safemigrate --only src/components/Article.js --dry-run

┌─────────────────────────┬───────────┬────────────────┬──────────┐
│ target                  │ status    │ mutation score │ retries  │
├─────────────────────────┼───────────┼────────────────┼──────────┤
│ src/components/Article  │ accepted  │ 0.81           │ 0       │
│ src/components/Feed     │ rejected  │ 0.42 (< 0.60)  │ 3       │
└─────────────────────────┴───────────┴────────────────┴──────────┘
```

Generated tests are **characterization tests** — a term from Michael Feathers' *Working
Effectively with Legacy Code*, meaning a test that pins down what the code *currently*
does, bugs included, rather than asserting what it *should* do. The assertion is "this
did not change," not "this is correct." safemigrate does not fix bugs it finds; it
captures them so the migration doesn't silently change behavior nobody signed off on.

## Quickstart

> The pipeline above is real but not fully wired — see [Status](#status).
> This section describes the target UX, not what runs today.

```bash
npm install -g safemigrate   # not published yet
cp node_modules/safemigrate/safemigrate.config.example.js safemigrate.config.js
```

```js
// safemigrate.config.js
export default {
  target: { root: "../my-legacy-app" },
  runtime: { image: "node:16" },       // the app's own pinned runtime, not yours
  migration: { package: "react", from: "16", to: "18" },
  agent: { provider: "claude-cli" },
};
```

```bash
npx safemigrate --only src/components/Article.js --dry-run
```

## Constraints on generated tests

Enforced by an AST pass (`src/constraints.js`), not a linter suggestion — a test coupled
to framework internals breaks during the migration it was supposed to protect.

| Rule | Why |
|---|---|
| No Enzyme | No React 18 support — breaks by construction |
| No snapshot tests | Break on harmless markup changes |
| No `.state()` / `.instance()` / internals | Coupled to framework version, not behavior |
| No mocking the module under test | Tests the mock, not the code |
| No `waitFor` with an empty callback | Common source of false-passing async tests |
| Prefer `getByRole` / `getByLabelText` | Behavior-level; stable across React versions |

## Status

WIP

## Roadmap

- [ ] Publish to npm once M5 packaging lands
- [ ] GitHub Action for CI-triggered migrations
- [ ] Provider-agnostic generation (`claude-cli`, `copilot-cli`, SDKs — see PRD § Open questions)

## Contributing

Pre-alpha, single maintainer, milestone-gated — not yet looking for external
contributions. Issues and design feedback are welcome.

## License

MIT
