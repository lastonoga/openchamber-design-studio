# Reference draft repair implementation plan

> **For agentic workers:** Follow test-first bounded implementation; writer lanes have disjoint files. Primary reviews artifacts and runs final validation.

**Goal:** Restore removable Studio reference chips and deliver retained accessible paths to the new design session.

**Architecture:** Studio owns the unsent draft; a small reference module handles deduplication and payload limits. The existing extension service validates explicit filesystem paths, while the designer integrates draft operations and rendering into the existing composer. No host API additions or registration/isolation changes.

**Tech Stack:** TypeScript, vanilla DOM, Node filesystem APIs, esbuild, Node test runner, existing OpenChamber SDK.

## Logic lane — fixer
- [ ] Own panel/reference-draft.ts, panel/api.ts reference validation wrapper only, service/project-files.ts reference resolver only, service/main.ts reference route only, tests/reference-draft.test.ts and tests/reference-path.test.ts.
- [ ] Before implementation record failing regressions proving full-path identity, relative source capture, no silent payload truncation, and nonexistent/directory/relative-escape rejection.
- [ ] Expose DraftReference = { id: string; kind: 'file' | 'project'; path: string; sourceDirectory: string; label: string }. Export addDraftReference(existing, reference), removeDraftReference(existing, id), buildReferenceSubmission(text, data, references) returning {text,data}; throw actionable errors above 16000 characters for either payload. Empty references retain original text/data.
- [ ] API validateReferencePath(dir, path) returns Promise<{path:string;sourceDirectory:string}>; service validates explicit relative/absolute paths, checks regular readable files, canonicalizes the returned path. Relative references must remain within the source project's real path. Absolute external files are explicit user selections and allowed. Reject empty/control-character paths; do not read bytes.
- [ ] Run new focused tests and typecheck, report exact files/results to primary. Do not edit main.ts, styles, existing panel tests or generate bundles while designer writes.

## UI lane — designer
- [ ] Own panel/main.ts, panel/styles.css, tests/mode-open.test.ts and tests/panel-open.test.ts. Read the approved spec and logic-lane API contract above.
- [ ] First reproduce missing-chips/new-session-delivery faults in meaningful regressions, then implement staged Studio reference state and one chip list. Keep live in-session picked-element host.attach unchanged.
- [ ] Page pasted paths call validateReferencePath; retain errors/input until success, deduplicate, focus correctly and announce additions/removals. Drop only explains pasted-path requirement. Keep Add available without URL for registered sources. Capture source at request time, avoid late response changing another draft.
- [ ] Use buildReferenceSubmission when starting a page design with references. Inspect result.sent/failure; preserve page and draft for failed/no-model. Prefer navigation:'preserve' until writes complete, open successful session last, without claiming first-turn isolation is fixed. Guard against repeat sends while pending.
- [ ] Update obsolete tests explicitly forbidding a chip list; add delivery/remove/failed-send/rerender regressions. Use existing visual tokens only. Do not change package manifest/service/reference module/api.
- [ ] Build/render after reconciliation; provide checks at every required width. Primary owns final evidence; no success claims from source-regex-only checks.

## Reconcile and verify — primary
- [ ] Read all writer changes and reject missing scope or unrelated changes.
- [ ] Run npm run check after both lanes reconcile; inspect exact pass/fail counts.
- [ ] Exercise actual panel/index.html and generated main.js in a parent SDK harness with a registered project and no preview URL: add same-basename paths, remove one, rerender/change preset, drop filename-only, send, fail send. Inspect first-message payload and original-composer attach calls.
- [ ] Verify actual browser render in order: overflow → tokens → accessibility → semantics → layout, at required widths. Do not treat browser tool as supplying automatic verification gates.
- [ ] Dispatch independent attack angles, then a single breaker writer and independent bug triage; only count confirmed defects with minimal reproduction and fail-before/pass-after evidence.
- [ ] Report remaining unsupported/unverified behavior honestly; rail hide is a host user preference, not an extension flag.

This directory is not a Git repository: no commit/worktree operation is applicable. User already selected the recommended local-draft design with pasted-path-only input; this plan executes that approved repair.
