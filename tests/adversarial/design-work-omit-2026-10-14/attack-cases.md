# Attack cases — design-work omission (2026-10-14)

Candidates C1-C17 came from the attack-designer lane (static claims); each was
verified against the ACTUAL code before trusting it. Angles added by this lane are
marked [added].

| id | angle | case | verdict against actual code |
|----|-------|------|------------------------------|
| C1 | behaviour | chat omitted when its projectId is listed | real; pinned by existing test L806 |
| C2 | behaviour | chat of a NOT-listed (config-less/legacy) project kept | real; pinned by existing L806 (p2 chat) |
| C3 | default | no options at all = unchanged merge | real; pinned by existing L820 |
| C4 | default | `{omitChatProjectIds: undefined}` no-op | real; pinned by existing L820 (`?? null`) |
| C5 | boundary | empty Set no-op | real; pinned by existing L820 |
| C6 | boundary | all chats omitted + projects non-empty = projects-only list | real; pinned by existing L834 |
| C7 | boundary | all chats omitted + projects empty = 'empty' | real; pinned by existing L834 (allGone) |
| C8 | ordering | projects-first order preserved after omission | real; pinned by existing L850 |
| C9 | ordering | omitted newest chat does not shift remaining recency order | real; pinned by existing L850 |
| C10 | input shape | duplicate project ids in the projects rows | [added] test `duplicate listed project ids...` |
| C11 | precedence | projects-error precedence WITH opts | partially pinned by L820 (kind only); [added] both-errors message test |
| C12 | precedence | chats-error precedence WITH opts | [added] test `chats-source error still takes...` |
| C13 | precedence | loading precedence both directions WITH opts | [added] test `loading source still holds...` |
| C14 | renderer | omit ids passed ONLY when `!state.projectFilter` | source-level; pinned by existing L881 + my T5 |
| C15 | renderer | ids derived from LISTED rows only (dropped config-less project's chats survive) | source-level; GAP found in L881 (see candidates OBS-1); closed by my T5 |
| C16 | boundary | chat with empty projectId never omitted | real; pinned by existing L871 |
| C17 | invariant | purity: frozen inputs not mutated, fresh output array | [added] test `never mutates its inputs...` |
| A1 | ordering [added] | equal updatedAt ties keep snapshot order (stable sort, no hidden tie-break) | [added] test `equal updatedAt...` |
| A2 | exactness [added] | projectId 'p1-x' (prefix of a listed id... extends it) kept | [added] test `extends a listed id` |
| A3 | exactness [added] | projectId 'P1' (case variant) kept | [added] test `differs only by case` |
| A4 | equivalence probe | omit-before-sort vs omit-after-sort mutant | EQUIVALENT mutant — no behavioral test can kill it; documented in evidence.md |

Not attackable at runtime (module-private DOM code): renderDesignSection body beyond
source pins. Not pursued (out of contract): NaN updatedAt, host-side id guarantees.
