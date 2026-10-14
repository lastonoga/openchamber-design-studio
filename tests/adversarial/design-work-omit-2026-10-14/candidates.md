# Candidates — handed to triage (triage decides; not labelled "bug")

## OBS-1 — test-coverage gap: the existing renderer source test does not pin the omit-set DERIVATION

Where: tests/panel-open.test.ts line 881-893 ('the renderer omits listed-project chats
only in the unfiltered view').

Observation: its second regex `/omitChatProjectIds:\s*listedIds/` only pins that a
variable NAMED listedIds is passed. Mutant MM1 — `const listedIds = new Set(allProjects.map(p => p.id))`
(derive from every known project instead of the listed rows) — leaves that test GREEN
while changing behavior: a config-less/legacy project that dropped out of the project
rows would lose its chats in the unfiltered view (the exact regression the change
claims to prevent). The new adversarial test T5 pins the derivation line itself and
goes red under MM1.

Minimal reproducer: apply tools/driver.mjs mutant MM1 to a scratch copy and run
`node --test --test-concurrency=1 tests/panel-open.test.ts` — L881 passes;
`node --test ... adversarial-designwork.test.ts` — T5 fails.
Suggested action for triage: keep T5, or fold its derivation regex into the suite.

## OBS-2 — api-level: an omit set containing '' would omit ''-projectId chats

Where: panel/api.ts line 668 (`omit?.has(chat.projectId)`).

Observation: exact-match semantics mean a Set that literally contains '' omits chats
whose projectId is ''. This is unreachable through renderDesignSection (listedIds comes
from ProjectRow.id values of the workspace snapshot) unless a registered project can
have an empty id. Recorded as a contract observation, not asserted as a defect.

Minimal reproducer (node, shim required):
  designWorkRows({kind:'list',rows:[projectRow('p1')]},
                 {kind:'list',rows:[{...chat projectId ''}]},
                 {omitChatProjectIds: new Set([''])})  -> list, [project]   (chat OMITTED)
  same call with new Set(['p1'])                       -> list, [project, chat] (kept)
Full transcript in the run session; repro snippet in scope of api.ts lines 660-674.

## Confirmed-clean surface (what this pass could NOT break)

All 17 attack-designer candidates verified against the actual code; none produced a
defect candidate. Explicitly attacked and held:
- exact-id omission (prefix A2, case A3, empty-id C16);
- state precedence under options (C11 both-errors message, C12, C13 both directions);
- empty-state collapse (C6, C7); ordering (C8, C9, ties A1); duplicates (C10);
- purity (C17); renderer wiring (C14; C15 via T5).
Adequacy: 9/9 new tests + 6/6 appended tests each killed by >=1 named mutant
(15 red/green pairs total across 13 mutants + equivalence probe), scratch-only,
hash-verified.
