# Design Studio — Design Mode spec (target)

Captured 2026-10-12 from the user's brief. This is the product target; the
implementation lags it deliberately and moves in phases (see the bottom).

## The experience

**Enter Design Mode → it asks what you want → it builds the right project → you
point, talk, and it changes — like Claude Design.**

1. **Ask first.** On entering Design Mode, the harness asks (≤5 questions,
   pre-filled defaults) what is being made: **wireframe**, **hi-fi screen(s)**,
   **interactive prototype**, **presentation deck**, or anything else — plus
   audience, real vs placeholder content, and brand source (infer / `DESIGN.md`
   / a reference). Never asks the user to pick a visual direction; it infers one.
2. **Pick the harness for the type.** Each artifact type maps to a template +
   craft rule set + fidelity:
   - *wireframe* → static HTML skeleton; structure and navigation only, no final
     colour or copy.
   - *hi-fi* → static HTML + `tokens.css` + `DESIGN.md`; full craft rules.
   - *interactive prototype* → a real app project (e.g. Vite + the chosen stack),
     a dev server, all five states, motion.
   - *presentation* → a deck (HTML slides) with its own nav/print contract.
3. **Build & launch.** The OpenCode agent scaffolds the files, installs
   dependencies and runs the dev server (it owns Bash); the extension shows the
   running app in its **browser surface**.
4. **Point → talk → change, loop.** Pick mode on: click an element → the panel
   attaches it to the chat as a **reference chip**; the user speaks (voice) or
   types what should change; send; the agent edits the files (tokens, design
   system, skills as needed); the browser hot-reloads. Repeat — point, say,
   point, say — like Claude Design.
5. **Voice.** Voice input is the host's composer voice (OpenChamber already
   records and transcribes in the chat box). The extension contributes the
   *reference* and pairs it with whatever the user said; it does not build its
   own microphone.

## Project config (`.design-studio.json`)

Every design project carries a small JSON config the **agent writes** when it
scaffolds the project — the user never sets it up. The extension reads it on
open and **auto-opens the URL**, building the rest around it. A **Config** button
in the dock shows/edits it.

Resolution order (first match wins): `.design-studio.json`, `design-studio.json`,
`design/.design-studio.json`.

```json
{
  "version": 1,
  "name": "My landing",
  "type": "prototype",
  "url": "http://localhost:5173",
  "command": "npm run dev",
  "entry": "index.html",
  "harness": { "direction": "auto", "fidelity": "hi-fi", "critiquePolicy": "required" }
}
```

`type` is `wireframe | hi-fi | prototype | deck | custom`. `url` drives the
auto-open. `entry` is for static types. `harness` mirrors the craft/direction
settings. The service reads and writes it, confined to the project, so the panel
needs no files capability.

## Ownership

**Extension owns:** the Design Mode wizard, mapping type → template/craft/skill
and assembling the brief, the live browser surface, reference chips
(`host.attach`), and detecting/showing the running app URL.

**OpenCode agent owns:** scaffolding files, `npm install` / `npm run dev`, all
file edits, and the content of skills/templates the harness selects.

## Constraints (verified)

- Guest iframes run under `default-src 'none'`: they cannot render a localhost
  dev server. Hence the extension drives its **own** headless Chrome via CDP and
  shows it on a host-drawn **surface**; that surface lives in a rail panel.
- A picked element reaches the chat only as an `AttachIssueRequest` chip: `text`
  is model context, `data` is opaque and echoed back to us. No custom chat UI.
- Voice is host-side; the SDK exposes no microphone.

## Phases

- **A1 (in progress)** Browser core: headless Chrome + CDP in the service, frames
  streamed to the surface, input returned to the page, control strip (address /
  Open / Pick) and the attach dialog; picks become chat references.
- **A2** Reference polish: richer selector anchors (`data-ds-id`), optional
  screenshot per reference, dedupe, keyboard shortcuts.
- **A3** Agent browser provider (`service.provides: ["browser"]`): the agent
  drives the same browser through the ten `browser.*` actions, so it can see and
  verify its own work.
- **A4** Design Mode wizard + launch orchestration: type picker → brief →
  scaffold + run; harness/template/skill selection per type; URL detection.
- **A5** Point + voice pairing: quick successive point/talk turns, auto-insert
  references, minimal friction before send.
