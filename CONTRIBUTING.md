# Contributing to OpenChamber Design Studio

Thanks for helping improve Design Studio. This is an OpenChamber extension, so
the ground rules differ from a plain TypeScript project: OpenChamber never
compiles our code, and one entry must stay a classic script. Read this before
your first change.

## Requirements

- **Node 22 or newer.** The test suite runs TypeScript files directly through
  Node's type stripping, which Node 22 supports from 22.18 onward (CI pins
  `node-version: 22`). The build targets ES2020 (panel) and Node 20 (service).
- **OpenChamber ≥ 2.2.0** to load the extension (`openchamber.engines.openchamber`
  in `package.json`).
- **Google Chrome** at `/Applications/Google Chrome.app` for the two integration
  tests (see below). Set `DS_CHROME_PATH` to point elsewhere.

## Set up

```bash
npm install        # install devDependencies
npm run build      # compile panel/main.js and service/main.js
npm run check      # typecheck, then build, then the test suite
```

`npm run check` runs, in this order (`package.json`): `tsc --noEmit`, then
`node scripts/build.mjs`, then `node --test --test-concurrency=1`.

## Build outputs are committed

`panel/main.js` and `service/main.js` are **build outputs that ship in the
repository**, not generated artifacts:

- `panel/main.js` is the panel bundle: **a classic IIFE**, `platform: browser`,
  `target: es2020`. OpenChamber loads `panel/index.html` in a sandboxed iframe,
  so this file must stay an IIFE — an ES module will not run there.
- `service/main.js` is the local service bundle: Node ESM, `platform: node`,
  `target: node20`.

Both are produced by `scripts/build.mjs` (esbuild). **After any change to
`panel/`, `service/` or `shared/`, run `npm run build` and commit the rebuilt
`panel/main.js` and `service/main.js`.** A pull request whose source changed but
whose bundles did not is incomplete: OpenChamber runs the committed bytes.

## Tests

```bash
npm test           # node --test --test-concurrency=1
```

Two integration tests drive a **real** Chrome and are excluded from CI:

- `tests/browser.test.ts`
- `tests/provider.test.ts`

They need a local Google Chrome (`/Applications/Google Chrome.app`, or
`DS_CHROME_PATH`) and a **clean set of Chrome profiles** — a stale or locked
throwaway profile makes them fail for environment reasons, not because the code
regressed. Run the rest the same way CI does:

```bash
npm test -- $(find tests -name '*.test.ts' ! -name 'browser.test.ts' ! -name 'provider.test.ts' | sort)
```

Run the two Chrome tests locally when you work on `service/browser.ts` or the
provider, once your profiles are clean.

## Style expectations

These are visible in the repository's own configuration, and we keep to them:

- **TypeScript strictness.** `tsconfig.json` sets `strict: true` and
  `noUncheckedIndexedAccess: true`. New code must compile under both; do not
  weaken the config to land a change.
- **No emoji as icons.** The service lint (`service/lint.ts`, rule
  `anti-slop/emoji-icon`) and the injected harness both forbid emoji used as
  button/link icons — draw or pick a coherent icon set instead.
- **English-only copy.** User-facing strings and source comments are English.
  `panel/`, `service/`, `shared/` and `scripts/` are plain ASCII; keep them so.

## Committing

Keep the source and the rebuilt bundles in the same change, run `npm run check`
before you push, and describe what you verified and at which viewports when your
change touches the panel.
