# Third-Party Notices

This project vendors a curated subset of design-system presets from the
**OpenDesign** project. The presets are redistributed here as a local,
typed catalog (`shared/design-systems.ts`) used by the Design Studio
preset picker.

- **Source repository:** https://github.com/nexu-io/open-design
- **Source directory:** `design-systems/`
- **License:** Apache License 2.0 (SPDX: `Apache-2.0`)
- **Upstream license file:** https://github.com/nexu-io/open-design/blob/main/LICENSE
- **Date fetched:** 2026-10-13

## What was ported

For each selected preset, the following were copied from OpenDesign and
transformed into a single TypeScript module:

- the **semantic design-token values** parsed from the preset's
  `tokens.css` `:root` block (mapped to a `tokens` record);
- the design-system **`name`, `category` and `description`** from the
  preset's `manifest.json`; and
- a **short excerpt** of the preset's `DESIGN.md`.

The names, token values, and design-system descriptions originate from
OpenDesign and remain under the Apache License 2.0. No upstream license
text or attribution was removed.

## License text

The full text of the Apache License 2.0 is included verbatim at:

- [`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt)

Copyright of the vendored material belongs to the OpenDesign authors and
its contributors. This project's own source is licensed separately (see
`package.json`).
