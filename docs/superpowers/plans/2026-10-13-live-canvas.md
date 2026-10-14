# Live Canvas Implementation Plan

> **For agentic workers:** Execute the isolated lanes below with primary review between runtime boundaries. Use test-driven development and preserve red/green evidence.

**Goal:** Integrate the approved live canvas without changing artifact layout through window resize or camera controls.

**Architecture:** One Browser-owned loopback viewer shell and one live artifact iframe in the existing Chrome app target. Artifact-context CDP routing and transactional main-compositor screenshots keep agent operations separate from viewer chrome.

**Tech Stack:** Existing TypeScript/Node HTTP/CDP, Chrome and inline viewer HTML; no dependency additions. This checkout is not a git repository; no worktree/commit step applies.

## Task 1 — UI (designer, isolated files)

- [x] Create service/viewer-ui.ts and tests/viewer-ui.test.ts from the approved mockup.
- [x] Export renderViewerHtml({url,pages,viewport}), using a real iframe.src and safe JSON serialization.
- [x] Expose __dsCanvas methods setViewport, setStatus, setPage, getCamera, restoreCamera, dismissMenu and handleCanvasInput.
- [x] Send only ready, viewport, page and retry commands through __dsCanvasSend.
- [ ] Correct the temporary malformed form fixture, rerun its failed assertions, and review integrated rendering. Do not classify fixture quoting as a product defect.

Run: `node --test tests/viewer-ui.test.ts`. Expected: six passing tests after six fail-before cases. Production Browser integration remains required.

## Task 2 — Mechanic proof (runtime validator, temporary files)

- [x] Prove real cross-origin iframe viewport, input and frame-context isolation in owned Chrome.
- [x] Prove OOPIF evaluation/reload and demonstrate that OOPIF screenshot calls fail.
- [x] Capture exact artifact corner pixels using main compositor normalization; restore camera.
- [x] Observe an actual Vite WebSocket module update preserving document/input/viewport identity.
- [x] Observe CSP/XFO refusal without bypass.

Evidence: `.openchamber/live-canvas/probe-recommendation.md` and associated JSON/PNG. These are feasibility results, not production acceptance.

## Task 3 — Browser integration (fixer, exclusive runtime files)

Files: service/browser.ts, new service/viewer-server.ts and optional service/artifact-context.ts; service/browser-control.ts/service/verify.ts only when needed for viewport/camera restoration; new tests/live-canvas-browser.test.ts and tests/viewer-server.test.ts. Existing browser/provider tests may be adjusted only for the intentional shell-versus-artifact contract.

- [ ] Add failing actual-Browser assertions: selected desktop remains 1280 after native window resize, state/evaluate/probe report artifact, and capture excludes shell at a manual camera.
- [ ] Serve viewer only on loopback capability paths; reject wrong Host/path/method. Never serialize the host token.
- [ ] Launch one shell page target; enable frame/default-context tracking and flattened iframe autoattachment.
- [ ] Scope shell commands and artifact picks to their current session/context/frame identities; reject stale or unrelated frames.
- [ ] Route navigation, history, evaluation, highlights and probes to the artifact; map input once to the displayed iframe rectangle.
- [ ] Implement serialized screenshot normalization with unconditional restoration. Preserve artifact viewport/camera around verification and reject misleading ready state for blocked frames.
- [ ] Exercise reload/navigation/preset/manual camera, lifecycle cleanup and confirmed-page switching. Retain existing public Browser method signatures where possible.

Run: `node --test --test-concurrency=1 tests/live-canvas-browser.test.ts tests/viewer-server.test.ts tests/browser.test.ts tests/window.test.ts tests/provider.test.ts`. Expected: faults fail before integration, restored focused suite passes afterward. Record real PNG dimensions and fixture pixels, not only cached width fields.

## Task 4 — Independent adversarial review (primary-dispatched)

- [ ] Parallel read-only attack angles: frame identity/command forgery; camera/input/capture/navigation races.
- [ ] One breaker writer creates bounded regressions in disposable fixtures, demonstrates intended neutralizations fail and restored tests pass.
- [ ] Independent triage distinguishes real defects, bad fixtures, flakes and unresolved candidates. Fix confirmed in-scope defects before final certification.

## Task 5 — Reconcile and release verification (primary)

- [ ] Read produced source/tests/evidence and confirm writer scopes; reconcile the active user-owned Start/Stop changes before a final build.
- [ ] Run `npm run check` from the extension root and inspect exit code/counts.
- [ ] Render the integrated viewer at all eight widths and five states; measure overflow, token use, labels/contrast/targets, semantics and layout in order.
- [ ] Verify actual Browser artifact behavior, native input/picks, truthful unavailable states, real HMR and camera restoration; identify hardware-only checks left unverified.
- [ ] Stop UI fix/verify loops after five iterations or ten minutes unless the user authorizes another cycle. Never claim completion with a remaining P0.
- [ ] Report any needed extension-service reload; source/bundle edits do not automatically replace already-running code. Do not restart the host or mutate a user design session implicitly.
