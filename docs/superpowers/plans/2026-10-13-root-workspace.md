# Root workspace repair — approved 13.10.2026

New design sessions use the selected registered design project itself as their workspace. Remove automatic isolation requests and generated mkdir/session-move hooks directly; optional isolation flags were rejected as unnecessary complexity. Preserve existing legacy child target resolution, harness rules and post-edit verification nudges. Do not migrate existing sessions or files, change fidelity, or add Documents/settings behavior.

Reference: current installed SDK `StartSessionRequest` selects `projectId`; no directory field is supported. Existing generator uses the verified v2 context/execute.after hooks, retained unchanged apart from relocation removal and root-policy text.

Test-first: execute generated plugin with a stale request fixture and exercise the real panel start flow with an explicitly selected registered root. Confirm failure before removal, then run focused Node tests and typecheck. Commands: `node --test --test-reporter=tap --test-concurrency=1 tests/harness-plugin.test.ts tests/panel-open.test.ts tests/mode-open.test.ts`; `npm run typecheck`. No bundles/fullcheck/commits; primary owns final review and rendering. At most five fix iterations or ten minutes.

After focused green, refresh only the owned generated `design-test-v2/.opencode/plugin/design-studio-harness.ts` via production `writeHarnessPlugin`; verify its marker first, retain byte/hash backup in the approved temp root outside the project, and compare app/config/legacy-child hashes before/after. Leave stale requests alone. No live session actions; existing loaded code may need restart, with no hotload claim.
