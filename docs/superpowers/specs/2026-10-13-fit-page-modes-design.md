# Fit and full-page canvas modes

Updated 2026-10-14. User approved the mode contract with “Да, делай”, then explicitly chose “Автовысота с fallback (Recommended)”. Normal loading is a simple spinner, not a large loading screen. References: current shadcn/ui introduction (`https://ui.shadcn.com/docs`), MDN CSSOM viewport concepts, and the isolated height probe recorded in `.openchamber/fit-page-modes/research/height-probe.md`.

## User contract

- Show five choices: Fit, Desktop, Desktop Large, Tablet, Mobile.
- Fit uses the available content area's width and height. The application responds to window resizing, the document scrolls normally, and the canvas does not pan.
- The four presets retain their selected layout width when the viewer window changes. Show the complete page height and navigate through the outer canvas rather than its main-document scrollbar.
- When a page's height does not stabilize, exceeds the supported bound, or cannot be resolved safely, preserve that preset's fixed width and nominal height with native document scrolling. Show an explicit viewport-fallback explanation; never silently claim full-page support.
- Preserve genuine scrolling and gestures in nested lists, textareas and maps.
- Keep Desktop as the initial choice; do not introduce an unrequested startup-default change.
- Name the camera's width-fitting action “Fit width”, distinct from layout mode Fit. Do not advertise width-only fitting while still fitting both dimensions.
- Retain page selection, compact top-only chrome, keyboard access and non-drag camera alternatives.
- Polish viewer buttons and menus in a shadcn-like style using existing CSS/tokens. No React migration, mandatory Tailwind, new dependencies, application restyling or source proxying.
- Normal loading uses only a small readable spinner and an accessible label. Keep the iframe laid out beneath it. After approximately 15 seconds, retain a concise fallback and Retry; errors/empty states remain actionable.

## Runtime proof before geometry edits

An iframe's layout height changes viewport-relative CSS and may cause repeated growth. One isolated Chrome probe must cover ordinary long content and a viewport-relative hero followed by content, in same-process and OOPIF contexts where supported. Record measured layout height, document height, rendered bounds and native interaction—not just a screenshot.

The completed probe established stable finite flow, viewport-height feedback and rejected child-only emulation. Implement bounded finite-page sizing with the approved explicit fallback, not generic auto-height. Do not silently clip content, conceal the scrollbar while leaving content inaccessible, rewrite application CSS, strip frame restrictions or substitute static screenshots. OOPIF native footer interaction must be validated through the actual Browser adapter; the standalone probe did not certify it.

## Preservation requirements

- Keep current frame/default-context identity checks and private shell authority unchanged.
- Retain ordinary input, HMR, metadata-only navigation, legitimate redirects, picking and failed-load recovery.
- Recompute supported page height after content changes without feedback loops; discard stale document/mode measurements.
- Captures and verification must still establish their requested artifact viewport and restore the user's layout mode, dimensions and camera, including failures.
- Preserve camera position through supported HMR updates; width-based presets must not become responsive merely because the window shrinks.

## Evidence and ownership

- Designer: exclusive `service/viewer-ui.ts` and its focused UI tests; all visual judgment and later UI mode integration.
- Runtime proof lane: temporary fixtures and `.openchamber/fit-page-modes/research/` only, no production edits.
- Backend owner is assigned after the geometry proof and UI/backend contract reconcile; no concurrent writes to designer files.
- Primary: artifact review, independent rendering/input checks and reconciled repository checks.
- The separate user-owned Start/Stop session owns `panel/*`, `service/main.ts`, project-server code and its tests. No edits or shared bundle builds while it is writing.
- Primary is the sole shared-build/final-verification owner for this work. New formal evidence uses `harness/fit-page-modes/ses_ecee96391ffeCo0fe1ulZwWovl/2026-10-14-modes-01/`, with command/cwd, relevant input/environment/dependency hashes, time, exit/status and artifact hashes. Concurrently changing inputs are unproven.

## Acceptance checks

1. Actual Fit iframe bounds equal the content area; native document scrolling works and camera pan has no effect.
2. Each supported preset retains its width through window resize; the first and last page content remain reachable through the canvas.
3. Content/HMR height changes stabilize; nested scrolling, native inputs and once-only picks remain correct.
4. Five-state renders at 320, 375, 390, 768, 1024, 1280, 1440 and 2048 pass overflow, tokens, labels/contrast/targets, semantics and layout gates in order.
5. Mode changes, capture failures and verification restore the intended mode/camera rather than a stale snapshot.
6. Tests counted as change evidence fail against absent/neutralized behavior and pass after repair; preserve unmodified safeguard evidence rather than manufacturing duplicate mutations.

Budget: at most five fix/verify iterations or ten minutes per bounded edit cycle, whichever occurs first. Report blockers and limits; do not silently extend the cycle or claim installed-host acceptance from fixtures.
