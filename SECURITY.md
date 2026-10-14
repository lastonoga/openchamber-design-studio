# Security Policy

## Reporting a vulnerability

Report suspected security issues **privately** through GitHub's private
vulnerability reporting: open the repository's **Security** tab and use
**Report a vulnerability** ("Privately report a security vulnerability"). This
keeps the report and any discussion out of the public issue tracker until a fix
is ready.

Please do not open a public issue for a suspected vulnerability. Include:

- what you were doing and what you observed,
- the affected component (see "In scope" below),
- reproduction steps or a proof of concept,
- the Design Studio version, your OpenChamber version, and your OS.

We will acknowledge your report, investigate, and coordinate a fix and
disclosure with you.

## Security-relevant surface

Design Studio is an OpenChamber extension, and it asks for trust. Stated plainly:

- It declares the **`prompt`** and **`sessions`** capabilities in its manifest.
  `prompt` can send messages into your session (which costs tokens and can run
  tools); `sessions` can list projects, worktrees and session states and create
  and open sessions across registered projects.
- Its **service binds a loopback HTTP port** (`127.0.0.1`) and authenticates
  requests with a **bearer token**. The service runs with your full user access
  and no sandbox.
- It **drives a real Google Chrome** (a chromeless `--app` window with a
  throwaway profile) **with your own user rights**, and injects scripts into the
  pages it opens, such as the Cmd/Ctrl-click pick script.

Treat it as you would any tool that runs code on your machine: install it only
from a source you trust.

## In scope

- The **service** (`service/`): its HTTP surface, bearer-token handling, request
  validation, and local process/filesystem behaviour.
- The **browser bridge** (`service/browser.ts`): Chrome launch arguments, CDP
  control, the screencast/input surface, and profile handling.
- **Injected scripts**: the pick script and any other code the service injects
  into a page it opens.

## Out of scope

- **OpenChamber itself** (the host application, the SDK, the extension runtime).
  Report those to the OpenChamber project at <https://openchamber.dev>.
- Issues in Google Chrome or the pages you ask Design Studio to open.
