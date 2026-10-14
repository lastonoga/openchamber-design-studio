# Nova toolbar visual adaptation

As of 2026-10-14. User approved the proposed Nova treatment. This is a CSS adaptation of official shadcn recipes, not installation of the React/Base UI components.

## Scope and journey

Keep the working viewer: compact top toolbar, required single-selection Fit/Desktop/Desktop Large/Tablet/Mobile choices, page chooser, camera controls, spinner and compatibility fallback. The user should recognize a coherent shadcn control family without relearning the viewer or changing the generated application.

Use connected outline/small viewport controls with a muted selected surface; outline/small page and zoom triggers; default/small Pan toggle; ghost/icon-small zoom buttons. Menus have consistent surface, compact rows, check indicators, muted explanations and separators. Hover, selected, focus and disabled states must remain distinct and accessible.

Reuse the existing neutral palette and modular type scale. Approved narrow control tokens may express Nova padding/radius/ring details; no new unrelated palette, typography or global theme. Preserve narrow-layout 44px targets and visible focus.

## Protected boundaries

- Change only styles/tokens in `service/viewer-ui.ts` and affected style tests.
- Preserve JavaScript, markup, IDs, APIs and bindings byte-for-byte.
- Do not change Fit, viewport qualification, loading, native scrolling, app CSS, camera mathematics or frame authority.
- No new dependency, React migration or competing shared build.
- The primary owns canonical build and final verification; the designer owns visual judgment.

## Zoom evidence and remaining clarification

The separate original-snapshot audit confirmed toolbar ±, canvas-focused plus and Pan Ctrl-wheel changed only the camera. Root viewport/DPR/visual viewport, toolbar size and artifact layout/font/breakpoint/document identity stayed unchanged.

That audit did not qualify percentage-menu hit/ack before three failed camera expectations; those are unconfirmed observations, not product defects. Native iframe Cmd/Ctrl chords and pinch remain unproven. These findings are preserved at `harness/canvas-toolbar/ses_ecee96391ffeCo0fe1ulZwWovl/2026-10-14-zoom-audit/`. Additional shortcut interception is not silently bundled into this CSS change.

## Evidence path

Freeze the original source/tests, qualify geometry/actual backgrounds/readiness before matrices, then run focused state checks followed by 320/375/390/768/1024/1280/1440/2048 renders. Check overflow, token usage, contrast/focus/targets, semantics and layout in that order. Use safe original-snapshot CSS fault controls; never neutralize the working checkout. Record exact commands, inputs, environment, exit, times and artifact hashes with declared limits.

Selected, hover, focus and disabled contrast must use the actual rendered backdrop. Menus must toggle, close outside/on Escape/selection, return focus and avoid layout shift. Percentage selection needs an independently visible hit and acknowledged camera outcome before interpretation.

Run final repository checks once writers and artifact validation are reconciled. Existing unresolved native integration findings are not retroactively marked resolved by this style task. Installed-service refresh and real-user runtime acceptance are separate claims.

## Primary references checked 14.10.2026

- https://ui.shadcn.com/r/styles/base-nova/button.json
- https://ui.shadcn.com/r/styles/base-nova/toggle.json
- https://ui.shadcn.com/r/styles/base-nova/toggle-group.json
- https://ui.shadcn.com/r/styles/base-nova/dropdown-menu.json
- Project harness `meta.md` and matched frontend/cross-domain sections.
