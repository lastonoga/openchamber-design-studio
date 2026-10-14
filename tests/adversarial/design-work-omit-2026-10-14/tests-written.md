# Tests written — adversarial-designwork.test.ts (9 tests)

File: tests/adversarial/design-work-omit-2026-10-14/adversarial-designwork.test.ts
Run on the original implementation: 9/9 pass (project-adversarial-green.log).
Every test qualified by fail-before/pass-after: the named scratch mutant turns the
assertion red, restoring the pristine bytes turns it green (see evidence.md).

| # | test (name as written) | intent / one failure reason | killer mutant(s) | gate |
|---|--------------------------|-----------------------------|------------------|------|
| T1 | with omit options a chats-source error still takes the merged error state | an omit set must not mask a chats-source failure; asserts the chats message itself | MA8b | PASS |
| T2 | with omit options a projects-source error still outranks a chats-source error | both sources failing with opts must surface the PROJECTS message (assert.equal, kills precedence swap) | MA7, MA8 | PASS |
| T3 | with omit options a loading source still holds the merged list loading, in both directions | opts must not bypass the loading short-circuit, chats-loading and projects-loading | MA8 | PASS |
| T4 | duplicate listed project ids keep both rows and omit their shared chats once | duplicate rows stay in workspace order; shared-id chat omitted once (kills ignore-options and inversion) | MA1, MA9 | PASS |
| T5 | the renderer derives the omit set from the listed project rows only, and passes it only unfiltered | source-level pin of main.ts lines 2864+2868: derivation from state.projects.rows, ternary `filter ? undefined : {omit...}`, nothing else passed as the set | MM1, MM2 | PASS |
| T6 | designWorkRows never mutates its inputs and returns a fresh list | frozen inputs survive the call (in-place sort throws on a frozen array); inputs deep-equal their pre-call clone; omit set undrained; fresh output array | MA3, MA9 | PASS |
| T7 | chats with equal updatedAt keep their snapshot order (the recency sort is stable) | ties resolve in snapshot order — no hidden tie-break, no reversal | MA4, MA4b | PASS |
| T8 | a chat whose projectId extends a listed id is kept (exact-id match only) | 'p1-x' is not 'p1': substring/prefix matching must not omit | MA2, MA9 | PASS |
| T9 | a chat whose projectId differs only by case is kept (exact-id match only) | 'P1' is not 'p1': case-insensitive matching must not omit | MA2, MA9 | PASS |

Note: an earlier draft of T6 carried a WRONG expectation (asserted a p1-projected
chat survives); the run against the original exposed the test bug, the test was
fixed, not the production code — the fixture error was a test error.

# Qualification of the 6 EXISTING new tests (tests/panel-open.test.ts)

| test (line) | targeted fault | killer mutant(s) observed red | gate |
|--------------|----------------|-------------------------------|------|
| L806 omits a chat whose project is already listed; unlisted kept | options ignored / predicate inverted | MA1, MA9 | PASS |
| L820 keeps every chat with no options, empty object or empty set | options/empty-set filters anyway; opts swallow the projects error | MA9, MA8 | PASS |
| L834 stays a list with projects alone; empty only when nothing survives | options ignored; omission breaks the empty state | MA1, MA6 | PASS |
| L850 keeps projects-first order and recency after omission | options ignored; sort ascending | MA1, MA4 | PASS |
| L871 never omits a chat with a missing project id | empty-id collated away; fuzzy match | MA5, MA2, MA9 | PASS |
| L881 the renderer omits listed-project chats only in the unfiltered view | opts passed while filtering | MM2 | PASS with GAP: does NOT kill MM1 (derivation unpinned) — covered by T5 (see candidates OBS-1) |

Pre-existing designWorkRows tests (L751, L764, L780, L790) also went red under
MA4/MA9 as expected — regression context, not part of the change's own evidence.
