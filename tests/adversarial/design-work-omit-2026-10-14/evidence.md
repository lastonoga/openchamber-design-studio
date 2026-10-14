# Evidence — fail-before / pass-after, per test (2026-10-14)

Method: each fault is a narrow, explicitly named mutant applied to a SCRATCH copy
(private/var/folders/.../T/opencode/breaker-omit-scratch/run, reset from a
hash-verified pristine copy for every mutant). The original working tree was never
edited, never reverted, never committed to. Red = the named test FAILS with the
mutant; green = after byte-identical restore (sha256), the same runs pass.

## Which property each mutant neutralises, and why it models the targeted fault

- MA1 (omit = null): the entire new option becomes dead — models "the merge forgot
  the omission". Kills every test that asserts a listed project's chat is ABSENT.
- MA2 (substring OR case-insensitive match): neutralises EXACT-id identity — the
  docstring's "exact-id match only". Kills T8 (prefix), T9 (case), L871 (empty id
  via `'p1'.includes('')`).
- MA3 (in-place sort of chats.rows): neutralises input purity — the caller's array
  is reordered. Kills T6 via the frozen-input throw AND the deep-equal input check.
- MA4 (ascending comparator): neutralises newest-first recency. Kills L764
  (pre-existing regression), L850, T7.
- MA4b (sessionId tie-break): neutralises stable-sort tie semantics. Kills T7 only.
- MA5 (`|| (omit && !chat.projectId)`): neutralises the "'' never collides" rule.
  Kills L871.
- MA6 (`&& !options.omitChatProjectIds` on the empty check): neutralises
  "empty only when nothing survives" once omission is active. Kills L834 (allGone).
- MA7 (error checks swapped): neutralises "the project snapshot's message first".
  Kills T2 (assert.equal on the message — kind alone would NOT catch it; the
  existing L820 error assertion only checks `kind`, which is why T2 exists).
- MA8 / MA8b (`&& !options.omitChatProjectIds` on each error check): models
  "options present short-circuit the state machine". Kills L820+T2 / T1.
- MA9 (inverted `!omit?.has`): neutralises the predicate's polarity; broad killer
  used as a second, independent kill for most omission tests.
- MM1 (listedIds from `allProjects`): neutralises "derivation from LISTED rows" —
  a config-less project's chats would vanish from the unfiltered view. Kills T5;
  does NOT kill L881 (documented gap, OBS-1).
- MM2 (always pass the omit set): neutralises "only in the unfiltered view" —
  the Open sessions filter would hide its own project's chats. Kills L881 + T5.

## Red/green table (full details in runs.md and logs/)

| test qualified | via mutant | red evidence (excerpt) | restore hash | green |
|----------------|-----------|------------------------|--------------|-------|
| L806 | MA1 | `✖ designWorkRows omits a chat whose project is already listed...` pass 8 fail 3 | ok | 0 fail |
| L806 | MA9 | red (predicate inverted) | ok | 0 fail |
| L820 | MA8 | `✖ designWorkRows keeps every chat with no options...` | ok | 0 fail |
| L820 | MA9 | red | ok | 0 fail |
| L834 | MA1 | red | ok | 0 fail |
| L834 | MA6 | `✖ designWorkRows stays a list with projects alone...` | ok | 0 fail |
| L850 | MA1 | red | ok | 0 fail |
| L850 | MA4 | red (ascending order) | ok | 0 fail |
| L871 | MA2 | red | ok | 0 fail |
| L871 | MA5 | red | ok | 0 fail |
| L881 | MM2 | `✖ the renderer omits listed-project chats only in the unfiltered view` | ok | 0 fail |
| T1 | MA8b | `✖ with omit options a chats-source error still takes...` | ok | 0 fail |
| T2 | MA7 | red (chats message surfaces instead of the projects message) | ok | 0 fail |
| T2 | MA8 | red | ok | 0 fail |
| T3 | MA8 | `✖ with omit options a loading source still holds...` | ok | 0 fail |
| T4 | MA1 | `✖ duplicate listed project ids keep both rows...` | ok | 0 fail |
| T4 | MA9 | red | ok | 0 fail |
| T5 | MM1 | `✖ the renderer derives the omit set from the listed project rows only...` | ok | 0 fail |
| T5 | MM2 | red | ok | 0 fail |
| T6 | MA3 | red (TypeError: frozen array sort) | ok | 0 fail |
| T6 | MA9 | red | ok | 0 fail |
| T7 | MA4 | red | ok | 0 fail |
| T7 | MA4b | red (tie-break reorders z9/a1) | ok | 0 fail |
| T8 | MA2 | red | ok | 0 fail |
| T9 | MA2 | red | ok | 0 fail |

Sample raw red output (MA1, panel-open pattern run):
  ✖ designWorkRows omits a chat whose project is already listed; an unlisted project keeps its chats
  ✖ designWorkRows stays a list with projects alone; empty only when nothing survives
  ✖ designWorkRows keeps projects-first order and recency after omission
  ℹ pass 8 / fail 3

## Equivalence probe (EQ1)

Omitting BEFORE the newest-first sort instead of after is behaviorally EQUIVALENT:
filter and a total-order stable sort commute, and tie order is preserved by both.
The probe mutant ran green on every designWorkRows test — it cannot be killed by any
behavioral assertion and is therefore NOT used as a kill for any test. The
spec-stated "after the sort" is unobservable by tests; the property that IS
observable (survivors keep newest-first order, ties keep input order) is pinned by
L850 + T7.

## Hash verification (originals untouched)

Baseline (before any run) == final (after all runs):
  c3b6256da159b29c16c73ef545e1ca95ba4028112eeaec740efff3fdbb57ac02  panel/api.ts
  097a73716356cebd3e3c34e1a5733bd7c64cf6f974baee749353382a2bc81669  panel/main.ts
  5639a80fe1c700fb55732c5809c90ebf69275252f0383829317faff689d5bd3b  tests/panel-open.test.ts
Scratch pristine copies carried the same hashes before each mutant run; each mutant
run restored them (restoredHashOk=true for all 13, in mutant-results.json).
