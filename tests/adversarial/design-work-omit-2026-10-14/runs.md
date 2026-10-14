# Runs — commands, exit codes, artifacts (2026-10-14)

All commands run with cwd `<repo root>` unless
marked [SCRATCH]. Node v24.21.0 (native TS type stripping). Raw logs in ./logs/.

| # | checkId | command | exit | result | log |
|---|---------|---------|------|--------|-----|
| R1 | baseline-panel-open | node --test --test-concurrency=1 tests/panel-open.test.ts | 0 | 98 tests, 98 pass, 0 fail | project-baseline-panel-open.log |
| R2 | baseline-tsc | npx tsc --noEmit | 0 | clean | project-baseline-tsc.log |
| R3 | adversarial-on-original | node --test --test-concurrency=1 tests/adversarial/design-work-omit-2026-10-14/adversarial-designwork.test.ts | 0 | 9 tests, 9 pass | project-adversarial-green.log |
| R4 | tsc-with-adversarial | npx tsc --noEmit (after adding the adversarial file) | 0 | clean (file type-checks) | project-tsc-with-adversarial.log |
| R5 | scratch-pristine | [SCRATCH] node --test --test-concurrency=1 tests/panel-open.test.ts (copy of the project, node_modules symlinked) | 0 | copy integrity proven | scratch-pristine-panel-open.log |
| R6 | mutant-matrix | [SCRATCH] node driver.mjs — 13 mutants x (apply → red runs → restore → sha256 verify → green runs) | 0 | all 13 QUALIFIED | logs/<mutant>.{red,green}.log, mutant-results.json |
| R7 | equivalence-probe | [SCRATCH] node eq-probe.mjs — omit-BEFORE-sort mutant | 0 | exit=0 on both runs: EQUIVALENT mutant, kills nothing | (console output below) |
| R8 | final-verification | shasum -a 256 panel/api.ts panel/main.ts tests/panel-open.test.ts; R1-R3 re-run | 0 | hashes identical to baseline; all green | logs/final-verification.log |

## Mutant matrix verdicts (R6)

Every mutant: find-string matched EXACTLY once; targeted tests went red; run dir
restored from pristine; mutated file sha256 == pristine sha256; re-run green.

| mutant | fault model | red failing tests (observed) | green after restore |
|--------|-------------|------------------------------|---------------------|
| MA1-ignore-options | options accepted but never consulted | L806, L834, L850, T4, T6 | 0 fail |
| MA2-fuzzy-match | substring/case-insensitive omission | L871, T8, T9 | 0 fail |
| MA3-in-place-sort | sorts the caller's array, not a copy | T6 (TypeError on frozen input) | 0 fail |
| MA4-ascending-sort | recency sort inverted | L764(pre-existing), L850, T7, T6 | 0 fail |
| MA4b-hidden-tiebreak | hidden sessionId tie-break on equal updatedAt | T7 | 0 fail |
| MA5-omit-empty-id | ''-projectId chats collated away | L871 | 0 fail |
| MA6-empty-bypass | omission that empties the list skips the empty state | L834 (allGone) | 0 fail |
| MA7-precedence-swap | chats error outranks projects error | T2 | 0 fail |
| MA8-skip-projects-error-with-opts | omit set swallows the projects error | L820, T2 | 0 fail |
| MA8b-skip-chats-error-with-opts | omit set swallows the chats error | T1 | 0 fail |
| MA9-inverted-predicate | omission predicate inverted | L806, L820, L834, L850, L871, T4, T6, T7, T8, T9 + pre-existing L751/L764/L780 | 0 fail |
| MM1-derive-from-all-projects | omit set built from ALL known projects | T5 (L881 stays GREEN — the gap) | 0 fail |
| MM2-always-pass-opts | omit set passed while filtering | L881, T5 | 0 fail |

R7 console output:
  EQ1 omit-before-sort probe:
    panel-open(pattern): exit=0 failLines=0
    adversarial(full):  exit=0 failLines=0

## Could NOT run / not run

- tests/browser.test.ts, tests/provider.test.ts: excluded by instruction
  (user-confirmed pre-existing environment failures). The rest of the suite was
  not run either — the lane scoped regression evidence to the panel-open file.
- No mutation tool (Stryker/PIT/mutmut/cargo-mutants) is configured in this
  project; per the rules none was installed. The matrix above is the manual
  diff-scoped equivalent.
