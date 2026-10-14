# Scope — adversarial pass over `designWorkRows` chat omission (2026-10-14)

Project: `<repo root>` (NOT a git repo; originals
hash-verified, all mutants applied to scratch copies only).

## The change under test

1. `panel/api.ts` — `designWorkRows(projects, chats, options?)` gained
   `options.omitChatProjectIds?: ReadonlySet<string>`
   (declaration lines 640-650, implementation lines 652-674):
   - state machine unchanged: `loading` if either source loads; `projects` error
     message wins over `chats` error; `empty` only when no row survives;
   - project rows first in workspace order; chat rows sorted newest-first on a COPY
     of `chats.rows` (`[...chats.rows].sort`, line 664);
   - omission AFTER the sort, exact-id match only (`omit?.has(chat.projectId)`, line 668);
   - `undefined` option, `{}` and an empty Set are all no-ops (`?? null`, line 660).
2. `panel/main.ts` — `renderDesignSection` (lines 2845-2892):
   - line 2864: `listedIds` derived from the LISTED project rows only
     (`state.projects?.kind === 'list' ? new Set(state.projects.rows.map(row => row.id)) : new Set()`);
   - line 2868: passes `state.projectFilter ? undefined : { omitChatProjectIds: listedIds }`
     — the "Open sessions" filtered view omits nothing and filters rows instead (line 2878-2880).
3. `tests/panel-open.test.ts` — 6 new tests appended after
   'designWorkRows honours the snapshot states' (lines 806, 820, 834, 850, 871, 881).

## Attacked surface

- `panel/api.ts` lines 640-674 (the new option + merge/filter logic) — runtime tests.
- `panel/main.ts` lines 2864-2868 (omit-set derivation and conditional passing) —
  source-level pins only: `renderDesignSection` is module-private and main.ts is DOM
  code; the suite's own convention for main.ts is source-text assertions
  (see tests/panel-open.test.ts lines 881-915).
- Contracts: exact-id omission, unchanged state precedence, empty-only-when-nothing-survives,
  projects-first + newest-first ordering, input purity, renderer wiring.

## Constraints honoured

- Originals never mutated; sha256 of panel/api.ts, panel/main.ts,
  tests/panel-open.test.ts identical before and after all runs (see evidence.md).
- tests/browser.test.ts and tests/provider.test.ts NOT run (user-confirmed
  pre-existing environment failures, out of scope).
- Commands run: `node --test --test-concurrency=1 tests/panel-open.test.ts`,
  `npx tsc --noEmit`, plus the adversarial file and scratch-mutant runs.

Environment: node v24.21.0, macOS (darwin), typescript 5.7.x via project devDependencies.
