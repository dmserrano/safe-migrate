# testgen

Migration-aware characterization test generator for legacy JS codebases.

Generates behavior-level tests for modules a dependency upgrade will touch, then
**verifies each test catches real defects** before accepting it. Rejects tests that are
flaky, trivial, or coupled to framework internals.

See [PRD.md](./PRD.md) for design, rationale, and milestones.

## Status

Scaffold. Nothing is implemented yet. Build in milestone order (PRD § Milestones):

- [ ] **M0** Baseline — get target repo running in a pinned runtime
- [ ] **M1** One test, hand-driven agent
- [ ] **M2** Generate + green gate
- [ ] **M3** Mutation gate ← the one that matters
- [ ] **M4** Selection + report
- [ ] **M5** Package as GitHub Action
- [ ] **M6** Validate against a real migration

Implemented today: `src/constraints.js`, `src/pipeline/gates/static.js`.
Everything else throws with a TODO naming its milestone.

## Usage (once M2 lands)

```bash
cp testgen.config.example.js testgen.config.js
npx testgen --only src/components/Article.js --dry-run
```
