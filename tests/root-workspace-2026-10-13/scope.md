# Root-workspace breaker — 2026-10-13

Approved: new Studio sends stay in explicitly selected registered root; no isolation requests, new child workspace or automatic relocation. Existing children, sessions, screenshots and app files stay unchanged. No git metadata.

Attacked `panel/main.ts:527–598` (confirmed send/ancillary refresh), `service/harness-plugin.ts:53–116,127–157` (generated hooks/refresh writer); read existing `tests/mode-open.test.ts:471–498`, `tests/harness-plugin.test.ts` and primary `.openchamber/root-workspace/red.log`.

Writer scope: `tests/root-workspace-breaker.test.ts`, this six-file Markdown ledger, and the review-approved `fixtures/design-studio-harness.before.txt` containing the genuine historical source. Production and existing tests untouched. Executable fixtures/mutants are bounded scratch copies; the historical text is loaded repository-relative via `import.meta.url`, not from a disposable directory. No paid calls, network, real project/session operations or dependencies. Browser/layout gates not applicable to test-only writes; primary owns final validation. At most 2 focused tests, no full-suite rerun.

Initial SHA-256 snapshot (epoch 1791895555.1400478):

| Production path | Before SHA-256 |
|---|---|
| panel/main.ts | a4ca699c383139b090c60382456a98429f80ba15f9eb4e1a6418c13f976e9755 |
| panel/main.js | 5285ed6cb33ee4252416115291fd630516e5e5f3762906e871f5b30897f40346 |
| panel/api.ts | e1c02546989b97b7d0bff6771113af1a5f1d02363ca023aa89991da4057ddd6d |
| panel/styles.css | 0336cf7527e822140443b22c04f9d5b23ae83110cd45613af78b5898315df194 |
| service/harness-plugin.ts | 3b4f02ac601aad13ca573729260199e27c3de726458ed58dfdf1bdfdb42fb7cc |
| service/main.ts | 1ae13f40516348c98e6c8b8f648daa6bed3f6f3ed67c5a2bff891cb6ec99cd2a |
| service/main.js | ac7eb17dfb5efb63db1f0ed1d8b4c6cbddc5962cdbd2564cac6598ba39e9f5d6 |
| shared/harness-text.ts | eecf44b04dd9966020eddae69a88d38582ca23ee73d795dabf65eaf59746d6bd |
| package.json | b5742c194d1ee17dee6a7fb386b158bf36363392c9455e887340a42dcb4eb7a9 |
