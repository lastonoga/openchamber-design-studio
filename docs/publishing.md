# Publishing and getting listed

Runbook for shipping OpenChamber Design Studio and getting it into the OpenChamber
extension directory.

**Data as of 2026-10-14.** Sources: <https://docs.openchamber.dev/sdk/>,
<https://docs.openchamber.dev/extensions/>, <https://openchamber.dev/extensions/>.
The directory and the submission process are run by the OpenChamber maintainers
and can change without notice — re-check the sources before you act on them.

## 1. Publish the repository on GitHub

Push the repository to GitHub and give it the topics below so people and the
maintainers can find it:

`openchamber`, `openchamber-extension`, `design`, `design-system`

## 2. No npm publish is needed

OpenChamber installs an extension from a **git URL, a folder, or a `.zip`** — not
from the npm registry. The extension is a folder OpenChamber copies and runs; no
package is fetched from npm.

This is also how updates work: for a git install, **bump `version` in
`package.json` and push**, and OpenChamber offers the update the next time the
user opens Settings → Extensions. Ship the **built** files (`panel/main.js`,
`service/main.js`) in the commit — OpenChamber never compiles extension code and
does not copy `node_modules` or TypeScript sources.

Remember to commit the rebuilt `panel/main.js` and `service/main.js` with every
source change (see CONTRIBUTING.md).

## 3. Tag releases when shipping a ZIP

If you distribute a `.zip` instead of a git URL, tag the release so people can
find a fixed version:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Folder and zip installs do **not** auto-update; a git install does.

## 4. Request the directory listing

The directory lives at <https://openchamber.dev/extensions/>. Admission is
**manual, by the maintainers**, and is **not guaranteed** — the criteria are
theirs, not ours. To ask, email `feedback@openchamber.dev` with the subject
`OpenChamber extension for the directory` and this body:

```text
Extension name: OpenChamber Design Studio
Repository URL: https://github.com/OWNER_PLACEHOLDER/openchamber-design-studio
Category: Tools
What it does: A design harness for OpenChamber. It brings your running app into
the chat as a live browser you can point at, and turns what you click into chat
references, so the agent changes the design while you watch. It ships Design
Mode, a live preview window, Cmd/Ctrl-click pick → chat reference, a
per-project harness plugin, a DESIGN.md / tokens.css preset catalog, project
scaffolding, and a .design-studio.json project config.
```

`Category` is one of `Tools`, `Usage`, `Themes`.

> **Maintainer note:** `OWNER_PLACEHOLDER` in the repository URL above must be
> replaced with the real GitHub owner before sending.

## 5. Reference docs

- Build an extension: <https://docs.openchamber.dev/sdk/>
- Install and update extensions: <https://docs.openchamber.dev/extensions/>
- Host API: <https://docs.openchamber.dev/sdk/host/>
- UI kit: <https://docs.openchamber.dev/sdk/ui/>
