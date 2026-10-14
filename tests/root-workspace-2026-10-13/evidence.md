# Adequacy and production preservation

## R1 — no isolation signal to already-loaded old code

Current self-contained fixture: `tests/root-workspace-2026-10-13/fixtures/design-studio-harness.before.txt`, resolved relative to test `import.meta.url`. Original provenance (not a runtime dependency):
`/private/var/folders/hx/6ykzfqb5519dsfc25bzxxrzc0000gn/T/opencode/root-workspace-plugin-UMihJx/design-studio-harness.before.ts`

SHA-256: `d1a68317fa1be2d922f5150d26367be1d0dd9483749412302b01833844e65504`.

Portable-fixture correction used patch to add the source verbatim. A byte comparison against the supplied backup returned `byte_equal: true`, with both files exactly **12762 bytes** and the same SHA-256 above. Final runtime-source check returned `test_uses_relative_fixture: true`, `test_mentions_disposable_fixture: false`. The test only copies/reads the ledger fixture; backup access was limited to provenance/hash verification.

The fixture is copied to scratch before setup; its real context callback stays registered through current delivery and failed `/harness`. Only then is S's context invoked. No source replica or recompiled historical logic is substituted.

Neutralization in scratch current panel: reintroduce a PUT after ancillary work using genuine historical payload shape independently read from immutable built baseline `reference-repair-harness/baseline/panel/main.js:1705–1708`: `/config`, query `{dir}`, body `{path,text}` containing S's timestamped request. Fake service records this real panel call and writes only that call's supplied file/text into scratch project; it does not independently generate an opt-in on the unmutated path.

Fault: one recorded PUT, one genuine old-plugin move callback, and actual new `.design-studio`/`designs` paths. Neutralized R1 exit 1, restored exit 0. This breaks the observable relocation fault, not a regex/source expectation.

## R2 — refresh real disk artifact and preserve fixture inventory

Start with that exact old marked source at actual scratch `.opencode/plugin/design-studio-harness.ts`; run production writer copied unchanged to scratch, then import the file it wrote. Neither expected disk bytes nor runtime behavior are computed from `harnessPluginSource()` in the test oracle.

Neutralization in scratch writer: replace its `const source = harnessPluginSource();` with the literal bytes read from the frozen genuine artifact. Existing disk source then remains old. Actual imported disk callback creates `designs/sesstale` and requests moving S into it. Neutralized R2 exit 1, restored exit 0. This is a targeted old-source/refresh neutralization, not the whole historical tree.

Fixture conservation is checked using file SHA-256 plus directory inventory captured before writer/context, excluding only the generated plugin whose content is intentionally refreshed. Expected late request addition is independently spelled out. Root app/config/package/server fixture, screenshots, legacy child/session JSON and both request files otherwise retain exact bytes/paths. No independent adequacy credit for handwritten refusal, late-request no-op or sibling behavior that old guards already satisfied; these are merged coverage within R2's demonstrated refresh fault.

## Restored verification

`npm test -- tests/root-workspace-breaker.test.ts` → exit 0, 2 pass, 0 fail, 0 skipped after both separate mutants failed. `npm run typecheck` → exit 0. No mutation tool installed or mutation percentage claimed.

Primary's existing `.openchamber/root-workspace/red.log` already captures historical core failures: stale request `1 !== 0` moves and panel PUT `true !== false`. It was read, not rewritten; new test adequacy independently uses the two targeted scratch mutants above.

## Production snapshot after

After SHA-256 values are exactly identical to the nine BEFORE entries in `scope.md`; comparison command reported `checked: 9`, `changed: {}` at +333.374 seconds. This includes main source/bundle, API/CSS, harness generator, service source/bundle, shared harness text and manifest. No production or existing test file was written. Fixture setup corrected once; verification stayed within five-cycle/ten-minute budget.

## Limits

- Historical source now lives as a repository-local `.txt` fixture, so the tests no longer depend on the externally retained disposable backup. Runtime imports occur only after copying its bytes into scratch `.ts` files; the historical file is not a production plugin and is not regenerated from current code. Cross-platform execution has not been run; existing Node/package prerequisites still apply.
- Session API is a recording adapter, not a real host session move; old plugin mkdir is real only inside scratch. No app server is started and no screenshot image is rendered; conservation concerns literal fixture bytes/paths, not process identity or pixels.
- Exact delayed callback schedule is deterministic, not an exhaustive concurrency exploration. Existing already-loaded old plugin armed by an unrelated pre-existing request is outside R1's unique-new-S setup; R2 covers requests after successful disk refresh, not replacement of a currently executing loaded plugin.
- Built bundles were hashed but not executed. Primary owns actual host, full suite, browser gates and final triage.

## Fresh portable-fixture verification

Both targeted mutants were run using the relative ledger fixture, then a fresh unmutated restore:
- R1 `restore-isolation-write`: exit 1, 194.49625 ms; actual `{moves:1,isolationWrites:1,newPaths:['.design-studio','designs']}`.
- R2 `keep-old-plugin`: exit 1, 199.657375 ms; actual move of `ses_stale_S` and added `designs/sesstale`.
- `npm test -- tests/root-workspace-breaker.test.ts`: exit 0, 2 pass, 0 fail/skips, 128.364125 ms.
- `npm run typecheck`: exit 0.
- Production SHA-256 recheck: 9 protected files, changed `{}`; identical to the BEFORE table in `scope.md` (also printed before this correction).

No production/bundle/full-suite or live-project operation performed for this correction.
