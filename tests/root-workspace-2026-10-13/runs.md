# Actual runs — 2026-10-13

## Fresh review correction: portable historical fixture

| Command/check | Exit | Actual result |
|---|---:|---|
| Python byte comparison of ledger fixture against supplied backup | 0 | `byte_equal: true`, both 12762 bytes; both SHA-256 `d1a68317fa1be2d922f5150d26367be1d0dd9483749412302b01833844e65504` |
| `ROOT_WORKSPACE_BREAKER_MUTANT=restore-isolation-write npm test -- --test-name-pattern='R1 ' tests/root-workspace-breaker.test.ts` | 1 | Intended relocation assertion; 1 fail, 194.49625 ms |
| `ROOT_WORKSPACE_BREAKER_MUTANT=keep-old-plugin npm test -- --test-name-pattern='R2 ' tests/root-workspace-breaker.test.ts` | 1 | Intended inventory/move assertion; 1 fail, 199.657375 ms |
| `npm run typecheck` | 0 | `tsc --noEmit`, no diagnostics |
| `npm test -- tests/root-workspace-breaker.test.ts` after both mutants | 0 | 2 pass, 0 fail/skips, 128.364125 ms |
| Production/source-path check | 0 | `checked_production: 9`, changed `{}`, `test_uses_relative_fixture: true`, `test_mentions_disposable_fixture: false` |

Portable R1 failure retains the exact assertion at line 150: `current delivery must not arm old plugin relocation, even when refresh fails`; actual one PUT/move and new `.design-studio`/`designs`, expected zero. Portable R2 failure retains line 195: `refresh/context must preserve root, existing child, screenshots and request bytes/paths`; actual move destination `root-workspace-breaker-6HZlJS/refresh-project-Pq4FlH/designs/sesstale` and new child directory, expected no move/addition. Both are real assertion failures, not fixture setup failures.

Fresh restored raw output:

```text
R1 evidence: {"moves":0,"isolationWrites":0,"newPaths":[]}
✔ R1 current panel cannot arm delayed already-loaded old plugin after harness rejection (5.382042ms)
R2 evidence: {"moves":0,"inventoryUnchanged":true}
✔ R2 refresh actual old disk artifact ignores stale and late requests without altering root or legacy fixtures (8.742541ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 128.364125
```

## Earlier bounded adversarial runs

Directory: `<repo root>`.

| Command | Exit | Result |
|---|---:|---|
| `npm test -- tests/root-workspace-breaker.test.ts` (initial fixtures) | 0 | 2 pass, duration 20220.97875 ms; SDK subscription timer exposed as fixture overhead. |
| `ROOT_WORKSPACE_BREAKER_MUTANT=restore-isolation-write npm test -- --test-name-pattern='R1 ' tests/root-workspace-breaker.test.ts` (final payload/stubs) | 1 | 1 intentional assertion failure, 165.780208 ms. |
| `ROOT_WORKSPACE_BREAKER_MUTANT=keep-old-plugin npm test -- --test-name-pattern='R2 ' tests/root-workspace-breaker.test.ts` (final fixtures) | 1 | 1 intentional assertion failure, 168.385583 ms. |
| `npm test -- tests/root-workspace-breaker.test.ts` (restored after both mutants) | 0 | 2 pass, 0 fail/skips, 172.534209 ms. |
| `npm run typecheck` (after final test correction) | 0 | `tsc --noEmit`, no diagnostics. |
| SHA-256 comparison against `scope.md` snapshot | 0 | 9 checked, changed `{}`; elapsed 333.374 seconds after snapshot. |

Initial prototype mutants also failed on the intended relocation assertions; final results above supersede their approximate PUT payload and subscription overhead. Full suite intentionally not run, primary owns it.

## Final R1 neutralized raw assertion output

```text
R1 evidence: {"moves":1,"isolationWrites":1,"newPaths":[".design-studio","designs"]}
✖ R1 current panel cannot arm delayed already-loaded old plugin after harness rejection (7.77925ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1
ℹ skipped 0
ℹ duration_ms 165.780208

AssertionError [ERR_ASSERTION]: current delivery must not arm old plugin relocation, even when refresh fails
+ actual - expected
  {
+   isolationWrites: 1,
+   moves: 1,
+   newPaths: [ '.design-studio', 'designs' ],
-   isolationWrites: 0,
-   moves: 0,
-   newPaths: [],
    worktree: undefined
  }
at TestContext.<anonymous> (file://<repo root>/tests/root-workspace-breaker.test.ts:150:12)
```

## Final R2 neutralized raw fault excerpt

```text
R2 evidence: {"moves":1,"inventoryUnchanged":false}
✖ R2 refresh actual old disk artifact ignores stale and late requests without altering root or legacy fixtures (10.564167ms)
ℹ tests 1
ℹ pass 0
ℹ fail 1
ℹ skipped 0
ℹ duration_ms 168.385583

AssertionError [ERR_ASSERTION]: refresh/context must preserve root, existing child, screenshots and request bytes/paths
+ actual - expected
+ 'designs/sesstale': 'directory'
+ moves: [{
+   directory: '/private/var/folders/hx/6ykzfqb5519dsfc25bzxxrzc0000gn/T/opencode/root-workspace-breaker-jOkdUe/refresh-project-d96CIw/designs/sesstale',
+   sessionID: 'ses_stale_S'
+ }]
- moves: []
at TestContext.<anonymous> (file://<repo root>/tests/root-workspace-breaker.test.ts:195:10)
```

The raw fault excerpt omits unchanged inventory entries; the assertion checks the entire inventory, not just the shown child entry.

## Restored raw output

```text
R1 evidence: {"moves":0,"isolationWrites":0,"newPaths":[]}
✔ R1 current panel cannot arm delayed already-loaded old plugin after harness rejection (6.454292ms)
R2 evidence: {"moves":0,"inventoryUnchanged":true}
✔ R2 refresh actual old disk artifact ignores stale and late requests without altering root or legacy fixtures (8.597416ms)
ℹ tests 2
ℹ suites 0
ℹ pass 2
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 172.534209
```
