# Session status height implementation plan

> Test-first bounded reconciliation (iteration cap 2, latest delegation). Designer owns UI + implementation;
> the parent owns the final full check and adversarial pass. Not a git repository — no commits.

**Goal:** The compact session status row shows only the two controls, the session line and
the hint; the whole Brief & options block is gone (user-approved Option A); the Work Status
frame height is measured content (ResizeObserver → `host.setHeight`), never a constant,
never clipped.

**Files:** `panel/main.ts`, `panel/styles.css`, `tests/status-height.test.ts` (new),
`tests/panel-open.test.ts` (adapt the three `statusFormHost` source assertions + the row
test title). Manifest `statusSection.height` stays 84 (justified in the spec: it is only
the pre-measure initial; the first measured report corrects it).

**SDK reference (installed 2.2.0, verified 2026-10-13):** `API.md:163` — `setHeight`
clamped 24–320 for the Work Status frame, taller content scrolls inside; `API.md:251` —
manifest `height` is the pre-measure frame height; `contract.js:169-174` — client clamp
0–10000 + `Math.ceil`, no client-side error.

## Steps

- [x] 1. Reconcile `tests/status-height.test.ts`, run the baseline-reachable tests against the restored baseline
      and record the failures (fail-before): (a) a built status row must contain no
      `.ds-more`/`.ds-miniform`/brief nodes — baseline builds them; (b) the reported
      `setHeight` must equal the measured content height (fake rects) — baseline reports
      the constant 84; (c) dedupe, growth, surface guard, observer disconnect, and
      setHeight-rejection tolerance. The DOM recorder reuses the established
      `ComposerNode` pattern (no browser claims).
- [x] 2. Adapt `tests/panel-open.test.ts`: update the three `statusFormHost` source
      assertions (hidden-toggle line, append list, focus-guard line) and the row test
      title; add a doesNotMatch for `ds-miniform|ds-brief` in the row source.
- [x] 3. Reconcile `panel/main.ts`: the partial implementation had already deleted
      `renderStatusForm`; keep the existing `renderModeUi` refresh paths rather
      than recreating a redundant function. Delete `STATUS_HEIGHT`/`STATUS_EXPANDED_HEIGHT`; remove `statusFormHost`
      (variable, buildRow creation/append, renderRow hidden-toggle + focus-guard
      reference); remove the now-dead `fillBrief`/`row` helpers and the `TYPE_OPTIONS`
      import (page keeps FIDELITY_OPTIONS/DIRECTIONS/option); add
      `reportContentHeight` (ceil + inclusive ±1 dedupe + status-surface guard) and
      `observeRowHeight` (ResizeObserver on `.ds-statusmode`, disconnect superseded,
      `typeof ResizeObserver` guard for Node tests) wired at the end of `buildRow`;
      `setSurfaceHeight` catches host rejections.
- [x] 4. Implement `panel/styles.css`: drop the dead `.ds-more*`/`.ds-miniform*`/`.ds-sys`/
      `.ds-brief`/`.ds-statusmode .ds-status` rules; give `.ds-statusmode`
      `max-height: 320px; overflow-y: auto;` (SDK clamp, scoped to the status row).
- [x] 5. Run scoped tests + `npm run typecheck` (181/181; no full check — parent owns it).
- [ ] 6. Rebuild the scratch bundle (fixture 8471 `POST /rebuild`) and validate the real
      JS: matrix 320–2048 × stopped/running; long status/error wrap; resize
      narrow↔wide; ≤2 distinct resize heights in 5 s static; host ack applies the
      reported height to the frame (not the fixture default); >320 forced overflow
      scrolls inside the row; rail surface reports nothing; page composer unchanged;
      rerun the preserved interaction proofs (focus/Tab CDP, pending double-click,
      ON race, server-error states). Screenshots + JSON into the approved temp and
       `.openchamber/screenshots`; report exact SHAs and fail-before/pass-after.

## Bounded reconciliation outcome, 2026-10-14

Step 6 stays unchecked: all 16 matrix and 16 additional positive cases passed,
and overflow/focus negative controls detected their faults, but the touch-height
negative control did not neutralise `min-height:44px`. The aggregate browser run
is correctly red for an ineffective fixture injection, not a confirmed product
bug. Two iterations exhausted; report this narrow validation blocker to parent.
See spec's reconciliation evidence section for artifact names and verification limits.

Source-test adaptations also replace two removed helper markers (`renderStatusForm`
→ `renderModeUi`, removed `fillBrief` comment → references section), without
relaxing the assertions on registration refusal or control composition.
The browser pass found the toggle's UA keyboard outline weaker than the explicit
Start/Stop ring; the same existing focus rule now covers both row controls.
No Start/Stop, server state, safety, queued-stop or pendingOpen behavior changed.
