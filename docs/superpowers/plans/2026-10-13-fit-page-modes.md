# Fit and Full-Page Canvas Implementation Plan

> For agentic workers: use scoped subagent-driven execution with evidence and review checkpoints.

**Goal:** implement the approved Fit/preset interaction contract and lightweight shadcn-style viewer controls.

**Architecture:** preserve the existing live iframe, private viewer and frame-scoped Browser adapter. Establish height mechanics with one isolated probe before choosing an implementation. Styling is independent and may proceed without changing geometry or bridge APIs.

**Tech stack:** existing TypeScript, inline HTML/CSS/JS, esbuild and owned Chrome/CDP fixtures; no new dependencies.

## 1. Parallel, disjoint preparation

- [ ] Designer edits only viewer control styles and focused tests, preserving DOM IDs, bridge methods, geometry, capture transactions and existing behavior until the runtime result is reviewed.
- [ ] Runtime lane writes one temporary experiment and full evidence under `.openchamber/fit-page-modes/research/height-probe.md`; return no more than 25 summary lines.
- [ ] Review the probe's actual observations. If full height cannot be safely supported, stop that lane and ask about the documented limitation; do not implement a guessed sizing loop.

## 2. Reconcile mode contract, then implement

- [ ] Define explicit layout state separate from camera fitting, document identity and verification's controlled viewport.
- [ ] Designer adds the five-choice UI, truthful control availability and supported Fit/page rendering interfaces.
- [ ] Backend owner adds scoped mode/measurement handling in its exclusive files, maintaining current authorization and rejecting stale mode/document updates.
- [ ] Record fault-specific fail-before/pass-after checks for Fit, long-page reachability, stable height and preserved native scrolling/picking.

## 3. Validate and review

- [ ] Use isolated TMPDIR before fixture Chrome launches; never invoke the global reaper against another lane's fixtures.
- [ ] Run focused source tests and typecheck, recording exact counts and any other-owner failures.
- [ ] Reconcile writers, then render all eight widths and five states with ordered gates. Inspect mandatory 390/1280/2048 and awkward widths.
- [ ] Run proportionate independent adversarial angles, a single breaker writer and triage only if new candidates are produced. No previously blocked security mutation work is restarted.
- [ ] Rebuild shared bundles and run `npm run check` only after the separately owned Start/Stop writer has finished.
- [ ] Report current source/fixture evidence separately from installed-host acceptance and physical gesture/screen-reader limits.
