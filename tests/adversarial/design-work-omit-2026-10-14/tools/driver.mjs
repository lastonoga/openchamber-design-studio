// Breaker mutant driver. Every mutant is a narrow, explicitly named fault
// applied to a SCRATCH copy only. Per mutant: reset run/ from pristine/,
// apply exactly-once replacement, run the targeted tests expecting the named
// assertions to FAIL (red), restore, hash-verify against pristine, re-run
// expecting GREEN. Never touches the real project.
import { cpSync, rmSync, readFileSync, writeFileSync, existsSync, symlinkSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';

const S = path.dirname(new URL(import.meta.url).pathname);
// Repo root, derived from this file's own location: tests/adversarial/<run>/tools/.
const REPO = path.resolve(S, '../../../..');
const PRISTINE = path.join(S, 'pristine');
const RUN = path.join(S, 'run');
const LOGS = path.join(S, 'logs');
mkdirSync(LOGS, { recursive: true });

const PANEL_PATTERN = 'designWorkRows|renderer omits';
const PANEL_TEST = 'tests/panel-open.test.ts';
const MY_TEST = 'tests/adversarial/design-work-omit-2026-10-14/adversarial-designwork.test.ts';

const sha256 = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');

const MUTANTS = [
  {
    id: 'MA1-ignore-options',
    file: 'panel/api.ts',
    find: 'const omit = options.omitChatProjectIds ?? null;',
    replace: 'const omit = null;',
    why: 'the options parameter is accepted but never consulted',
    expectKill: ['omits a chat whose project is already listed', 'stays a list with projects alone', 'keeps projects-first order and recency', 'duplicate listed project ids'],
  },
  {
    id: 'MA2-fuzzy-match',
    file: 'panel/api.ts',
    find: 'if (omit?.has(chat.projectId)) continue;',
    replace: "if (omit && [...omit].some((id) => chat.projectId.toLowerCase().includes(id.toLowerCase()) || id.toLowerCase().includes(chat.projectId.toLowerCase()))) continue;",
    why: 'omission matches by substring/case instead of exact id',
    expectKill: ['never omits a chat with a missing project id', 'extends a listed id', 'differs only by case'],
  },
  {
    id: 'MA3-in-place-sort',
    file: 'panel/api.ts',
    find: 'const ordered = [...chats.rows].sort((a, b) => b.updatedAt - a.updatedAt);',
    replace: 'const ordered = chats.rows.sort((a, b) => b.updatedAt - a.updatedAt);',
    why: 'the newest-first sort reorders the caller\'s input array instead of a copy',
    expectKill: ['never mutates its inputs'],
  },
  {
    id: 'MA4-ascending-sort',
    file: 'panel/api.ts',
    find: '(a, b) => b.updatedAt - a.updatedAt',
    replace: '(a, b) => a.updatedAt - b.updatedAt',
    why: 'the recency sort runs oldest-first',
    expectKill: ['orders projects first, then chats by recency', 'keeps projects-first order and recency', 'equal updatedAt keep their snapshot order'],
  },
  {
    id: 'MA4b-hidden-tiebreak',
    file: 'panel/api.ts',
    find: 'sort((a, b) => b.updatedAt - a.updatedAt)',
    replace: 'sort((a, b) => b.updatedAt - a.updatedAt || (a.sessionId < b.sessionId ? -1 : 1))',
    why: 'a hidden sessionId tie-break reorders equal-timestamp chats',
    expectKill: ['equal updatedAt keep their snapshot order'],
  },
  {
    id: 'MA5-omit-empty-id',
    file: 'panel/api.ts',
    find: 'if (omit?.has(chat.projectId)) continue;',
    replace: 'if (omit?.has(chat.projectId) || (omit && !chat.projectId)) continue;',
    why: 'a chat with a missing projectId is collated away whenever an omit set is passed',
    expectKill: ['never omits a chat with a missing project id'],
  },
  {
    id: 'MA6-empty-bypass',
    file: 'panel/api.ts',
    find: "      rows.push({ kind: 'chat', chat });\n    }\n  }\n  if (rows.length === 0) return { kind: 'empty' };",
    replace: "      rows.push({ kind: 'chat', chat });\n    }\n  }\n  if (rows.length === 0 && !options.omitChatProjectIds) return { kind: 'empty' };",
    why: 'omission that empties the list no longer yields the empty state',
    expectKill: ['stays a list with projects alone'],
  },
  {
    id: 'MA7-precedence-swap',
    file: 'panel/api.ts',
    find: "  if (projects.kind === 'error') return { kind: 'error', message: projects.message };\n  if (chats.kind === 'error') return { kind: 'error', message: chats.message };",
    replace: "  if (chats.kind === 'error') return { kind: 'error', message: chats.message };\n  if (projects.kind === 'error') return { kind: 'error', message: projects.message };",
    why: 'the chats error outranks the projects error when both fail',
    expectKill: ['projects-source error still outranks'],
  },
  {
    id: 'MA8-skip-projects-error-with-opts',
    file: 'panel/api.ts',
    find: "if (projects.kind === 'error') return { kind: 'error', message: projects.message };",
    replace: "if (projects.kind === 'error' && !options.omitChatProjectIds) return { kind: 'error', message: projects.message };",
    why: 'an omit set silently swallows the projects-source error',
    expectKill: ['keeps every chat with no options', 'projects-source error still outranks'],
  },
  {
    id: 'MA8b-skip-chats-error-with-opts',
    file: 'panel/api.ts',
    find: "if (chats.kind === 'error') return { kind: 'error', message: chats.message };",
    replace: "if (chats.kind === 'error' && !options.omitChatProjectIds) return { kind: 'error', message: chats.message };",
    why: 'an omit set silently swallows the chats-source error',
    expectKill: ['chats-source error still takes'],
  },
  {
    id: 'MA9-inverted-predicate',
    file: 'panel/api.ts',
    find: 'if (omit?.has(chat.projectId)) continue;',
    replace: 'if (!omit?.has(chat.projectId)) continue;',
    why: 'the omission predicate is inverted: kept chats are omitted and vice versa',
    expectKill: ['omits a chat whose project is already listed', 'keeps every chat with no options', 'keeps projects-first order and recency', 'never omits a chat with a missing project id', 'duplicate listed project ids', 'equal updatedAt', 'extends a listed id', 'differs only by case', 'never mutates its inputs'],
  },
  {
    id: 'MM1-derive-from-all-projects',
    file: 'panel/main.ts',
    find: "  const listedIds = state.projects?.kind === 'list' ? new Set(state.projects.rows.map((row) => row.id)) : new Set<string>();",
    replace: '  const listedIds = new Set(allProjects.map((project) => project.id));',
    why: 'the omit set is derived from every known project, so a config-less project that dropped out of the rows loses its chats',
    expectKill: ['derives the omit set from the listed project rows only'],
  },
  {
    id: 'MM2-always-pass-opts',
    file: 'panel/main.ts',
    find: '    state.projectFilter ? undefined : { omitChatProjectIds: listedIds },',
    replace: '    { omitChatProjectIds: listedIds },',
    why: 'the omit set is passed even while the "Open sessions" filter is active, hiding that project\'s chats there',
    expectKill: ['derives the omit set from the listed project rows only', 'the renderer omits listed-project chats only in the unfiltered view'],
  },
];

function resetRun() {
  rmSync(RUN, { recursive: true, force: true });
  cpSync(PRISTINE, RUN, { recursive: true });
  if (!existsSync(path.join(RUN, 'node_modules'))) {
    symlinkSync(path.join(REPO, 'node_modules'), path.join(RUN, 'node_modules'));
  }
}

function failingTests(output) {
  const names = [];
  for (const line of output.split('\n')) {
    const m = line.match(/^✖\s+(.+?)\s*\(?[\d.]*m?s?\)?$/);
    if (m && m[1] && m[1] !== 'failing tests:' && !m[1].startsWith('test at')) names.push(m[1].trim());
  }
  return [...new Set(names)];
}

function runTests(args, cwd) {
  const r = spawnSync('node', args, { cwd, encoding: 'utf8' });
  return { exit: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

const results = [];
for (const mutant of MUTANTS) {
  const target = path.join(RUN, mutant.file);
  const pristineHash = sha256(path.join(PRISTINE, mutant.file));

  // --- RED: apply the mutant ---
  resetRun();
  const src = readFileSync(target, 'utf8');
  const count = src.split(mutant.find).length - 1;
  if (count !== 1) {
    results.push({ id: mutant.id, error: `find matched ${count} times (expected 1); mutant not applied` });
    continue;
  }
  writeFileSync(target, src.replace(mutant.find, mutant.replace));
  const red = runTests(['--test', '--test-concurrency=1', '--test-name-pattern', PANEL_PATTERN, PANEL_TEST], RUN);
  const redMine = runTests(['--test', '--test-concurrency=1', MY_TEST], RUN);
  const redNames = [...new Set([...failingTests(red.out), ...failingTests(redMine.out)])];
  const killed = mutant.expectKill.filter((needle) => redNames.some((n) => n.includes(needle)));
  writeFileSync(path.join(LOGS, `${mutant.id}.red.log`), `--- panel-open (pattern) exit=${red.exit}\n${red.out}\n--- adversarial exit=${redMine.exit}\n${redMine.out}`);

  // --- GREEN: restore from pristine, hash-verify, re-run ---
  resetRun();
  const restoredHash = sha256(target);
  const hashOk = restoredHash === pristineHash;
  const green = hashOk ? runTests(['--test', '--test-concurrency=1', '--test-name-pattern', PANEL_PATTERN, PANEL_TEST], RUN) : { exit: -1, out: 'skipped: hash mismatch' };
  const greenMine = hashOk ? runTests(['--test', '--test-concurrency=1', MY_TEST], RUN) : { exit: -1, out: 'skipped: hash mismatch' };
  const greenNames = failingTests(`${green.out}\n${greenMine.out}`);
  writeFileSync(path.join(LOGS, `${mutant.id}.green.log`), `--- restored hash ok=${hashOk} ---\n--- panel-open (pattern) exit=${green.exit}\n${green.out}\n--- adversarial exit=${greenMine.exit}\n${greenMine.out}`);

  results.push({
    id: mutant.id,
    why: mutant.why,
    redExit: [red.exit, redMine.exit],
    killed: killed,
    missedKills: mutant.expectKill.filter((n) => !killed.includes(n)),
    otherReds: redNames.filter((n) => !mutant.expectKill.some((k) => n.includes(k))),
    restoredHashOk: hashOk,
    greenExit: [green.exit, greenMine.exit],
    greenFails: greenNames,
  });
}
writeFileSync(path.join(S, 'mutant-results.json'), JSON.stringify(results, null, 2));
for (const r of results) {
  if (r.error) { console.log(`${r.id}: ERROR ${r.error}`); continue; }
  const verdict = r.killed.length > 0 && r.restoredHashOk && r.greenExit.every((e) => e === 0) && r.greenFails.length === 0 ? 'QUALIFIED' : 'PROBLEM';
  console.log(`${r.id}: ${verdict} | killed ${r.killed.length}/${r.expectKill.length} | missed=${JSON.stringify(r.missedKills)} | green=${r.greenExit} hashOk=${r.restoredHashOk}${r.greenFails.length ? ' GREENFAILS=' + JSON.stringify(r.greenFails) : ''}`);
}
