# Design Studio session status height — remove the brief block, measure the row

Approved by the user on 2026-10-13 (Option A, "Убрать весь блок"): remove the ENTIRE
Brief & options block — the disclosure AND the Type/Fidelity/Direction selectors —
from the compact session status row and the rail row. The full creation page
(`page` surface) keeps its composer and brief field unchanged.

## Problem (measured, fixture 8471 evidence in this folder's runs)

The chat Work Status section is an iframe the host sizes from `host.setHeight`.
The panel reports two hardcoded constants (`panel/main.ts:333,335`): 84 compact,
320 expanded — never a measurement. The installed SDK clamps the status frame to
24–320 (`@openchamber/sdk/API.md:163` — "The Work Status section sizes its frame
to it, clamped to 24–320; taller content scrolls inside"; manifest `height`
(24–320) is the pre-`setHeight` frame height, API.md:251). Measured content:

- Expanded: 339.4px (1280) / 353.4px (768) / 369.3px (390) / 385.3px (320) against
  the 320 ceiling → 19–65px silently clipped; the user reported "не хватает 40–50
  пикселей" (exact match at 390).
- Compact: 113.6px (desktop) / 127.6px (touch ≤768, 44px controls) against 84 →
  the hint line is cut mid-glyph and the whole "Brief & options" summary is below
  the fold.
- The SDK's "taller content scrolls inside" fallback is defeated by
  `panel/styles.css` `body { overflow: hidden; }`, so nothing scrolls — it clips.

## Approved experience

The compact status row carries EXACTLY: the Start/Stop preview
icon button and the Design Mode toggle (side by side, same height), the one-line
session status, and the ⌘/Ctrl-click hint. No `.ds-more` disclosure, no
`.ds-miniform`, no brief textarea, no Type/Fidelity/Direction selectors, no
"Fill composer with brief" button. The creation page composer is unchanged.
The actual rail surface remains its existing one-line sidebar pointer, not a
second control row; it contains no brief block and sends no height reports.

Saved mode/brief values are NOT wiped: `state.mode` (type/direction/fidelity/
brief) continues to load from and persist to `mode/<sessionId>` storage exactly
as before; `/design <brief>` and the page composer still use them.

## Height contract

- The row's real content height is MEASURED, never assumed: a ResizeObserver on
  `.ds-statusmode` (the content-sized section root — NOT the `height:100%`
  body/#root, which would feed the frame's own height back into the report)
  reports `Math.ceil(borderBoxHeight + externalVerticalMargins)` on change,
  deduped at ±1px (inclusive). The border box includes padding and borders;
  external margins belong to the row and body, not the body's full-height rect.
- `setSurfaceHeight` keeps its status-surface-only guard (the rail panel owns its
  height; the page is untouched) and swallows host rejections — a teardown-time
  refusal must never surface as an unhandled rejection, and a failed report is
  not retried eagerly (the next observed size change reports again; no flood).
- Superseded observers disconnect: only the newest mounted row observes.
  The callback captures the observed content root and mount generation, so even
  a notification queued before disconnect cannot measure a replacement row.
- Defensive bound: `.ds-statusmode` itself is capped at the SDK's 320px
  (`max-height: 320px; overflow-y: auto`) — scoped to the status row (the class
  only exists on that surface). After the brief removal the measured content is
  ~85px (desktop) / ~98px (touch), far below the cap; the bound only matters if
  something unforeseen (giant zoom, font fallback) pushes past 320 — then the
  row scrolls inside the SDK-clamped frame instead of clipping. No arbitrary
  +50px anywhere.
- `package.json` `statusSection.height: 84` stays: it is only the pre-measure
  initial height (SDK API.md:251) and the first measured report corrects it
  within one tick; no manifest change is justified.

## Non-goals / preserved

Start/Stop contract, safety/pending sequences, ON-toggle pendingOpen guard,
server-error/unknown states, focus-transfer behavior — all untouched. No new
  dependencies. No service/browser/canvas/SDK changes.

## Reconciliation evidence (2026-10-14)

Reference remains the installed SDK API.md:163/251; no dependency or manifest change.
Scratch evidence folder:
`/private/var/folders/hx/6ykzfqb5519dsfc25bzxxrzc0000gn/T/opencode/session-height-reconcile/`.

- `fail-before.log`: both baseline-reachable tests fail on actual faults: a
  mounted brief disclosure exists; height calls are hardcoded 84. Baseline is
  scratch4 with only its deliberately neutralised directory guard restored.
- `scoped.log`, `typecheck.log`: 181/181 scoped tests pass; typecheck passes.
- `mutants.json`: 10/10 scratch mutations are red (dedupe, ceiling, disconnect,
  stale callback, rejection, retry flood, surface guard, margins, frame feedback,
  extra control). Production files were never neutralised.
- `ui.json`: disposable Chrome, real bundle, initial host frame 84, host applies
  reported heights. 16/16 width/state cases pass (320, 375, 390, 768, 1024, 1280,
  1440, 2048 × stopped/running): content 84.234375px desktop / 98.234375px narrow;
  frames 85/99px. Default body margin is 0, not an assumed external 6px.
  Controls match 30/44px heights; widths intentionally differ. Zero distinct
  height changes during each static five-second window.
- 16/16 additional browser cases pass: injected 6px body margins, wrapping and
  narrow/wide resize, >320px content reaching its end by internal scrolling,
  rail no reports, page composer/textarea present, double click, isolated toggle,
  hidden-focus fallback, service errors, delayed-persistence ON guard, actual
  keyboard Tab rings on both controls, genuine coarse-pointer 44px targets.
- Overflow and keyboard-ring scratch negative controls detect the faults.
  **Not fully verified:** the touch-height negative injection changed `height`
  but left the existing 44px `min-height` intact, so it did not create the fault.
  `ui.json` correctly remains aggregate-red for this fixture error. The two-pass
  reconciliation cap was reached; a corrected scratch injection needs the
  parent's follow-up, not another production change. No production defect is
  inferred from this ineffective negative control.
- Screenshots: `height-{stopped,running}-{390,1280}.png`; SHA list: `sha256.txt`.
  Final full check and mandatory adversarial pass remain the parent's responsibility.
