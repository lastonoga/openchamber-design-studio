# Tests written

Test file: `tests/root-workspace-breaker.test.ts`, project framework `node:test` + Node assertions. Historical text fixture: `fixtures/design-studio-harness.before.txt` inside this ledger, verified byte-identical to the genuine supplied backup. Test resolves it via `new URL(..., import.meta.url)` and has no disposable-fixture path dependency. Two tests, neither skipped. Host boundary uses the real panel/API modules copied unchanged to bounded scratch; generated disk plugin imports execute real hooks with recording session adapters. Mutants never touch production.

Portable-fixture review correction verified afresh: R1 mutant exit 1 (one PUT/move/new child), R2 mutant exit 1 (one move/new child), restored focused tests exit 0 (2 pass/0 skips), typecheck exit 0, all nine production hashes unchanged. Scratch root still prefers the approved directory and falls back to `tmpdir()`.

| Test | Current | Adequacy |
|---|---|---|
| R1 current panel cannot arm delayed already-loaded old plugin after harness rejection | PASS | PASS: `restore-isolation-write` reproduces historical PUT shape in scratch, maps its actual recorded query/body to fake project files, then genuine old callback creates a child and records a move. Restored current panel prevents all three. |
| R2 refresh actual old disk artifact ignores stale and late requests without altering root or legacy fixtures | PASS | PASS: `keep-old-plugin` neutralizes refresh by substituting genuine frozen generated source for the writer's candidate source. Importing actual disk artifact then records a move and adds a child directory. Restored writer leaves inventory unchanged. |

R2 additionally verifies harness injection and nudge sequence `[false,true,true,false]` for T-before-edit, S-after-edit, T-after-edit, S-after-consumption. Conservation asserts SHA-256 and paths against independent fixture state captured before refresh, with an explicit expected late-file addition; it never asserts disk output equals the same generator expression. Handwritten refusal is auxiliary existing-guard coverage, not a third adequacy-passed claim.

Fixture setup initially missed `host.onSessions`, causing an SDK subscription timeout (~20 seconds) after successful R1. Stubbed subscription now resolves to no-op unsubscribe; no mount `onReady` is triggered and no polling interval starts. Current focused runs finish in ~170 ms. Initial synthetic PUT shape was corrected to the genuine immutable baseline's `/config` + `query.dir` + `{path,text}` contract before final evidence. No production defect inferred from fixture shortcomings.
