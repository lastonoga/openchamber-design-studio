# Live canvas preview

Approved interface: canvas-viewer-v5.html. Implementation authorized by the user after approving the mockup. Sources checked and runtime probes performed on 13.10.2026.

## Goal

Display one real development page in the existing chromeless preview window. The selected design viewport is independent of window size; zoom and pan change presentation, not responsive layout.

## Interface contract

- Compact top toolbar only; no bottom panel.
- Visible viewport radio buttons: Desktop 1280×800, Desktop Large 1920×1080, Tablet 768×1024, Mobile 390×844.
- Page chooser for multiple confirmed renderable URLs, not arbitrary source files. One page shows its title without a dead dropdown.
- Fit, 100%, zoom in/out, Pan, keyboard controls and non-drag pan alternatives.
- Fit recalculates on window resize. Manual camera persists through resize, reload and HMR.
- The toolbar does not scale with the page. Touch targets are at least 44px.
- Native page forms and scrolling work. Viewer gestures do not hijack page inputs or native app gestures. Cmd/Ctrl-click picks real artifact elements; viewer controls never become references.
- Loading, Empty, Error, Populated and Edge states remain truthful. iframe load alone does not establish readiness.
- Menus toggle, close outside/on Escape/selection, and return focus to their trigger, including clicks inside a cross-origin artifact.

## Runtime architecture

The existing Browser singleton owns an ephemeral loopback HTTP server serving only a fixed viewer shell. Chrome launches once at its private shell URL. The artifact retains its actual HTTP(S) URL inside a fixed-size live iframe; no HTML proxy, DOM clone or screencast is introduced.

Track shell and artifact CDP sessions, exact frame identity and default execution contexts separately. Reacquire artifact context after navigation/reload and support out-of-process iframes. Artifact URL/title, DOM evaluation, probes and picks must never resolve to the shell.

Agent pointer coordinates are artifact CSS pixels. Map them once through the iframe's displayed rectangle before main-session input dispatch. Native child events already contain child coordinates and must not be scaled again.

Artifact captures use the main compositor: actual Chrome rejects Page.captureScreenshot on an OOPIF. Serialize capture, temporarily normalize camera/container and shell metrics, clip the full unscaled artifact, then restore in finally. Captures exclude toolbar and canvas. Verification restores both the chosen artifact viewport and camera.

## Security and lifecycle

- A per-launch random capability is distinct from the host bearer. Never expose host credentials in shell HTML, URLs or artifact messages.
- Loopback only; exact Host, narrow paths/methods, no permissive CORS, no arbitrary filesystem or authenticated-service routes.
- No-referrer header/meta/iframe attribute. Restrictive shell CSP; preserve the artifact's CSP/X-Frame-Options. Blocked embedding produces an actionable unavailable state, not header stripping.
- Only the current shell default context may issue bounded ready/viewport/page/retry commands. Only the exact current artifact context may submit validated pick events; reject siblings, shell picks and stale contexts.
- Preserve singleton window close/focus/orphan-reaping behavior and cleanup owned resources. Do not stop external servers or modify user projects.

## Ownership and scope

- Designer: service/viewer-ui.ts and its new UI tests; approved design tokens remain authoritative.
- Browser integrator: Browser, private viewer server/context adapter and focused browser/provider tests.
- Primary: reconcile code, inspect artifacts, full checks and adversarial triage.
- Active user-owned Start/Stop work owns panel/*, service/main.ts and service/project-server.ts. Canvas writers must not edit those files or bundled outputs while that work is active.
- No fidelity/content-harness/root-workspace changes in this feature. No new dependencies or host changes.

## Evidence and acceptance

The inert-shell probe established fixed viewport, frame/context routing, native coordinate mapping, exact artifact PNG, embedding rejection and a real Vite accepted-module HMR update. This does not substitute for integrated Browser tests.

Integrated acceptance must prove singleton actual Browser operation, resize without accidental layout changes, intended preset changes, camera persistence, picking/input at multiple scales and pan offsets, navigation/reload/HMR, artifact-only snapshots/probes/captures, context forgery rejection, private-server boundaries and cleanup. Run the project's typecheck/build/test and adversarial fail-before/pass-after checks. Render the actual viewer at 320/375/390/768/1024/1280/1440/2048; inspect overflow → tokens → accessibility → semantics → layout. Report hardware gestures and any untested behavior explicitly.

## References

- https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/CSSOM_view/Viewport_concepts
- https://www.w3.org/TR/css-transforms-1/
- https://chromedevtools.github.io/devtools-protocol/
- .openchamber/live-canvas/probe-recommendation.md
- .openchamber/live-canvas/probe-mechanics.json
- .openchamber/live-canvas/probe-hmr.json
