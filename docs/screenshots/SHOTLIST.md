# Screenshot inventory

Three real captures are committed and used by the README. The remaining shots in
the capture plan are listed at the bottom — they are wanted, but nothing is
committed for them, so the README embeds only what exists.

## Global rules — apply to every shot

**Must NOT be visible in any image:**

- API keys, tokens, bearer strings, `.env` contents, or any secret.
- Private or client project names, real names, emails, customer data.
- Other chats, other sessions, worktree names, or branch names that reveal
  unrelated work.
- Absolute home paths (`/Users/…`, `/home/…`) in any window title, breadcrumb,
  editor tab, or terminal prompt.
- The OpenChamber account/avatar, notification banners, or bookmarks bar.

## Committed captures

### hero-design-studio-1280.png

The OpenChamber Design Studio creation home: display headline ("Let's create
Hi-fi screens"), the prompt composer with its design-system and type chips, the
working-directory selector, idea cards, and the merged **Your design work** list
with a design-ready project row (Open sessions / Preview). Dark theme.

### feature-design-mode-status-1280.png

The chat's Work Status panel with the **Design Mode** row: the Start control, the
toggle (shown OFF), the ⌘-click reference hint, and the surrounding session
panel (context, project, usage, MCP). Dark theme, 640 px wide.

### feature-live-preview-pick-1280.png

The real chromeless Chrome preview window with the Design Studio toolbar
(Fit / Desktop / Desktop Large / Tablet / Mobile, zoom controls) and a picked
element highlighted — the `h1 #hero-title` selector label above a blue element
outline.

## Capture plan (not yet captured)

Nothing below is committed. When one of these is captured, follow the same rules
above and embed it in the matching README section.

- `feature-pick-to-reference-1280.png` — a picked element as a reference chip on
  the chat composer, selector and captured styles legible.
- `feature-harness-rules-1280.png` — the generated
  `.opencode/plugin/design-studio-harness.ts` open in an editor, rules readable.
- `feature-design-system-presets-1280.png` — the preset picker open, presets
  grouped by category with colour swatches.
- `feature-project-config-1280.png` — the project's `.design-studio.json` beside
  the workspace, `url`/`type`/`harness` fields visible.
- `output-wireframe-1280.png`, `output-hi-fi-1280.png`,
  `output-prototype-1280.png`, `output-deck-1280.png` — one capture per design
  type produced by a demo session, in the live preview.
- `mobile-status-390.png` — the status row and composer reflowed at 390 px.
- `demo-pick-to-change.gif` — a short (5–15 s) loop of the full pick-to-change
  cycle; keep the file well under a few MB.
