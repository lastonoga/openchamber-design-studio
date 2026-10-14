# Screenshot shot list

Every file below is currently a **placeholder** committed so the README renders.
Replace each with a real capture at the stated size, then check the box. Use a
throwaway demo project and public, generic content in every frame — never your own
real work.

## Global rules — apply to every shot

**Must NOT be visible in any image:**

- API keys, tokens, bearer strings, `.env` contents, or any secret.
- Private or client project names, real names, emails, customer data.
- Other chats, other sessions, worktree names, or branch names that reveal
  unrelated work.
- Absolute home paths (`/Users/…`, `/home/…`) in any window title, breadcrumb,
  editor tab, or terminal prompt.
- The OpenChamber account/avatar, notification banners, or bookmarks bar.

**Capture method:** OpenChamber at a 1280×800 content area for desktop shots,
390×844 for the mobile shot. Crop to that exact size — do not scale up. Prefer the
light theme unless the shot specifically shows dark; keep one theme across the set.
Save as PNG (gif for the demo), no transparency, no shadow/mockup frame.

---

## hero-design-studio-1280.png

- **Size:** 1280×800 (desktop).
- **Must be visible:** the full-page Design Studio creation home — display
  headline, the prompt composer with its type chip, and the merged **"Your design
  work"** section below it containing at least one project row (framed-canvas icon)
  and one design chat row (speech-bubble icon).
- **Must NOT be visible:** any real chat title; the sidebar with unrelated
  sessions; the account menu.
- **Replace with:** a real capture of the creation page in a fresh, neutral demo
  project. This is the first image a reader sees — it should be the cleanest one.

## feature-design-mode-status-1280.png

- **Size:** 1280×800 (desktop).
- **Must be visible:** the chat's **Work Status** section with the Design Mode row
  — the Start/Stop control, the Design Mode toggle shown **on**, the session
  status, and the Cmd/Ctrl-click hint. Crop tight enough that the row is legible.
- **Must NOT be visible:** model or agent names that identify a personal setup;
  the message history above the row, if it contains a real project name.
- **Replace with:** the status row in a demo session, mode toggled on.

## feature-live-preview-pick-1280.png

- **Size:** 1280×800 (desktop).
- **Must be visible:** the **real Chrome `--app` window** showing a running dev
  server (no tab strip, no omnibox), with the OpenChamber Design Studio workspace
  visible beside it so the relationship is clear.
- **Must NOT be visible:** the Chrome profile avatar, other browser windows,
  bookmarks, or the macOS desktop behind it revealing personal files.
- **Replace with:** a full-screen capture arrangement showing the chromeless window
  and the workspace together.

## feature-pick-to-reference-1280.png

- **Size:** 1280×800 (desktop).
- **Must be visible:** a picked element as a **reference chip** on the chat
  composer, with its selector and captured styles legible, and the live window
  nearby.
- **Must NOT be visible:** the element's page URL if it contains a private hostname
  or an absolute path; any token in a query string.
- **Replace with:** pick a harmless element (a button or heading) in the demo
  project and capture the resulting chip.

## feature-harness-rules-1280.png

- **Size:** 1280×800 (desktop).
- **Must be visible:** the generated `.opencode/plugin/design-studio-harness.ts`
  open in an editor, with the harness content readable — designer identity,
  design-system authority, and the verification protocol / mandate.
- **Must NOT be visible:** the absolute path to the file in a title bar or
  breadcrumb (crop it out or use a relative-path view); any other open file tabs.
- **Replace with:** an editor capture scrolled to the rules block.

## feature-design-system-presets-1280.png

- **Size:** 1280×800 (desktop).
- **Must be visible:** the **preset picker** open — design-system presets grouped
  by category, with their colour swatches, and the search field.
- **Must NOT be visible:** anything beyond the picker and its immediate context
  that could carry private data.
- **Replace with:** the picker in a demo project, scrolled to show at least two
  category groups.

## feature-project-config-1280.png

- **Size:** 1280×800 (desktop).
- **Must be visible:** the project's **`.design-studio.json`** shown beside (or
  within) the Design Studio workspace — its `url`, `type` and `harness` fields.
- **Must NOT be visible:** a `url` pointing at a private host, or an absolute
  filesystem path inside the JSON.
- **Replace with:** a demo config using `http://localhost:5200` and generic values.

## output-wireframe-1280.png

- **Size:** 1280×800 (desktop).
- **Must be visible:** a low-fidelity **wireframe** (boxes, labels, flows only) in
  the live preview.
- **Must NOT be visible:** final brand colours or a real company's logo.
- **Replace with:** the wireframe output of the demo checkout-flow session.

## output-hi-fi-1280.png

- **Size:** 1280×800 (desktop).
- **Must be visible:** a **high-fidelity** static screen — a pricing page or
  similar — with the full design system applied (tokens, type, colour).
- **Must NOT be visible:** invented metrics, testimonials, or logos presented as
  real.
- **Replace with:** the hi-fi output of a demo session.

## output-prototype-1280.png

- **Size:** 1280×800 (desktop).
- **Must be visible:** an **interactive prototype** running in the live preview —
  a dashboard with metrics, filters or charts, showing that it is live.
- **Must NOT be visible:** real analytics or data from a private system.
- **Replace with:** the prototype output of a demo session.

## output-deck-1280.png

- **Size:** 1280×800 (desktop).
- **Must be visible:** a **presentation deck** slide rendered in the preview, with
  its navigation and print layout visible.
- **Must NOT be visible:** real quarterly results or internal figures.
- **Replace with:** the deck output of a demo session, showing a generic slide.

## mobile-status-390.png

- **Size:** 390×844 (mobile).
- **Must be visible:** the Design Studio status row and composer reflowed for a
  narrow viewport.
- **Must NOT be visible:** horizontal overflow cut off mid-element (the shot should
  show a clean reflow, not a clipped layout); any personal data.
- **Replace with:** a real mobile-width capture; verify there is no horizontal
  scroll before saving.

## demo-pick-to-change.gif

- **Size:** 1280×800 (desktop).
- **Must be visible:** the full loop in motion — Cmd/Ctrl-clicking an element in the
  live window, the reference chip appearing on the composer, and the agent editing
  the page as the preview updates.
- **Must NOT be visible:** cursor moving over secrets; a real project or chat name;
  a pause long enough to read private content.
- **Replace with:** a short (5–15s) recording of the demo project, trimmed to the
  loop, looping cleanly. Keep the file modest — aim well under a few MB.
